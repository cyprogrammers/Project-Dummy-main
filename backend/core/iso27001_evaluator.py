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

def _rule_based_report(stats: dict) -> ISO27001EvaluationReport:
    findings: List[ISO27001Finding] = []
    score = 100

    # A.9.3.1 — Use of Secret Authentication Information (MFA)
    mfa_rate = stats["mfa_adoption_rate_pct"]
    if mfa_rate < 50:
        findings.append(ISO27001Finding(
            control="A.9.3.1",
            title="Use of Secret Authentication Information",
            risk_level="HIGH",
            observation=f"Only {mfa_rate}% of users have MFA enabled ({stats['mfa_enabled_users']} of {stats['total_users']}). ISO 27001 A.9.3.1 requires users to follow organisational practices for multi-factor authentication.",
            recommendation="Enforce MFA organisation-wide. Update the access control policy (A.9.1.1) to mandate MFA and configure role settings to require it before access is granted.",
        ))
        score -= 20
    elif mfa_rate < 80:
        findings.append(ISO27001Finding(
            control="A.9.3.1",
            title="Use of Secret Authentication Information",
            risk_level="MEDIUM",
            observation=f"MFA adoption is {mfa_rate}% — {stats['total_users'] - stats['mfa_enabled_users']} user(s) still rely on single-factor authentication.",
            recommendation="Issue a mandatory MFA enrolment notice. Track adoption weekly until 100% coverage is achieved across all roles.",
        ))
        score -= 10

    # A.9.4.2 — Secure Log-on Procedures (failed logins / brute force)
    if stats["failed_logins"] > 20:
        level = "HIGH" if stats["failed_logins"] > 50 else "MEDIUM"
        findings.append(ISO27001Finding(
            control="A.9.4.2",
            title="Secure Log-on Procedures",
            risk_level=level,
            observation=f"{stats['failed_logins']} failed login attempt(s) in {stats['window_hours']}h (failure rate: {stats['login_failure_rate_pct']}%). Elevated failure rates suggest a brute-force or credential-stuffing attack.",
            recommendation="Verify that account lockout is active after 5 consecutive failures (A.9.4.2). Enable real-time alerting for burst login failures. Review source IPs for malicious patterns.",
        ))
        score -= 15 if level == "HIGH" else 8

    # A.16.1.2 — Reporting Information Security Events (lockouts)
    if stats["auto_lockouts"] > 0:
        findings.append(ISO27001Finding(
            control="A.16.1.2",
            title="Reporting Information Security Events",
            risk_level="MEDIUM",
            observation=f"{stats['auto_lockouts']} account(s) automatically locked out — a potential security incident indicator per ISO 27001 A.16.",
            recommendation="Treat each lockout as an information security event. Log it in the incident register, investigate the source, and escalate if a pattern of targeted attacks is identified.",
        ))
        score -= 5

    # A.12.4.1 — Event Logging (no audit events = logging inactive)
    if stats["total_events"] == 0:
        findings.append(ISO27001Finding(
            control="A.12.4.1",
            title="Event Logging",
            risk_level="CRITICAL",
            observation="No activity events recorded in the evaluation window. The audit logging system may be inactive or misconfigured.",
            recommendation="Restore audit logging immediately. ISO 27001 A.12.4.1 requires event logs for user activities, faults, and information security events. Logging gaps are a major non-conformity.",
        ))
        score -= 30

    # A.9.2.2 — User Access Provisioning (excessive permission changes)
    if stats["permission_updates"] > 10:
        findings.append(ISO27001Finding(
            control="A.9.2.2",
            title="User Access Provisioning",
            risk_level="MEDIUM",
            observation=f"{stats['permission_updates']} permission update(s) in {stats['window_hours']}h. High frequency of access changes may indicate inadequate provisioning controls.",
            recommendation="Implement a formal access request and approval workflow. ISO 27001 A.9.2.2 requires that access rights be granted only through a documented process authorised by the asset owner.",
        ))
        score -= 8

    # A.9.2.6 — Removal or Adjustment of Access Rights (user deletions)
    if stats["user_deletions"] > 0:
        findings.append(ISO27001Finding(
            control="A.9.2.6",
            title="Removal or Adjustment of Access Rights",
            risk_level="LOW",
            observation=f"{stats['user_deletions']} user deletion(s) recorded. Access rights must be revoked promptly upon user departure.",
            recommendation="Confirm all system access (email, VPN, applications) was revoked at the time of deletion. Retain the deletion audit record for at least one year per the access management policy.",
        ))

    # A.9.1.2 — Access to Networks and Network Services (many unique IPs)
    if stats["unique_source_ips"] > 10:
        findings.append(ISO27001Finding(
            control="A.9.1.2",
            title="Access to Networks and Network Services",
            risk_level="MEDIUM",
            observation=f"System activity originated from {stats['unique_source_ips']} distinct IP addresses in the evaluation window.",
            recommendation="Verify all source IPs are within authorised network ranges. Consider network access control lists (ACLs) or geo-fencing for roles that access sensitive data.",
        ))
        score -= 5

    # A.9.2.5 — Review of User Access Rights (role changes)
    if stats["role_changes"] > 5:
        findings.append(ISO27001Finding(
            control="A.9.2.5",
            title="Review of User Access Rights",
            risk_level="LOW",
            observation=f"{stats['role_changes']} role assignment/removal event(s) in {stats['window_hours']}h. ISO 27001 requires periodic access reviews to validate role assignments.",
            recommendation="Ensure each role change was formally authorised. Schedule a quarterly access rights review across all roles to remove stale assignments (A.9.2.5).",
        ))

    # A.16.1.4 — Assessment of and Decision on Information Security Events (session kills)
    if stats["session_kills"] > 3:
        findings.append(ISO27001Finding(
            control="A.16.1.4",
            title="Assessment of Information Security Events",
            risk_level="MEDIUM",
            observation=f"{stats['session_kills']} session termination(s) initiated. Elevated session kills may indicate active threat response or policy enforcement.",
            recommendation="Review the reason for each session termination. If triggered by a security incident, ensure the event is logged in the incident register and root-cause analysis is completed.",
        ))
        score -= 5

    if not findings:
        findings.append(ISO27001Finding(
            control="All Controls",
            title="General ISMS Compliance Status",
            risk_level="LOW",
            observation="No significant ISO 27001 control violations detected in the evaluation window.",
            recommendation="Continue monitoring. Conduct a formal internal ISMS audit per clause 9.2 and review the Statement of Applicability (SoA) annually.",
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
async def evaluate_iso27001(hours: int = Query(default=24, ge=1, le=168)):
    """
    Evaluate ISO 27001 ISMS compliance by analysing activity logs for the given window.
    Uses Ollama when available; falls back to rule-based report automatically.
    """
    stats = await _gather_stats(hours)
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
