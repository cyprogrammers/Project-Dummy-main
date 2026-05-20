"""
backend/services/otp_store.py
==============================
In-process OTP store for email-delivered MFA codes.

Why not TOTP?
  TOTP codes rotate every 30 seconds — far too short for email delivery
  latency. This module generates a random 6-digit code, records it with an
  explicit expiry timestamp, and invalidates it on first successful use
  (one-time use guarantee).

Storage strategy
  An in-memory dict keyed by user_id is used so no extra DB table or Redis
  instance is required. The dict is safe for a single-process uvicorn
  deployment. If you later need multi-process/multi-node support, swap the
  _store dict for a Redis backend (the public API is identical).

Thread / async safety
  All mutations go through asyncio.Lock so concurrent coroutines cannot
  race on the same user entry.

Usage
  from services.otp_store import otp_store

  code = await otp_store.create(user_id)          # generate & store
  ok   = await otp_store.verify(user_id, code)    # True once, then invalidated
"""

import asyncio
import random
import string
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Optional
import logging

logger = logging.getLogger("OTPStore")

# How long a generated code remains valid
OTP_TTL_MINUTES: int = 5
# How many digits in the code
OTP_LENGTH: int = 6
# Max consecutive failed verification attempts before the code is burned
MAX_ATTEMPTS: int = 3


@dataclass
class _OTPEntry:
    code:       str
    expires_at: datetime
    attempts:   int = 0

    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at

    def is_exhausted(self) -> bool:
        return self.attempts >= MAX_ATTEMPTS


class OTPStore:
    """Thread-safe, in-process OTP store."""

    def __init__(self) -> None:
        # { user_id: _OTPEntry }
        self._store: dict[int, _OTPEntry] = {}
        self._lock = asyncio.Lock()

    # ── Public API ────────────────────────────────────────────────────────────

    async def create(self, user_id: int) -> str:
        """
        Generate a new OTP for *user_id*, overwriting any previous pending code.
        Returns the plain-text code (pass to the email sender, never log it).
        """
        code = self._generate_code()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

        async with self._lock:
            self._store[user_id] = _OTPEntry(code=code, expires_at=expires_at)
            await self._purge_expired_unlocked()

        logger.info("OTP created for user_id=%s | expires=%s", user_id, expires_at.isoformat())
        return code

    async def verify(self, user_id: int, submitted_code: str) -> bool:
        """
        Verify *submitted_code* for *user_id*.

        Returns True and **deletes** the entry on success (one-time use).
        Returns False if:
          - no pending OTP exists for this user
          - the OTP has expired
          - the code does not match
          - MAX_ATTEMPTS has been reached (entry is burned)
        """
        async with self._lock:
            entry = self._store.get(user_id)

            if entry is None:
                logger.warning("OTP verify: no entry for user_id=%s", user_id)
                return False

            if entry.is_expired():
                del self._store[user_id]
                logger.warning("OTP verify: expired for user_id=%s", user_id)
                return False

            if entry.is_exhausted():
                del self._store[user_id]
                logger.warning("OTP verify: max attempts exceeded for user_id=%s", user_id)
                return False

            if not self._constant_time_compare(entry.code, submitted_code.strip()):
                entry.attempts += 1
                remaining = MAX_ATTEMPTS - entry.attempts
                logger.warning(
                    "OTP verify: wrong code for user_id=%s | attempts=%s remaining=%s",
                    user_id, entry.attempts, remaining,
                )
                if entry.is_exhausted():
                    del self._store[user_id]
                    logger.warning("OTP burned (max attempts) for user_id=%s", user_id)
                return False

            # ── Success ───────────────────────────────────────────────────────
            del self._store[user_id]
            logger.info("OTP verified and consumed for user_id=%s", user_id)
            return True

    async def invalidate(self, user_id: int) -> None:
        """Explicitly discard any pending OTP for *user_id* (e.g. on logout)."""
        async with self._lock:
            self._store.pop(user_id, None)

    async def has_pending(self, user_id: int) -> bool:
        """Return True if a valid (non-expired) OTP is waiting for this user."""
        async with self._lock:
            entry = self._store.get(user_id)
            if entry is None or entry.is_expired():
                return False
            return True

    async def time_remaining(self, user_id: int) -> Optional[int]:
        """Return seconds remaining, or None if no valid OTP exists."""
        async with self._lock:
            entry = self._store.get(user_id)
            if entry is None or entry.is_expired():
                return None
            delta = entry.expires_at - datetime.now(timezone.utc)
            return max(0, int(delta.total_seconds()))

    # ── Internals ─────────────────────────────────────────────────────────────

    @staticmethod
    def _generate_code() -> str:
        """Cryptographically random numeric OTP."""
        return "".join(random.SystemRandom().choices(string.digits, k=OTP_LENGTH))

    @staticmethod
    def _constant_time_compare(a: str, b: str) -> bool:
        """Timing-safe string comparison (prevents timing attacks)."""
        if len(a) != len(b):
            return False
        result = 0
        for x, y in zip(a, b):
            result |= ord(x) ^ ord(y)
        return result == 0

    async def _purge_expired_unlocked(self) -> None:
        """Remove stale entries. Must be called while the lock is held."""
        now = datetime.now(timezone.utc)
        expired = [uid for uid, e in self._store.items() if e.expires_at <= now]
        for uid in expired:
            del self._store[uid]
        if expired:
            logger.debug("OTPStore purged %s expired entries", len(expired))


# ── Module-level singleton ────────────────────────────────────────────────────
# Import this everywhere; do NOT instantiate OTPStore() yourself.
otp_store = OTPStore()
