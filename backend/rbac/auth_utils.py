"""
backend/rbac/auth_utils.py
==========================
JWT creation/validation, password hashing, session lifecycle helpers.
Works in async context (all DB calls use AsyncSession).
Supports dual auth: internal (HS256) and Keycloak (RS256 via existing keycloak.py).
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import pyotp
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, Request, status

import config as cfg
from rbac.models import (
    RBACActivityLog, ActivityAction, ActivityResult,
    RBACRole, RBACSession, RBACUser, UserStatus
)

# ─── Config ───────────────────────────────────────────────────────────────────
# Store in env vars for production
RBAC_SECRET_KEY         = cfg.__dict__.get("RBAC_SECRET_KEY",    "rbac-dev-hs256-secret-change-in-prod")
RBAC_REFRESH_SECRET     = cfg.__dict__.get("RBAC_REFRESH_SECRET","rbac-refresh-dev-secret-change-in-prod")
ALGORITHM               = "HS256"
ACCESS_TOKEN_EXPIRE_MIN = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
DEFAULT_TIMEOUT_MIN     = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Password ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_minutes: int = ACCESS_TOKEN_EXPIRE_MIN) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(minutes=expires_minutes), "type": "access"}
    return jwt.encode(payload, RBAC_SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), "type": "refresh"}
    return jwt.encode(payload, RBAC_REFRESH_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        p = jwt.decode(token, RBAC_SECRET_KEY, algorithms=[ALGORITHM])
        return p if p.get("type") == "access" else None
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        p = jwt.decode(token, RBAC_REFRESH_SECRET, algorithms=[ALGORITHM])
        return p if p.get("type") == "refresh" else None
    except JWTError:
        return None


# ─── MFA (TOTP) ───────────────────────────────────────────────────────────────

def generate_mfa_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str, issuer: str = "AITRMS") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def generate_backup_codes(count: int = 8) -> list[str]:
    return [secrets.token_hex(4).upper() for _ in range(count)]


# ─── Session helpers ──────────────────────────────────────────────────────────

def get_timeout_for_user(user: RBACUser) -> int:
    """Shortest timeout across all roles (most restrictive wins)."""
    timeouts = [r.settings.session_timeout_minutes for r in user.roles if r.settings]
    return min(timeouts) if timeouts else DEFAULT_TIMEOUT_MIN


async def create_session(
    db: AsyncSession,
    user: RBACUser,
    ip: Optional[str],
    user_agent: Optional[str],
    timeout_minutes: int = DEFAULT_TIMEOUT_MIN,
    auth_source: str = "internal",
) -> Tuple[RBACSession, str, str]:
    """Create a tracked session and return (session, access_token, refresh_token)."""
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=timeout_minutes)
    token_data = {"sub": str(user.id), "email": user.email}
    access  = create_access_token(token_data, min(timeout_minutes, ACCESS_TOKEN_EXPIRE_MIN))
    refresh = create_refresh_token(token_data)

    session = RBACSession(
        user_id=user.id, session_token=access, refresh_token=refresh,
        ip_address=ip, user_agent=user_agent, expires_at=exp, auth_source=auth_source,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session, access, refresh


async def terminate_session(
    db: AsyncSession, session: RBACSession,
    reason: str = "User logout", terminated_by: Optional[int] = None,
) -> None:
    session.is_active          = False
    session.terminated_at      = datetime.now(timezone.utc)
    session.termination_reason = reason
    if terminated_by:
        session.terminated_by = terminated_by
    await db.commit()


async def expire_stale_sessions(db: AsyncSession) -> int:
    """Mark timed-out sessions inactive. Returns count expired."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(RBACSession).where(
            RBACSession.is_active == True,
            RBACSession.expires_at < now,
        )
    )
    stale = result.scalars().all()
    for s in stale:
        s.is_active          = False
        s.terminated_at      = now
        s.termination_reason = "Session timeout"
    await db.commit()
    return len(stale)


# ─── Activity logging ─────────────────────────────────────────────────────────

async def log_activity(
    db: AsyncSession,
    action: ActivityAction,
    result: ActivityResult,
    actor: Optional[RBACUser] = None,
    target_user: Optional[RBACUser] = None,
    role=None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    session_id: Optional[int] = None,
) -> RBACActivityLog:
    entry = RBACActivityLog(
        actor_id         = actor.id if actor else None,
        actor_email      = actor.email if actor else None,
        target_user_id   = target_user.id if target_user else None,
        target_user_email = target_user.email if target_user else None,
        role_id          = role.id if role else None,
        role_name        = role.name if role else None,
        action=action, result=result, details=details,
        ip_address=ip_address, session_id=session_id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


# ─── Request helpers ────

def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


# ─── FastAPI dependency ─────────

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends
from db.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_rbac_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> RBACUser:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials:
        raise exc
    token   = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise exc

    await expire_stale_sessions(db)

    # Validate session is still active in DB
    result = await db.execute(
        select(RBACSession).where(
            RBACSession.session_token == token,
            RBACSession.is_active == True,
        )
    )
    session = result.scalars().first()
    if not session:
        raise exc

    # Fetch user with role settings so we can compute the inactivity timeout
    from sqlalchemy.orm import selectinload
    user_result = await db.execute(
        select(RBACUser)
        .where(RBACUser.id == int(payload["sub"]))
        .options(selectinload(RBACUser.roles).selectinload(RBACRole.settings))
    )
    user = user_result.scalars().first()
    if not user:
        raise exc
    if user.status == UserStatus.suspended:
        raise HTTPException(403, "Account suspended")
    if user.status == UserStatus.locked:
        raise HTTPException(403, "Account locked")

    # Slide the session expiry window: each request resets the countdown
    now = datetime.now(timezone.utc)
    timeout_minutes = get_timeout_for_user(user)
    session.last_activity = now
    session.expires_at = now + timedelta(minutes=timeout_minutes)
    await db.commit()

    return user