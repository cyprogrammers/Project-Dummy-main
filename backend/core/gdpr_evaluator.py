"""
GDPR Compliance Evaluator
=========================
Fetches recent activity logs from the RBAC database, derives GDPR-relevant
statistics, then sends a structured prompt to the local Ollama model for
evaluation against key GDPR articles.  Falls back to a rule-based report
if the LLM is unavailable.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

import config as cfg
from db.database import AsyncSessionLocal
from rbac.models import (
    RBACActivityLog, RBACUser,
    ActivityAction, ActivityResult,
)

logger = logging.getLogger("GDPREvaluator")

gdpr_router = APIRouter(prefix="/api/v1/gdpr", tags=["GDPR"])

# ── Ollama / LangChain setup (mirrors agentic_ai.py) ─────────────────────────

_llm_available = False
_ollama = None

try:
    from langchain_ollama import OllamaLLM
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import PydanticOutputParser

    _ollama = OllamaLLM(
        base_url=cfg.OLLAMA_BASE_URL,
        model=cfg.OLLAMA_MODEL,
        temperature=0.1,
    )
    _llm_available = True
    logger.info("GDPR Evaluator: Ollama LLM available at %s (model: %s)", cfg.OLLAMA_BASE_URL, cfg.OLLAMA_MODEL)
except Exception as exc:
    logger.warning("GDPR Evaluator: Ollama unavailable — %s. Rule-based fallback will be used.", exc)


# ── Pydantic response schemas ─────────────────────────────────────────────────

class GDPRFinding(BaseModel):
    article: str = Field(description="GDPR article reference, e.g. 'Art. 32'")
    title: str = Field(description="Short article title, e.g. 'Security of Processing'")
    risk_level: str = Field(description="One of: LOW, MEDIUM, HIGH, CRITICAL")
    observation: str = Field(description="What was observed in the system logs")
    recommendation: str = Field(description="Specific remediation action recommended")


class GDPREvaluationReport(BaseModel):
    evaluated_at: str
    model_used: str
    log_window_hours: int
    events_analyzed: int
    overall_score: int = Field(description="GDPR compliance score 0-100")
    risk_level: str = Field(description="Overall risk: LOW, MEDIUM, HIGH, or CRITICAL")
    summary: str = Field(description="2-3 sentence executive summary")
    findings: List[GDPRFinding]


# ── Helper: fetch and aggregate stats from DB ─────────────────────────────────

async def _gather_stats(hours: int, cutoff: Optional[datetime] = None) -> dict:
    """Returns a dict of GDPR-relevant statistics from the activity log."""
    if cutoff is None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    # Recalculate actual hours from the resolved cutoff so the report is accurate
    hours = max(1, round((datetime.now(timezone.utc) - cutoff).total_seconds() / 3600))

    async with AsyncSessionLocal() as db:
        # Total events in window
        total_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff)
        )
        total_events = total_q.scalar() or 0

        # Failed logins
        failed_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action == ActivityAction.login_failed,
            )
        )
        failed_logins = failed_q.scalar() or 0

        # Auto-lockouts
        lockout_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action == ActivityAction.auto_lockout,
            )
        )
        lockouts = lockout_q.scalar() or 0

        # User deletions (Art. 17 — right to erasure)
        delete_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action == ActivityAction.user_delete,
            )
        )
        user_deletions = delete_q.scalar() or 0

        # Permission updates (Art. 25 — least privilege)
        perm_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action == ActivityAction.perm_update,
            )
        )
        perm_updates = perm_q.scalar() or 0

        # Status changes — suspensions / activations (Art. 25)
        status_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action == ActivityAction.status_change,
            )
        )
        status_changes = status_q.scalar() or 0

        # Total active users
        user_total_q = await db.execute(select(func.count(RBACUser.id)))
        total_users = user_total_q.scalar() or 0

        # Users with MFA enabled (Art. 25 — data protection by design)
        mfa_q = await db.execute(
            select(func.count(RBACUser.id)).where(RBACUser.mfa_enabled == True)
        )
        mfa_users = mfa_q.scalar() or 0

        # Unique IPs seen in window (Art. 32 — security monitoring)
        ip_q = await db.execute(
            select(RBACActivityLog.ip_address)
            .where(RBACActivityLog.timestamp >= cutoff)
            .distinct()
        )
        unique_ips = [row[0] for row in ip_q.fetchall() if row[0]]

        # Successful logins
        success_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action == ActivityAction.login,
                RBACActivityLog.result == ActivityResult.success,
            )
        )
        successful_logins = success_q.scalar() or 0

        # Session kills (Art. 32 — session management)
        session_kill_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action == ActivityAction.session_kill,
            )
        )
        session_kills = session_kill_q.scalar() or 0

        # Role changes (Art. 25 — access management)
        role_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(
                RBACActivityLog.timestamp >= cutoff,
                RBACActivityLog.action.in_([
                    ActivityAction.role_assign,
                    ActivityAction.role_remove,
                ]),
            )
        )
        role_changes = role_q.scalar() or 0

    mfa_rate = round((mfa_users / total_users * 100), 1) if total_users > 0 else 0.0
    login_failure_rate = round(
        (failed_logins / (failed_logins + successful_logins) * 100), 1
    ) if (failed_logins + successful_logins) > 0 else 0.0

    return {
        "window_hours": hours,
        "total_events": total_events,
        "failed_logins": failed_logins,
        "successful_logins": successful_logins,
        "login_failure_rate_pct": login_failure_rate,
        "auto_lockouts": lockouts,
        "user_deletions": user_deletions,
        "permission_updates": perm_updates,
        "status_changes": status_changes,
        "session_kills": session_kills,
        "role_changes": role_changes,
        "total_users": total_users,
        "mfa_enabled_users": mfa_users,
        "mfa_adoption_rate_pct": mfa_rate,
        "unique_source_ips": len(unique_ips),
    }


# ── Rule-based fallback evaluator ─────────────────────────────────────────────

def _rule_based_report(stats: dict) -> GDPREvaluationReport:
    """Produces a deterministic GDPR report without the LLM."""
    findings: List[GDPRFinding] = []
    score = 100

    # Art. 25 — MFA adoption
    mfa_rate = stats["mfa_adoption_rate_pct"]
    if mfa_rate < 50:
        findings.append(GDPRFinding(
            article="Art. 25", title="Data Protection by Design", risk_level="HIGH",
            observation=f"Only {mfa_rate}% of users have MFA enabled ({stats['mfa_enabled_users']} of {stats['total_users']}).",
            recommendation="Enforce MFA for all roles. GDPR Art. 25 requires privacy by design — strong authentication is mandatory.",
        ))
        score -= 20
    elif mfa_rate < 80:
        findings.append(GDPRFinding(
            article="Art. 25", title="Data Protection by Design", risk_level="MEDIUM",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) not yet protected.",
            recommendation="Increase MFA enforcement. Target 100% adoption for roles handling personal data.",
        ))
        score -= 10
    elif mfa_rate < 100:
        findings.append(GDPRFinding(
            article="Art. 25", title="Data Protection by Design", risk_level="LOW",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) still using single-factor authentication.",
            recommendation="Complete MFA rollout to achieve full Art. 25 compliance.",
        ))

    # Art. 32 — Failed logins (any count is reported)
    if stats["failed_logins"] > 0:
        fl = stats["failed_logins"]
        if fl > 50:   level, deduction = "HIGH", 15
        elif fl > 20: level, deduction = "MEDIUM", 8
        elif fl > 5:  level, deduction = "MEDIUM", 5
        else:         level, deduction = "LOW", 0
        findings.append(GDPRFinding(
            article="Art. 32", title="Security of Processing — Failed Logins", risk_level=level,
            observation=f"{fl} failed login attempt(s) in the last {stats['window_hours']}h (failure rate: {stats['login_failure_rate_pct']}%). {'Elevated — possible brute-force or credential-stuffing.' if fl > 5 else 'Low-level failures recorded — monitor for escalation.'}",
            recommendation="Review login failure patterns. Ensure account lockout policy is active and alert thresholds are configured.",
        ))
        score -= deduction

    # Art. 32 — Auto-lockouts
    if stats["auto_lockouts"] > 0:
        findings.append(GDPRFinding(
            article="Art. 32", title="Security of Processing — Account Lockout", risk_level="MEDIUM",
            observation=f"{stats['auto_lockouts']} account(s) automatically locked due to repeated failed logins.",
            recommendation="Investigate locked accounts for credential stuffing. Notify affected users per Art. 34 if a breach is confirmed.",
        ))
        score -= 5

    # Art. 17 — Right to erasure
    if stats["user_deletions"] > 0:
        findings.append(GDPRFinding(
            article="Art. 17", title="Right to Erasure", risk_level="LOW",
            observation=f"{stats['user_deletions']} user deletion(s) recorded in the audit log.",
            recommendation="Verify deleted users' personal data is fully purged from all systems within the required timeframe.",
        ))

    # Art. 25 — Permission changes (any count reported)
    if stats["permission_updates"] > 0:
        pu = stats["permission_updates"]
        if pu > 10:   level, deduction = "MEDIUM", 8
        elif pu > 3:  level, deduction = "LOW", 0
        else:         level, deduction = "LOW", 0
        findings.append(GDPRFinding(
            article="Art. 25", title="Data Protection by Design — Least Privilege", risk_level=level,
            observation=f"{pu} permission update(s) in the last {stats['window_hours']}h. {'Frequent changes indicate inadequate access management.' if pu > 10 else 'Access changes recorded — verify each is properly authorised.'}",
            recommendation="Review all access changes. Implement a formal approval workflow to enforce the least-privilege principle.",
        ))
        score -= deduction

    # Art. 25 — Role changes
    if stats["role_changes"] > 0:
        rc = stats["role_changes"]
        level = "MEDIUM" if rc > 5 else "LOW"
        findings.append(GDPRFinding(
            article="Art. 25", title="Data Protection by Design — Role Management", risk_level=level,
            observation=f"{rc} role assignment/removal event(s) in the last {stats['window_hours']}h.",
            recommendation="Confirm each role change was formally authorised and aligns with the data minimisation principle (Art. 5).",
        ))
        if level == "MEDIUM": score -= 5

    # Art. 32 — Status changes (suspension/activation)
    if stats["status_changes"] > 0:
        findings.append(GDPRFinding(
            article="Art. 32", title="Security of Processing — Account Status Changes", risk_level="LOW",
            observation=f"{stats['status_changes']} account status change(s) (suspension/activation) recorded.",
            recommendation="Verify each status change was intentional and authorised. Suspended accounts must not retain access to personal data.",
        ))

    # Art. 32 — Session kills (session management)
    if stats["session_kills"] > 0:
        sk = stats["session_kills"]
        level = "MEDIUM" if sk > 3 else "LOW"
        findings.append(GDPRFinding(
            article="Art. 32", title="Security of Processing — Session Management", risk_level=level,
            observation=f"{sk} session termination(s) recorded in the last {stats['window_hours']}h. {'Elevated count may indicate active security response or forced logout events.' if sk > 3 else 'Session kill(s) recorded — verify each was intentional.'}",
            recommendation="Confirm each session termination was authorised or triggered by a security event. Maintain session audit records to satisfy Art. 32 accountability obligations.",
        ))
        if level == "MEDIUM": score -= 5

    # Art. 5(1)(f) — Integrity and confidentiality: unique IPs
    if stats["unique_source_ips"] > 5:
        ui = stats["unique_source_ips"]
        level = "MEDIUM" if ui > 10 else "LOW"
        findings.append(GDPRFinding(
            article="Art. 5(1)(f)", title="Integrity and Confidentiality — Access Origins", risk_level=level,
            observation=f"Activity observed from {ui} unique IP address(es) in the evaluation window.",
            recommendation="Review whether all source IPs are expected. Consider geo-restriction for sensitive roles.",
        ))
        if level == "MEDIUM": score -= 5

    # Art. 5(1)(e) — No events = logging inactive
    if stats["total_events"] == 0:
        findings.append(GDPRFinding(
            article="Art. 5(1)(e)", title="Storage Limitation — Audit Logging", risk_level="HIGH",
            observation="No activity events recorded in the evaluation window. Audit logging may be inactive.",
            recommendation="Verify the audit logging system is operational. Continuous logging is required for Art. 5 accountability.",
        ))
        score -= 25

    if not findings:
        findings.append(GDPRFinding(
            article="Art. 5", title="Principles of Processing", risk_level="LOW",
            observation="No GDPR concerns detected in the evaluation window.",
            recommendation="Continue monitoring. Schedule a full DPIA quarterly.",
        ))

    score = max(0, min(100, score))
    risk = "LOW" if score >= 80 else "MEDIUM" if score >= 60 else "HIGH" if score >= 40 else "CRITICAL"

    return GDPREvaluationReport(
        evaluated_at=datetime.now(timezone.utc).isoformat(),
        model_used="rule-based (Ollama unavailable)",
        log_window_hours=stats["window_hours"],
        events_analyzed=stats["total_events"],
        overall_score=score,
        risk_level=risk,
        summary=(
            f"System processed {stats['total_events']} events in the last {stats['window_hours']}h. "
            f"MFA adoption is {stats['mfa_adoption_rate_pct']}% across {stats['total_users']} users. "
            f"{'No critical GDPR violations detected.' if score >= 80 else 'GDPR compliance issues require immediate attention.'}"
        ),
        findings=findings,
    )


# ── LLM-based evaluator ───────────────────────────────────────────────────────

async def _llm_report(stats: dict) -> GDPREvaluationReport:
    """Calls Ollama to produce a GDPR evaluation from the collected stats."""
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import PydanticOutputParser

    parser = PydanticOutputParser(pydantic_object=GDPREvaluationReport)

    prompt_template = ChatPromptTemplate.from_messages([
        ("system", (
            "You are a certified GDPR Data Protection Officer (DPO) and cybersecurity expert. "
            "Your task is to evaluate an IT system's activity log statistics against the GDPR (EU 2016/679) "
            "and produce a structured compliance report. Be precise, cite specific GDPR articles, "
            "and provide actionable recommendations. Always respond with valid JSON matching the schema below.\n\n"
            "{format_instructions}"
        )),
        ("human", (
            "Evaluate the following system activity statistics for GDPR compliance.\n\n"
            "=== SYSTEM ACTIVITY STATISTICS ===\n"
            "Evaluation window: {window_hours} hours\n"
            "Total events analyzed: {total_events}\n"
            "Successful logins: {successful_logins}\n"
            "Failed logins: {failed_logins} (failure rate: {login_failure_rate_pct}%)\n"
            "Auto-lockouts triggered: {auto_lockouts}\n"
            "User deletions: {user_deletions}\n"
            "Permission updates: {permission_updates}\n"
            "Status changes (suspend/activate): {status_changes}\n"
            "Session kills: {session_kills}\n"
            "Total registered users: {total_users}\n"
            "Users with MFA enabled: {mfa_enabled_users} ({mfa_adoption_rate_pct}%)\n"
            "Unique source IP addresses: {unique_source_ips}\n\n"
            "=== EVALUATION INSTRUCTIONS ===\n"
            "1. Assess compliance against these key GDPR articles: Art. 5, Art. 17, Art. 25, Art. 32, Art. 33, Art. 5(1)(f).\n"
            "2. Compute an overall_score (0=no compliance, 100=full compliance).\n"
            "3. Assign an overall risk_level: LOW, MEDIUM, HIGH, or CRITICAL.\n"
            "4. Provide a 2-3 sentence executive summary.\n"
            "5. List specific findings — one per GDPR article concern identified.\n"
            "6. For each finding specify: article, title, risk_level, observation, recommendation.\n"
            "7. Set evaluated_at to '{evaluated_at}', model_used to '{model_used}', "
            "log_window_hours to {window_hours}, events_analyzed to {total_events}.\n\n"
            "Return ONLY valid JSON. No markdown, no explanation outside the JSON."
        )),
    ])

    chain = prompt_template | _ollama | parser

    now = datetime.now(timezone.utc).isoformat()
    result = await chain.ainvoke({
        "format_instructions": parser.get_format_instructions(),
        "evaluated_at": now,
        "model_used": cfg.OLLAMA_MODEL,
        **stats,
    })

    return result


# ── API endpoint ──────────────────────────────────────────────────────────────

@gdpr_router.post("/evaluate", response_model=GDPREvaluationReport)
async def evaluate_gdpr(
    hours: int = Query(default=24, ge=1, le=168),
    since: Optional[str] = Query(default=None),
):
    """
    Evaluate the system's GDPR compliance by analysing activity logs for the
    specified window.  Pass `since` as a local ISO timestamp (from the browser)
    to anchor the cutoff to the client's timezone; otherwise falls back to a
    rolling `hours` window in UTC.
    """
    cutoff = None
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace('Z', '+00:00'))
        except ValueError:
            pass
    stats = await _gather_stats(hours, cutoff=cutoff)
    logger.info("GDPR evaluation requested — %d events in last %dh", stats["total_events"], hours)

    if _llm_available and _ollama is not None:
        try:
            report = await _llm_report(stats)
            logger.info("GDPR evaluation complete (LLM). Score: %d, Risk: %s", report.overall_score, report.risk_level)
            return report
        except Exception as exc:
            logger.warning("LLM evaluation failed (%s) — falling back to rule-based report.", exc)

    report = _rule_based_report(stats)
    logger.info("GDPR evaluation complete (rule-based). Score: %d, Risk: %s", report.overall_score, report.risk_level)
    return report


@gdpr_router.get("/status")
async def gdpr_status():
    """Returns whether the Ollama LLM is available for GDPR evaluation."""
    return {
        "llm_available": _llm_available,
        "model": cfg.OLLAMA_MODEL if _llm_available else None,
        "ollama_url": cfg.OLLAMA_BASE_URL,
        "fallback": "rule-based" if not _llm_available else None,
    }
