"""
Control Effectiveness Engine
============================
Derives per-control effectiveness scores from live activity-log statistics
and the latest rule-based GDPR / POPIA / ISO 27001 evaluations.
Exposed as GET /api/v1/controls/effectiveness.
"""

import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from db.database import AsyncSessionLocal
from rbac.models import RBACActivityLog
from core.iso27001_evaluator import _gather_stats as _gather_stats_iso
from core.gdpr_evaluator import _rule_based_report as _gdpr_rule
from core.popia_evaluator import _rule_based_report as _popia_rule
from core.iso27001_evaluator import _rule_based_report as _iso_rule

logger = logging.getLogger("ControlsEffectiveness")

controls_router = APIRouter(prefix="/api/v1/controls", tags=["Controls"])


class ControlMetric(BaseModel):
    id: str
    name: str
    domain: str
    framework: str
    effectiveness: int
    status: str
    last_assessed: str


class ControlsReport(BaseModel):
    assessed_at: str
    window_hours: int
    gdpr_score: int
    popia_score: int
    iso_score: int
    controls: List[ControlMetric]


def _status(pct: int) -> str:
    if pct >= 85:
        return "Passing"
    if pct >= 65:
        return "Degraded"
    return "Failing"


def _clamp(v: int, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, v))


async def _get_retention_days() -> int:
    """Returns how many days back the oldest audit log goes (capped at 365)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(func.min(RBACActivityLog.timestamp)))
        oldest = result.scalar()
    if oldest is None:
        return 0
    if oldest.tzinfo is None:
        oldest = oldest.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - oldest
    return min(365, max(0, delta.days))


@controls_router.get("/effectiveness", response_model=ControlsReport)
async def get_controls_effectiveness():
    """
    Computes live control effectiveness scores by analysing the last 24 h of
    activity logs and running the rule-based GDPR / POPIA / ISO 27001 scorers.
    Safe to poll — no LLM is invoked, all computation is deterministic.
    """
    stats = await _gather_stats_iso(hours=24)

    # Run rule-based evaluators (fast — no LLM, pure computation)
    gdpr_report  = _gdpr_rule(stats)
    popia_report = _popia_rule(stats)
    iso_report   = _iso_rule(stats)

    gdpr_score  = gdpr_report.overall_score
    popia_score = popia_report.overall_score
    iso_score   = iso_report.overall_score

    fl            = stats["failed_logins"]
    lockouts      = stats["auto_lockouts"]
    mfa_rate      = stats["mfa_adoption_rate_pct"]
    perm_updates  = stats["permission_updates"]
    role_changes  = stats["role_changes"]
    session_kills = stats["session_kills"]
    total_events  = stats["total_events"]

    retention_days = await _get_retention_days()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ── Per-control score formulas ──────────────────────────────────────────

    # AC-001: Access Control Enforcement
    # Measures whether failed logins are being blocked (lockouts triggered).
    ac001 = 100 if fl == 0 else _clamp(round(50 + (min(lockouts, fl) / fl) * 50), 40)

    # AC-002: Least Privilege Principle
    # Excessive permission/role changes indicate privilege creep.
    ac002 = _clamp(100 - perm_updates * 5 - role_changes * 2, 40)

    # AUTH-001: Multi-Factor Authentication Coverage
    # Directly mirrors the live MFA adoption rate across all users.
    auth001 = _clamp(round(mfa_rate))

    # AUTH-002: Failed Login Detection
    # High if no failures or if every failure triggered a lockout response.
    auth002 = 95 if fl == 0 else _clamp(round(60 + (min(lockouts, fl) / fl) * 40), 50)

    # LOG-001: Tamper-Evident Audit Logging
    # 100 when events are actively flowing into the log; degrades if silent.
    log001 = 100 if total_events > 0 else 50

    # LOG-002: Log Retention (target = 12 months / 365 days)
    log002 = _clamp(round((retention_days / 365) * 100))

    # DATA-001/002: Encryption — infrastructure controls not measurable from
    # activity logs; held at strong static baselines.
    data001 = 90
    data002 = 95

    # DATA-003: Data Minimisation
    # Proxied from the GDPR Art.5 evaluation score (Art.5 directly governs
    # purpose limitation and data minimisation).
    data003 = _clamp(gdpr_score - 15, 40)

    # INC-001: Incident Detection & Alerting
    # Rises when security response events (lockouts, session kills) are present.
    detection_events = lockouts + session_kills
    inc001 = _clamp(70 + detection_events * 3, 60) if total_events > 0 else 60

    # INC-002: Breach Notification SLA (72h)
    # Proxied from GDPR overall score — GDPR evaluates Art.33 breach reporting.
    inc002 = _clamp(gdpr_score - 5, 40)

    # PRIV-001: Privileged Access Management
    # Penalises frequent unexplained role changes and excess session kills.
    priv001 = _clamp(95 - role_changes * 4 - max(0, session_kills - 2) * 5, 40)

    controls: List[ControlMetric] = [
        ControlMetric(id="AC-001",   name="Access Control Enforcement",    domain="Access Control",       framework="ISO A.9 · GDPR Art.32",      effectiveness=ac001,   status=_status(ac001),   last_assessed=today),
        ControlMetric(id="AC-002",   name="Least Privilege Principle",     domain="Access Control",       framework="ISO A.9 · POPIA Cond.7",     effectiveness=ac002,   status=_status(ac002),   last_assessed=today),
        ControlMetric(id="AUTH-001", name="Multi-Factor Authentication",   domain="Authentication",       framework="ISO A.9 · GDPR Art.32",      effectiveness=auth001, status=_status(auth001), last_assessed=today),
        ControlMetric(id="AUTH-002", name="Failed Login Detection",        domain="Authentication",       framework="ISO A.9 · GDPR Art.32",      effectiveness=auth002, status=_status(auth002), last_assessed=today),
        ControlMetric(id="LOG-001",  name="Tamper-Evident Audit Logging",  domain="Audit Logging",        framework="ISO A.12.4 · GDPR Art.5",    effectiveness=log001,  status=_status(log001),  last_assessed=today),
        ControlMetric(id="LOG-002",  name="Log Retention (12 Months)",     domain="Audit Logging",        framework="ISO A.12.4",                 effectiveness=log002,  status=_status(log002),  last_assessed=today),
        ControlMetric(id="DATA-001", name="Encryption at Rest",            domain="Data Protection",      framework="ISO A.10 · GDPR Art.32",     effectiveness=data001, status=_status(data001), last_assessed=today),
        ControlMetric(id="DATA-002", name="Encryption in Transit (TLS)",   domain="Data Protection",      framework="ISO A.10 · GDPR Art.32",     effectiveness=data002, status=_status(data002), last_assessed=today),
        ControlMetric(id="DATA-003", name="Data Minimisation",             domain="Data Protection",      framework="GDPR Art.5 · POPIA Cond.3",  effectiveness=data003, status=_status(data003), last_assessed=today),
        ControlMetric(id="INC-001",  name="Incident Detection & Alerting", domain="Incident Response",    framework="ISO A.16 · GDPR Art.33",     effectiveness=inc001,  status=_status(inc001),  last_assessed=today),
        ControlMetric(id="INC-002",  name="Breach Notification SLA (72h)", domain="Incident Response",    framework="GDPR Art.33 · POPIA Cond.6", effectiveness=inc002,  status=_status(inc002),  last_assessed=today),
        ControlMetric(id="PRIV-001", name="Privileged Access Management",  domain="Privilege Management", framework="ISO A.9 · POPIA Cond.7",     effectiveness=priv001, status=_status(priv001), last_assessed=today),
    ]

    logger.info(
        "Controls assessed — GDPR:%d POPIA:%d ISO:%d | events:%d MFA:%.1f%%",
        gdpr_score, popia_score, iso_score, total_events, mfa_rate,
    )

    return ControlsReport(
        assessed_at=datetime.now(timezone.utc).isoformat(),
        window_hours=stats["window_hours"],
        gdpr_score=gdpr_score,
        popia_score=popia_score,
        iso_score=iso_score,
        controls=controls,
    )
