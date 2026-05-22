"""
POPIA Compliance Evaluator
==========================
Protection of Personal Information Act (Act 4 of 2013) — South Africa.
Fetches recent activity logs from the RBAC database, derives POPIA-relevant
statistics, then sends a structured prompt to the local Ollama model for
evaluation against the eight POPIA conditions.  Falls back to a rule-based
report if the LLM is unavailable.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from pydantic import BaseModel, Field

import config as cfg
from db.database import AsyncSessionLocal
from rbac.models import (
    RBACActivityLog, RBACUser,
    ActivityAction, ActivityResult,
)

logger = logging.getLogger("POPIAEvaluator")

popia_router = APIRouter(prefix="/api/v1/popia", tags=["POPIA"])

# ── Ollama / LangChain setup ──────────────────────────────────────────────────

_llm_available = False
_ollama = None

try:
    from langchain_ollama import OllamaLLM
    _ollama = OllamaLLM(
        base_url=cfg.OLLAMA_BASE_URL,
        model=cfg.OLLAMA_MODEL,
        temperature=0.1,
    )
    _llm_available = True
    logger.info("POPIA Evaluator: Ollama available at %s (model: %s)", cfg.OLLAMA_BASE_URL, cfg.OLLAMA_MODEL)
except Exception as exc:
    logger.warning("POPIA Evaluator: Ollama unavailable — %s. Rule-based fallback active.", exc)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class POPIAFinding(BaseModel):
    condition: str = Field(description="POPIA condition/section reference, e.g. 'Condition 7 — Section 19'")
    title: str = Field(description="Short condition title, e.g. 'Security Safeguards'")
    risk_level: str = Field(description="One of: LOW, MEDIUM, HIGH, CRITICAL")
    observation: str = Field(description="What was observed in the system logs")
    recommendation: str = Field(description="Specific remediation action recommended")


class POPIAEvaluationReport(BaseModel):
    evaluated_at: str
    model_used: str
    log_window_hours: int
    events_analyzed: int
    overall_score: int = Field(description="POPIA compliance score 0-100")
    risk_level: str = Field(description="Overall risk: LOW, MEDIUM, HIGH, or CRITICAL")
    summary: str = Field(description="2-3 sentence executive summary")
    findings: List[POPIAFinding]


# ── Stats collection ──────────────────────────────────────────────────────────

async def _gather_stats(hours: int) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    async with AsyncSessionLocal() as db:
        total_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff)
        )
        total_events = total_q.scalar() or 0

        failed_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.login_failed)
        )
        failed_logins = failed_q.scalar() or 0

        lockout_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.auto_lockout)
        )
        lockouts = lockout_q.scalar() or 0

        delete_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.user_delete)
        )
        user_deletions = delete_q.scalar() or 0

        perm_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.perm_update)
        )
        perm_updates = perm_q.scalar() or 0

        status_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.status_change)
        )
        status_changes = status_q.scalar() or 0

        role_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action.in_([
                       ActivityAction.role_assign,
                       ActivityAction.role_remove,
                   ]))
        )
        role_changes = role_q.scalar() or 0

        success_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.login,
                   RBACActivityLog.result == ActivityResult.success)
        )
        successful_logins = success_q.scalar() or 0

        session_kill_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.session_kill)
        )
        session_kills = session_kill_q.scalar() or 0

        pw_change_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.password_change)
        )
        password_changes = pw_change_q.scalar() or 0

        user_create_q = await db.execute(
            select(func.count(RBACActivityLog.id))
            .where(RBACActivityLog.timestamp >= cutoff,
                   RBACActivityLog.action == ActivityAction.user_create)
        )
        user_creations = user_create_q.scalar() or 0

        total_users_q = await db.execute(select(func.count(RBACUser.id)))
        total_users = total_users_q.scalar() or 0

        mfa_q = await db.execute(
            select(func.count(RBACUser.id)).where(RBACUser.mfa_enabled == True)
        )
        mfa_users = mfa_q.scalar() or 0

        suspended_q = await db.execute(
            select(func.count(RBACUser.id))
            .where(RBACUser.status == "suspended")
        )
        suspended_users = suspended_q.scalar() or 0

        ip_q = await db.execute(
            select(RBACActivityLog.ip_address)
            .where(RBACActivityLog.timestamp >= cutoff)
            .distinct()
        )
        unique_ips = len([r[0] for r in ip_q.fetchall() if r[0]])

    mfa_rate = round(mfa_users / total_users * 100, 1) if total_users > 0 else 0.0
    failure_rate = round(
        failed_logins / (failed_logins + successful_logins) * 100, 1
    ) if (failed_logins + successful_logins) > 0 else 0.0

    return {
        "window_hours": hours,
        "total_events": total_events,
        "successful_logins": successful_logins,
        "failed_logins": failed_logins,
        "login_failure_rate_pct": failure_rate,
        "auto_lockouts": lockouts,
        "user_deletions": user_deletions,
        "user_creations": user_creations,
        "permission_updates": perm_updates,
        "role_changes": role_changes,
        "status_changes": status_changes,
        "session_kills": session_kills,
        "password_changes": password_changes,
        "total_users": total_users,
        "mfa_enabled_users": mfa_users,
        "mfa_adoption_rate_pct": mfa_rate,
        "suspended_users": suspended_users,
        "unique_source_ips": unique_ips,
    }


# ── Rule-based fallback ───────────────────────────────────────────────────────

def _rule_based_report(stats: dict) -> POPIAEvaluationReport:
    findings: List[POPIAFinding] = []
    score = 100

    # Condition 7 / Section 19 — Security Safeguards: MFA adoption
    mfa_rate = stats["mfa_adoption_rate_pct"]
    if mfa_rate < 50:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19",
            title="Security Safeguards",
            risk_level="HIGH",
            observation=f"Only {mfa_rate}% of users have MFA enabled ({stats['mfa_enabled_users']} of {stats['total_users']}). POPIA Section 19 requires appropriate technical safeguards.",
            recommendation="Enforce MFA for all roles that process personal information. Update role security settings and notify affected users.",
        ))
        score -= 20
    elif mfa_rate < 80:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19",
            title="Security Safeguards",
            risk_level="MEDIUM",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) lack two-factor authentication.",
            recommendation="Progressively enforce MFA across all roles. POPIA requires reasonable measures to prevent unauthorised access.",
        ))
        score -= 10

    # Condition 7 / Section 19 — Failed logins / brute force
    if stats["failed_logins"] > 20:
        level = "HIGH" if stats["failed_logins"] > 50 else "MEDIUM"
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19",
            title="Security Safeguards — Unauthorised Access Attempts",
            risk_level=level,
            observation=f"{stats['failed_logins']} failed login attempts in {stats['window_hours']}h (failure rate {stats['login_failure_rate_pct']}%). This indicates possible unauthorised access attempts.",
            recommendation="Review failed login patterns. Ensure account lockout is active, alerts are configured, and incidents are reported to the Information Regulator if a compromise occurred (Section 22).",
        ))
        score -= 15 if level == "HIGH" else 8

    # Condition 7 / Section 22 — Auto-lockouts (security compromise indicators)
    if stats["auto_lockouts"] > 0:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 22",
            title="Notification of Security Compromises",
            risk_level="MEDIUM",
            observation=f"{stats['auto_lockouts']} account(s) were locked out due to repeated failed logins — a potential security compromise indicator.",
            recommendation="Investigate locked accounts. If personal information was accessed unauthorised, notify the Information Regulator and affected data subjects within the required timeframe (Section 22).",
        ))
        score -= 5

    # Condition 8 / Section 23 — Data subject participation: user deletions
    if stats["user_deletions"] > 0:
        findings.append(POPIAFinding(
            condition="Condition 8 — Section 23",
            title="Data Subject Participation — Right to Erasure",
            risk_level="LOW",
            observation=f"{stats['user_deletions']} user deletion(s) recorded. POPIA grants data subjects the right to request destruction of personal information.",
            recommendation="Confirm that deleted users' personal information is fully purged from all databases, backups, and logs. Document the erasure for accountability (Condition 1 — Section 8).",
        ))

    # Condition 1 / Section 8 — Accountability: no audit events
    if stats["total_events"] == 0:
        findings.append(POPIAFinding(
            condition="Condition 1 — Section 8",
            title="Accountability — Audit Trail",
            risk_level="HIGH",
            observation="No activity events recorded in the evaluation window. The audit logging system may be inactive.",
            recommendation="Restore and verify audit logging immediately. Section 8 requires the responsible party to give effect to POPIA conditions and document compliance.",
        ))
        score -= 25

    # Condition 2 / Section 9 — Processing Limitation: excessive permission changes
    if stats["permission_updates"] > 10:
        findings.append(POPIAFinding(
            condition="Condition 2 — Section 9",
            title="Processing Limitation — Minimality",
            risk_level="MEDIUM",
            observation=f"{stats['permission_updates']} permission updates in {stats['window_hours']}h. Frequent access changes may indicate poorly managed processing scope.",
            recommendation="Implement a formal access review process. POPIA Section 9 requires that personal information is processed in a minimal and lawful manner.",
        ))
        score -= 8

    # Condition 7 / Section 19 — Multiple source IPs (access from unexpected locations)
    if stats["unique_source_ips"] > 10:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19",
            title="Security Safeguards — Access Origin",
            risk_level="MEDIUM",
            observation=f"System activity originated from {stats['unique_source_ips']} distinct IP addresses in the window.",
            recommendation="Verify all source IPs are expected. Enable geo-restriction for roles that process sensitive personal information.",
        ))
        score -= 5

    # Condition 3 / Section 13 — Purpose Specification: role changes
    if stats["role_changes"] > 5:
        findings.append(POPIAFinding(
            condition="Condition 3 — Section 13",
            title="Purpose Specification — Role Assignment",
            risk_level="LOW",
            observation=f"{stats['role_changes']} role assignment/removal event(s) recorded. Ensure each role change aligns with the stated purpose of personal data processing.",
            recommendation="Document the purpose justification for each role change. POPIA requires that access to personal information is granted only for a specific, explicitly defined purpose.",
        ))

    if not findings:
        findings.append(POPIAFinding(
            condition="All Conditions",
            title="General Compliance Status",
            risk_level="LOW",
            observation="No significant POPIA violations detected in the evaluation window.",
            recommendation="Continue monitoring. Conduct a quarterly POPIA compliance review and update your PAIA manual if required.",
        ))

    score = max(0, min(100, score))
    risk = "LOW" if score >= 80 else "MEDIUM" if score >= 60 else "HIGH" if score >= 40 else "CRITICAL"

    return POPIAEvaluationReport(
        evaluated_at=datetime.now(timezone.utc).isoformat(),
        model_used="rule-based (Ollama unavailable)",
        log_window_hours=stats["window_hours"],
        events_analyzed=stats["total_events"],
        overall_score=score,
        risk_level=risk,
        summary=(
            f"System processed {stats['total_events']} events in the last {stats['window_hours']}h. "
            f"MFA adoption stands at {stats['mfa_adoption_rate_pct']}% across {stats['total_users']} registered users. "
            f"{'No critical POPIA violations detected.' if score >= 80 else 'POPIA compliance issues require attention from the responsible party.'}"
        ),
        findings=findings,
    )


# ── LLM evaluator ─────────────────────────────────────────────────────────────

async def _llm_report(stats: dict) -> POPIAEvaluationReport:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import PydanticOutputParser

    parser = PydanticOutputParser(pydantic_object=POPIAEvaluationReport)

    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "You are a certified POPIA (Protection of Personal Information Act, South Africa Act 4 of 2013) "
            "compliance expert and information security officer. "
            "Evaluate the provided IT system activity statistics against the eight POPIA conditions "
            "and relevant sections. Be precise, cite specific POPIA conditions and sections, "
            "and provide actionable South African–context recommendations. "
            "Always respond with valid JSON matching the schema below.\n\n"
            "{format_instructions}"
        )),
        ("human", (
            "Evaluate the following system activity statistics for POPIA compliance.\n\n"
            "=== SYSTEM ACTIVITY STATISTICS ===\n"
            "Evaluation window: {window_hours} hours\n"
            "Total events: {total_events}\n"
            "Successful logins: {successful_logins}\n"
            "Failed logins: {failed_logins} (failure rate: {login_failure_rate_pct}%)\n"
            "Auto-lockouts: {auto_lockouts}\n"
            "User creations: {user_creations}\n"
            "User deletions: {user_deletions}\n"
            "Role changes (assign/remove): {role_changes}\n"
            "Permission updates: {permission_updates}\n"
            "Status changes: {status_changes}\n"
            "Session kills: {session_kills}\n"
            "Password changes: {password_changes}\n"
            "Total registered users: {total_users}\n"
            "Users with MFA enabled: {mfa_enabled_users} ({mfa_adoption_rate_pct}%)\n"
            "Suspended users: {suspended_users}\n"
            "Unique source IPs: {unique_source_ips}\n\n"
            "=== EVALUATION INSTRUCTIONS ===\n"
            "1. Assess compliance against all eight POPIA conditions:\n"
            "   Condition 1: Accountability (s.8), Condition 2: Processing Limitation (s.9-12),\n"
            "   Condition 3: Purpose Specification (s.13-14), Condition 4: Further Processing Limitation (s.15),\n"
            "   Condition 5: Information Quality (s.16), Condition 6: Openness (s.17-18),\n"
            "   Condition 7: Security Safeguards (s.19-22), Condition 8: Data Subject Participation (s.23-25).\n"
            "2. Compute overall_score (0=no compliance, 100=full compliance).\n"
            "3. Assign overall risk_level: LOW, MEDIUM, HIGH, or CRITICAL.\n"
            "4. Write a 2-3 sentence executive summary.\n"
            "5. List findings — one per condition or concern identified.\n"
            "6. Each finding must have: condition, title, risk_level, observation, recommendation.\n"
            "7. Set evaluated_at='{evaluated_at}', model_used='{model_used}', "
            "log_window_hours={window_hours}, events_analyzed={total_events}.\n\n"
            "Return ONLY valid JSON. No markdown, no text outside the JSON."
        )),
    ])

    chain = prompt | _ollama | parser
    now = datetime.now(timezone.utc).isoformat()

    return await chain.ainvoke({
        "format_instructions": parser.get_format_instructions(),
        "evaluated_at": now,
        "model_used": cfg.OLLAMA_MODEL,
        **stats,
    })


# ── API endpoints ─────────────────────────────────────────────────────────────

@popia_router.post("/evaluate", response_model=POPIAEvaluationReport)
async def evaluate_popia(hours: int = Query(default=24, ge=1, le=168)):
    """
    Evaluate POPIA compliance by analysing activity logs for the given window.
    Uses Ollama when available; falls back to rule-based report automatically.
    """
    stats = await _gather_stats(hours)
    logger.info("POPIA evaluation requested — %d events in last %dh", stats["total_events"], hours)

    if _llm_available and _ollama is not None:
        try:
            report = await _llm_report(stats)
            logger.info("POPIA evaluation complete (LLM). Score: %d, Risk: %s", report.overall_score, report.risk_level)
            return report
        except Exception as exc:
            logger.warning("LLM evaluation failed (%s) — falling back to rule-based report.", exc)

    report = _rule_based_report(stats)
    logger.info("POPIA evaluation complete (rule-based). Score: %d, Risk: %s", report.overall_score, report.risk_level)
    return report


@popia_router.get("/status")
async def popia_status():
    return {
        "llm_available": _llm_available,
        "model": cfg.OLLAMA_MODEL if _llm_available else None,
        "ollama_url": cfg.OLLAMA_BASE_URL,
        "fallback": "rule-based" if not _llm_available else None,
    }
