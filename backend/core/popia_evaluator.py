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
from typing import List, Optional

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

async def _gather_stats(hours: int, cutoff: Optional[datetime] = None) -> dict:
    if cutoff is None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    hours = max(1, round((datetime.now(timezone.utc) - cutoff).total_seconds() / 3600))

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

    # Condition 7 / Section 19 — MFA adoption
    mfa_rate = stats["mfa_adoption_rate_pct"]
    if mfa_rate < 50:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19", title="Security Safeguards", risk_level="HIGH",
            observation=f"Only {mfa_rate}% of users have MFA enabled ({stats['mfa_enabled_users']} of {stats['total_users']}). POPIA Section 19 requires appropriate technical safeguards.",
            recommendation="Enforce MFA for all roles that process personal information. Update role security settings and notify affected users.",
        ))
        score -= 20
    elif mfa_rate < 80:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19", title="Security Safeguards", risk_level="MEDIUM",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) lack two-factor authentication.",
            recommendation="Progressively enforce MFA across all roles. POPIA requires reasonable measures to prevent unauthorised access.",
        ))
        score -= 10
    elif mfa_rate < 100:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19", title="Security Safeguards", risk_level="LOW",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) still without two-factor authentication.",
            recommendation="Complete MFA rollout. Section 19 requires all operators of personal information to be appropriately protected.",
        ))

    # Condition 7 / Section 19 — Failed logins (any count reported)
    if stats["failed_logins"] > 0:
        fl = stats["failed_logins"]
        if fl > 50:   level, deduction = "HIGH", 15
        elif fl > 20: level, deduction = "MEDIUM", 8
        elif fl > 5:  level, deduction = "MEDIUM", 5
        else:         level, deduction = "LOW", 0
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19", title="Security Safeguards — Unauthorised Access Attempts", risk_level=level,
            observation=f"{fl} failed login attempt(s) in {stats['window_hours']}h (failure rate: {stats['login_failure_rate_pct']}%). {'Elevated — possible unauthorised access attempt.' if fl > 5 else 'Low-level failures recorded — monitor for escalation.'}",
            recommendation="Review failed login patterns. Ensure account lockout is active and incidents are reported to the Information Regulator if a compromise occurred (Section 22).",
        ))
        score -= deduction

    # Condition 7 / Section 22 — Auto-lockouts
    if stats["auto_lockouts"] > 0:
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 22", title="Notification of Security Compromises", risk_level="MEDIUM",
            observation=f"{stats['auto_lockouts']} account(s) locked out due to repeated failed logins — a potential security compromise indicator.",
            recommendation="Investigate locked accounts. If personal information was accessed without authorisation, notify the Information Regulator and affected data subjects (Section 22).",
        ))
        score -= 5

    # Condition 8 / Section 23 — User deletions
    if stats["user_deletions"] > 0:
        findings.append(POPIAFinding(
            condition="Condition 8 — Section 23", title="Data Subject Participation — Right to Erasure", risk_level="LOW",
            observation=f"{stats['user_deletions']} user deletion(s) recorded. POPIA grants data subjects the right to request destruction of personal information.",
            recommendation="Confirm deleted users' personal information is fully purged from all databases, backups, and logs. Document the erasure for accountability (Condition 1 — Section 8).",
        ))

    # Condition 2 / Section 9 — Permission changes (any count reported)
    if stats["permission_updates"] > 0:
        pu = stats["permission_updates"]
        if pu > 10:   level, deduction = "MEDIUM", 8
        elif pu > 3:  level, deduction = "LOW", 0
        else:         level, deduction = "LOW", 0
        findings.append(POPIAFinding(
            condition="Condition 2 — Section 9", title="Processing Limitation — Minimality", risk_level=level,
            observation=f"{pu} permission update(s) in {stats['window_hours']}h. {'Frequent changes may indicate poorly managed processing scope.' if pu > 10 else 'Access changes recorded — verify each is minimally scoped.'}",
            recommendation="Implement a formal access review process. POPIA Section 9 requires personal information to be processed in a minimal and lawful manner.",
        ))
        score -= deduction

    # Condition 3 / Section 13 — Role changes (any count reported)
    if stats["role_changes"] > 0:
        rc = stats["role_changes"]
        level = "MEDIUM" if rc > 5 else "LOW"
        findings.append(POPIAFinding(
            condition="Condition 3 — Section 13", title="Purpose Specification — Role Assignment", risk_level=level,
            observation=f"{rc} role assignment/removal event(s) in {stats['window_hours']}h. Each role change affects access to personal information.",
            recommendation="Document the purpose justification for each role change. POPIA requires access to personal information only for a specific, explicitly defined purpose.",
        ))
        if level == "MEDIUM": score -= 5

    # Condition 8 / Section 23 — Status changes
    if stats["status_changes"] > 0:
        findings.append(POPIAFinding(
            condition="Condition 8 — Section 23", title="Data Subject Participation — Account Status", risk_level="LOW",
            observation=f"{stats['status_changes']} account status change(s) (suspension/activation) recorded.",
            recommendation="Verify each status change was authorised. Suspended accounts must not retain access to personal information.",
        ))

    # Condition 7 / Section 19 — Session kills
    if stats["session_kills"] > 0:
        sk = stats["session_kills"]
        level = "MEDIUM" if sk > 3 else "LOW"
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19", title="Security Safeguards — Session Management", risk_level=level,
            observation=f"{sk} session termination(s) recorded in the last {stats['window_hours']}h. {'Elevated count may indicate a security incident requiring investigation.' if sk > 3 else 'Session kill(s) recorded — verify each was authorised.'}",
            recommendation="Review all session termination events. Forced session kills can indicate compromised accounts. Log each event and assess whether the Information Regulator must be notified under Section 22.",
        ))
        if level == "MEDIUM": score -= 5

    # Condition 7 / Section 19 — Password changes
    if stats["password_changes"] > 0:
        pc = stats["password_changes"]
        if pc > 10:   level, deduction = "MEDIUM", 5
        else:         level, deduction = "LOW", 0
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19", title="Security Safeguards — Password Management", risk_level=level,
            observation=f"{pc} password change(s) recorded in the last {stats['window_hours']}h. {'High frequency may indicate a forced reset following a security event.' if pc > 10 else 'Password change(s) recorded — verify each was user-initiated or part of a scheduled policy rotation.'}",
            recommendation="Ensure password changes comply with the organisation's password policy. If bulk resets were triggered by a suspected compromise, document and assess notification obligations under Section 22.",
        ))
        score -= deduction

    # Condition 2 / Section 9 — User creations
    if stats["user_creations"] > 0:
        uc = stats["user_creations"]
        if uc > 5:    level, deduction = "MEDIUM", 5
        else:         level, deduction = "LOW", 0
        findings.append(POPIAFinding(
            condition="Condition 2 — Section 9", title="Processing Limitation — New Account Creation", risk_level=level,
            observation=f"{uc} new user account(s) created in the last {stats['window_hours']}h. {'Bulk account creation may indicate an onboarding event or a provisioning anomaly.' if uc > 5 else 'New account(s) created — verify lawful purpose and consent for processing personal information.'}",
            recommendation="Confirm each new account was created with a documented, lawful purpose. Collect only the minimum personal information necessary (Section 11 — minimality). Update the personal information register accordingly.",
        ))
        score -= deduction

    # Condition 8 / Section 23 — Currently suspended users (snapshot)
    if stats["suspended_users"] > 0:
        findings.append(POPIAFinding(
            condition="Condition 8 — Section 23", title="Data Subject Participation — Suspended Accounts", risk_level="LOW",
            observation=f"{stats['suspended_users']} user account(s) currently suspended. Suspended accounts retain stored personal information which must still be protected.",
            recommendation="Review all suspended accounts. If suspension is permanent, initiate erasure of personal information per the right to deletion. Document the retention justification for temporarily suspended accounts.",
        ))

    # Condition 7 / Section 19 — Multiple source IPs
    if stats["unique_source_ips"] > 5:
        ui = stats["unique_source_ips"]
        level = "MEDIUM" if ui > 10 else "LOW"
        findings.append(POPIAFinding(
            condition="Condition 7 — Section 19", title="Security Safeguards — Access Origin", risk_level=level,
            observation=f"System activity originated from {ui} distinct IP address(es) in the window.",
            recommendation="Verify all source IPs are expected. Enable geo-restriction for roles that process sensitive personal information.",
        ))
        if level == "MEDIUM": score -= 5

    # Condition 1 / Section 8 — No audit events = logging inactive
    if stats["total_events"] == 0:
        findings.append(POPIAFinding(
            condition="Condition 1 — Section 8", title="Accountability — Audit Trail", risk_level="HIGH",
            observation="No activity events recorded in the evaluation window. The audit logging system may be inactive.",
            recommendation="Restore and verify audit logging immediately. Section 8 requires the responsible party to document compliance with all POPIA conditions.",
        ))
        score -= 25

    if not findings:
        findings.append(POPIAFinding(
            condition="All Conditions", title="General Compliance Status", risk_level="LOW",
            observation="No POPIA concerns detected in the evaluation window.",
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
async def evaluate_popia(
    hours: int = Query(default=24, ge=1, le=168),
    since: Optional[str] = Query(default=None),
):
    """
    Evaluate POPIA compliance by analysing activity logs for the given window.
    Pass `since` as a local ISO timestamp to anchor the cutoff to the client's
    timezone; otherwise falls back to a rolling `hours` window in UTC.
    """
    cutoff = None
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace('Z', '+00:00'))
        except ValueError:
            pass
    stats = await _gather_stats(hours, cutoff=cutoff)
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
