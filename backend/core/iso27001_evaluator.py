"""
ISO 27001 Compliance Evaluator
==============================
Information Security Management System (ISMS) Standard — ISO/IEC 27001:2022.
Fetches recent activity logs from the RBAC database, derives ISO 27001-relevant
statistics, then sends a structured prompt to the local Ollama model for
evaluation against key Annex A controls.  Falls back to a rule-based report
if the LLM is unavailable.
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

logger = logging.getLogger("ISO27001Evaluator")

iso27001_router = APIRouter(prefix="/api/v1/iso27001", tags=["ISO27001"])

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
    logger.info("ISO 27001 Evaluator: Ollama available at %s (model: %s)", cfg.OLLAMA_BASE_URL, cfg.OLLAMA_MODEL)
except Exception as exc:
    logger.warning("ISO 27001 Evaluator: Ollama unavailable — %s. Rule-based fallback active.", exc)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ISO27001Finding(BaseModel):
    control: str = Field(description="ISO 27001 Annex A control reference, e.g. 'A.9.4.2'")
    title: str = Field(description="Short control title, e.g. 'Secure Log-on Procedures'")
    risk_level: str = Field(description="One of: LOW, MEDIUM, HIGH, CRITICAL")
    observation: str = Field(description="What was observed in the system logs")
    recommendation: str = Field(description="Specific remediation action recommended")


class ISO27001EvaluationReport(BaseModel):
    evaluated_at: str
    model_used: str
    log_window_hours: int
    events_analyzed: int
    overall_score: int = Field(description="ISO 27001 compliance score 0-100")
    risk_level: str = Field(description="Overall risk: LOW, MEDIUM, HIGH, or CRITICAL")
    summary: str = Field(description="2-3 sentence executive summary")
    findings: List[ISO27001Finding]


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

def _rule_based_report(stats: dict) -> ISO27001EvaluationReport:
    findings: List[ISO27001Finding] = []
    score = 100

    # A.9.3.1 — MFA adoption
    mfa_rate = stats["mfa_adoption_rate_pct"]
    if mfa_rate < 50:
        findings.append(ISO27001Finding(
            control="A.9.3.1", title="Use of Secret Authentication Information", risk_level="HIGH",
            observation=f"Only {mfa_rate}% of users have MFA enabled ({stats['mfa_enabled_users']} of {stats['total_users']}). A.9.3.1 requires strong authentication practices.",
            recommendation="Enforce MFA organisation-wide. Update the access control policy (A.9.1.1) to mandate MFA before access is granted.",
        ))
        score -= 20
    elif mfa_rate < 80:
        findings.append(ISO27001Finding(
            control="A.9.3.1", title="Use of Secret Authentication Information", risk_level="MEDIUM",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) still rely on single-factor authentication.",
            recommendation="Issue a mandatory MFA enrolment notice. Track adoption weekly until 100% coverage is achieved.",
        ))
        score -= 10
    elif mfa_rate < 100:
        findings.append(ISO27001Finding(
            control="A.9.3.1", title="Use of Secret Authentication Information", risk_level="LOW",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) without two-factor authentication.",
            recommendation="Complete MFA rollout to achieve full A.9.3.1 compliance across all roles.",
        ))

    # A.9.4.2 — Failed logins (any count reported)
    if stats["failed_logins"] > 0:
        fl = stats["failed_logins"]
        if fl > 50:   level, deduction = "HIGH", 15
        elif fl > 20: level, deduction = "MEDIUM", 8
        elif fl > 5:  level, deduction = "MEDIUM", 5
        else:         level, deduction = "LOW", 0
        findings.append(ISO27001Finding(
            control="A.9.4.2", title="Secure Log-on Procedures", risk_level=level,
            observation=f"{fl} failed login attempt(s) in {stats['window_hours']}h (failure rate: {stats['login_failure_rate_pct']}%). {'Elevated — possible brute-force or credential-stuffing attack.' if fl > 5 else 'Low-level failures recorded — monitor for escalation.'}",
            recommendation="Verify account lockout activates after 5 consecutive failures (A.9.4.2). Enable real-time alerting and review source IPs for malicious patterns.",
        ))
        score -= deduction

    # A.16.1.2 — Reporting Information Security Events (lockouts)
    if stats["auto_lockouts"] > 0:
        findings.append(ISO27001Finding(
            control="A.16.1.2", title="Reporting Information Security Events", risk_level="MEDIUM",
            observation=f"{stats['auto_lockouts']} account(s) automatically locked out — a potential security incident indicator per A.16.",
            recommendation="Treat each lockout as a security event. Log in the incident register, investigate the source, and escalate if a targeted attack pattern is identified.",
        ))
        score -= 5

    # A.9.2.6 — User deletions
    if stats["user_deletions"] > 0:
        findings.append(ISO27001Finding(
            control="A.9.2.6", title="Removal or Adjustment of Access Rights", risk_level="LOW",
            observation=f"{stats['user_deletions']} user deletion(s) recorded. Access rights must be revoked promptly upon user departure.",
            recommendation="Confirm all system access was revoked at deletion time. Retain the audit record for at least one year per the access management policy.",
        ))

    # A.9.2.2 — Permission changes (any count reported)
    if stats["permission_updates"] > 0:
        pu = stats["permission_updates"]
        if pu > 10:   level, deduction = "MEDIUM", 8
        elif pu > 3:  level, deduction = "LOW", 0
        else:         level, deduction = "LOW", 0
        findings.append(ISO27001Finding(
            control="A.9.2.2", title="User Access Provisioning", risk_level=level,
            observation=f"{pu} permission update(s) in {stats['window_hours']}h. {'High frequency indicates inadequate provisioning controls.' if pu > 10 else 'Access changes recorded — verify each followed the approval workflow.'}",
            recommendation="Implement a formal access request and approval workflow. A.9.2.2 requires access rights to be granted only through a documented, authorised process.",
        ))
        score -= deduction

    # A.9.2.5 — Role changes (any count reported)
    if stats["role_changes"] > 0:
        rc = stats["role_changes"]
        level = "MEDIUM" if rc > 5 else "LOW"
        findings.append(ISO27001Finding(
            control="A.9.2.5", title="Review of User Access Rights", risk_level=level,
            observation=f"{rc} role assignment/removal event(s) in {stats['window_hours']}h.",
            recommendation="Ensure each role change was formally authorised. Schedule a quarterly access rights review to remove stale assignments (A.9.2.5).",
        ))
        if level == "MEDIUM": score -= 5

    # A.9.2.1 — Account status changes
    if stats["status_changes"] > 0:
        findings.append(ISO27001Finding(
            control="A.9.2.1", title="User Registration and De-registration", risk_level="LOW",
            observation=f"{stats['status_changes']} account status change(s) (suspension/activation) recorded.",
            recommendation="Verify each status change was authorised. Suspended accounts must not retain system access per A.9.2.1.",
        ))

    # A.9.4.3 — Password changes
    if stats["password_changes"] > 0:
        pc = stats["password_changes"]
        if pc > 10:   level, deduction = "MEDIUM", 5
        else:         level, deduction = "LOW", 0
        findings.append(ISO27001Finding(
            control="A.9.4.3", title="Password Management System", risk_level=level,
            observation=f"{pc} password change(s) recorded in the last {stats['window_hours']}h. {'High frequency may indicate a forced reset following a security incident.' if pc > 10 else 'Password change(s) recorded — verify compliance with the password policy (A.9.4.3).'}",
            recommendation="Confirm each password change satisfied policy requirements (minimum length, complexity, history). If bulk resets were triggered by a suspected compromise, open an incident record per A.16.1.2.",
        ))
        score -= deduction

    # A.9.2.1 — User creations
    if stats["user_creations"] > 0:
        uc = stats["user_creations"]
        if uc > 5:    level, deduction = "MEDIUM", 5
        else:         level, deduction = "LOW", 0
        findings.append(ISO27001Finding(
            control="A.9.2.1", title="User Registration and De-registration — New Accounts", risk_level=level,
            observation=f"{uc} new user account(s) created in the last {stats['window_hours']}h. {'Bulk provisioning events should be reviewed for compliance with the access control policy.' if uc > 5 else 'New account(s) provisioned — verify each followed the formal registration process.'}",
            recommendation="Ensure every new account was authorised via the formal user registration process (A.9.2.1). Assign only the minimum access rights required (least privilege — A.9.2.2) and document the business justification.",
        ))
        score -= deduction

    # A.9.2.1 — Suspended accounts (snapshot)
    if stats["suspended_users"] > 0:
        findings.append(ISO27001Finding(
            control="A.9.2.1", title="User Registration and De-registration — Suspended Accounts", risk_level="LOW",
            observation=f"{stats['suspended_users']} user account(s) currently in suspended state. Suspended accounts retain system credentials and must be reviewed periodically.",
            recommendation="Review all suspended accounts. Permanently deactivate or delete accounts that will not be re-enabled. Ensure suspended credentials cannot be used to authenticate per the de-registration procedure (A.9.2.1).",
        ))

    # A.9.1.2 — Unique IPs
    if stats["unique_source_ips"] > 5:
        ui = stats["unique_source_ips"]
        level = "MEDIUM" if ui > 10 else "LOW"
        findings.append(ISO27001Finding(
            control="A.9.1.2", title="Access to Networks and Network Services", risk_level=level,
            observation=f"System activity originated from {ui} distinct IP address(es) in the evaluation window.",
            recommendation="Verify all source IPs are within authorised network ranges. Consider ACLs or geo-fencing for roles that access sensitive data.",
        ))
        if level == "MEDIUM": score -= 5

    # A.16.1.4 — Session kills (any count reported)
    if stats["session_kills"] > 0:
        sk = stats["session_kills"]
        level = "MEDIUM" if sk > 3 else "LOW"
        findings.append(ISO27001Finding(
            control="A.16.1.4", title="Assessment of Information Security Events", risk_level=level,
            observation=f"{sk} session termination(s) initiated. {'Elevated count may indicate active threat response.' if sk > 3 else 'Session kill(s) recorded — verify each was intentional.'}",
            recommendation="Review the reason for each session termination. Log incidents in the incident register and complete root-cause analysis if security-related.",
        ))
        if level == "MEDIUM": score -= 5

    # A.12.4.1 — No events = logging inactive
    if stats["total_events"] == 0:
        findings.append(ISO27001Finding(
            control="A.12.4.1", title="Event Logging", risk_level="CRITICAL",
            observation="No activity events recorded in the evaluation window. The audit logging system may be inactive or misconfigured.",
            recommendation="Restore audit logging immediately. A.12.4.1 requires event logs for all user activities and security events. Logging gaps are a major non-conformity.",
        ))
        score -= 30

    if not findings:
        findings.append(ISO27001Finding(
            control="All Controls", title="General ISMS Compliance Status", risk_level="LOW",
            observation="No ISO 27001 control concerns detected in the evaluation window.",
            recommendation="Continue monitoring. Conduct a formal internal ISMS audit per clause 9.2 and review the SoA annually.",
        ))

    score = max(0, min(100, score))
    risk = "LOW" if score >= 80 else "MEDIUM" if score >= 60 else "HIGH" if score >= 40 else "CRITICAL"

    return ISO27001EvaluationReport(
        evaluated_at=datetime.now(timezone.utc).isoformat(),
        model_used="rule-based (Ollama unavailable)",
        log_window_hours=stats["window_hours"],
        events_analyzed=stats["total_events"],
        overall_score=score,
        risk_level=risk,
        summary=(
            f"System processed {stats['total_events']} events in the last {stats['window_hours']}h. "
            f"MFA adoption stands at {stats['mfa_adoption_rate_pct']}% across {stats['total_users']} registered users. "
            f"{'No critical ISO 27001 non-conformities detected.' if score >= 80 else 'ISO 27001 non-conformities identified — immediate corrective action required.'}"
        ),
        findings=findings,
    )


# ── LLM evaluator ─────────────────────────────────────────────────────────────

async def _llm_report(stats: dict) -> ISO27001EvaluationReport:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import PydanticOutputParser

    parser = PydanticOutputParser(pydantic_object=ISO27001EvaluationReport)

    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "You are a certified ISO/IEC 27001:2022 Lead Auditor and information security expert. "
            "Evaluate the provided IT system activity statistics against ISO 27001 Annex A controls "
            "and relevant clauses. Be precise, cite specific Annex A control references (e.g. A.9.4.2), "
            "and provide actionable corrective action recommendations aligned with the ISO 27001 ISMS framework. "
            "Always respond with valid JSON matching the schema below.\n\n"
            "{format_instructions}"
        )),
        ("human", (
            "Evaluate the following system activity statistics for ISO 27001 compliance.\n\n"
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
            "1. Assess compliance against relevant ISO 27001 Annex A controls including:\n"
            "   A.9.1 (Business Requirements of Access Control),\n"
            "   A.9.2 (User Access Management — A.9.2.1 Registration, A.9.2.2 Provisioning, A.9.2.5 Review, A.9.2.6 Removal),\n"
            "   A.9.3 (User Responsibilities — A.9.3.1 Authentication Information),\n"
            "   A.9.4 (System and Application Access — A.9.4.2 Secure Log-on, A.9.4.3 Password Management),\n"
            "   A.12.4 (Logging and Monitoring — A.12.4.1 Event Logging, A.12.4.3 Administrator/Operator Logs),\n"
            "   A.16.1 (Information Security Incident Management — A.16.1.2 Reporting, A.16.1.4 Assessment),\n"
            "   A.18.1 (Compliance with Legal and Contractual Requirements).\n"
            "2. Compute overall_score (0=no compliance, 100=full compliance).\n"
            "3. Assign overall risk_level: LOW, MEDIUM, HIGH, or CRITICAL.\n"
            "4. Write a 2-3 sentence executive summary.\n"
            "5. List findings — one per control concern identified.\n"
            "6. Each finding must have: control, title, risk_level, observation, recommendation.\n"
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

@iso27001_router.post("/evaluate", response_model=ISO27001EvaluationReport)
async def evaluate_iso27001(
    hours: int = Query(default=24, ge=1, le=168),
    since: Optional[str] = Query(default=None),
):
    """
    Evaluate ISO 27001 ISMS compliance by analysing activity logs for the given window.
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
    logger.info("ISO 27001 evaluation requested — %d events in last %dh", stats["total_events"], hours)

    if _llm_available and _ollama is not None:
        try:
            report = await _llm_report(stats)
            logger.info("ISO 27001 evaluation complete (LLM). Score: %d, Risk: %s", report.overall_score, report.risk_level)
            return report
        except Exception as exc:
            logger.warning("LLM evaluation failed (%s) — falling back to rule-based report.", exc)

    report = _rule_based_report(stats)
    logger.info("ISO 27001 evaluation complete (rule-based). Score: %d, Risk: %s", report.overall_score, report.risk_level)
    return report


@iso27001_router.get("/status")
async def iso27001_status():
    return {
        "llm_available": _llm_available,
        "model": cfg.OLLAMA_MODEL if _llm_available else None,
        "ollama_url": cfg.OLLAMA_BASE_URL,
        "fallback": "rule-based" if not _llm_available else None,
    }
