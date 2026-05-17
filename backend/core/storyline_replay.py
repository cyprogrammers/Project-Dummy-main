import json
from collections import deque
from datetime import datetime, timedelta, timezone
from itertools import count
from pathlib import Path
from typing import Deque, List

from pydantic import BaseModel, Field

from core.agentic_ai import AnomalyContext, IntelligenceResponse


class StorylineStep(BaseModel):
    phase: str
    label: str
    detail: str
    timestamp: str
    status: str = "completed"


class TimelineStorylineLLM(BaseModel):
    """Strict JSON output from the LLM for autonomous incident reconstruction."""

    threat_label: str
    severity: str
    summary: str
    mitre_tactic: str
    confidence: float
    remediation_steps: List[str] = Field(default_factory=list)
    suggested_firewall_rules: List[str] = Field(default_factory=list)
    steps: List[StorylineStep] = Field(default_factory=list)


class StorylineReplay(BaseModel):
    storyline_id: str
    title: str
    severity: str
    status: str
    summary: str
    detected_at: str
    user_id: str
    cluster_id: str
    source_ip: str | None = None
    mitre_tactic: str
    confidence: float
    risk_delta: float
    recommended_actions: List[str] = Field(default_factory=list)
    containment_actions: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)
    steps: List[StorylineStep] = Field(default_factory=list)


class AdminIncidentTicket(BaseModel):
    incident_id: str
    storyline_id: str
    title: str
    severity: str
    status: str
    assigned: str
    source_ip: str | None = None
    detected_at: str
    sla_label: str
    summary: str
    risk_delta: float


def _severity_from_ratio(severity_ratio: float) -> str:
    if severity_ratio >= 3.0:
        return "critical"
    if severity_ratio >= 1.75:
        return "high"
    return "medium"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _normalize_severity(raw: str) -> str:
    s = (raw or "").lower().strip()
    if s in ("critical", "high", "medium", "low"):
        return s
    return "medium"


def build_storyline_from_timeline_llm(
    storyline_id: str,
    llm_out: TimelineStorylineLLM,
    *,
    user_id: str,
    cluster_id: str,
    source_ip: str | None,
    risk_score: float,
    metrics: dict | None = None,
    detected_at_iso: str | None = None,
) -> StorylineReplay:
    """Build persisted storyline from LLM reconstruction output (non-template steps)."""
    sev = _normalize_severity(llm_out.severity)
    detected_at = detected_at_iso or datetime.now(timezone.utc).isoformat()
    risk_delta = round(min(24.0, 4.0 + float(llm_out.confidence or 0.5) * 18.0), 1)
    tact_id = llm_out.mitre_tactic.split(" - ")[0].strip() if llm_out.mitre_tactic else "TBD"

    return StorylineReplay(
        storyline_id=storyline_id,
        title=llm_out.threat_label,
        severity=sev,
        status="open",
        summary=llm_out.summary,
        detected_at=detected_at,
        user_id=user_id,
        cluster_id=cluster_id,
        source_ip=source_ip,
        mitre_tactic=llm_out.mitre_tactic,
        confidence=round(float(llm_out.confidence), 2),
        risk_delta=risk_delta,
        recommended_actions=list(llm_out.remediation_steps),
        containment_actions=list(llm_out.suggested_firewall_rules),
        tags=[
            sev.upper(),
            cluster_id,
            tact_id,
            "llm-reconstructed",
        ],
        metrics=metrics or {},
        steps=list(llm_out.steps),
    )


def build_storyline_replay(
    context: AnomalyContext,
    detection_result: dict,
    intelligence_report: IntelligenceResponse,
    risk_score: float,
    sequence_summary: str,
    storyline_id: str,
) -> StorylineReplay:
    detected_at = datetime.now(timezone.utc)
    severity_ratio = context.mse_score / context.threshold if context.threshold else 0.0
    severity = _severity_from_ratio(severity_ratio)
    source_ip = context.suspicious_ip
    risk_delta = round(min(24.0, 4.0 + (severity_ratio * 3.2)), 1)

    step_times = [
        detected_at - timedelta(seconds=42),
        detected_at - timedelta(seconds=25),
        detected_at - timedelta(seconds=12),
        detected_at - timedelta(seconds=4),
        detected_at,
    ]

    steps = [
        StorylineStep(
            phase="Initial Access",
            label="Suspicious telemetry window formed",
            detail=sequence_summary,
            timestamp=_iso(step_times[0]),
        ),
        StorylineStep(
            phase="Detection",
            label="Behavioral anomaly exceeded cluster baseline",
            detail=(
                f"MSE {detection_result['mse']:.4f} crossed the "
                f"{detection_result['threshold']:.4f} threshold for {context.cluster_id}."
            ),
            timestamp=_iso(step_times[1]),
        ),
        StorylineStep(
            phase="Enrichment",
            label="MITRE and analyst context attached",
            detail=(
                f"Mapped to {intelligence_report.mitre_tactic} with RBAC context "
                f"{', '.join(context.rbac_permissions) or 'none'}."
            ),
            timestamp=_iso(step_times[2]),
        ),
        StorylineStep(
            phase="Containment",
            label="Containment recommendation generated",
            detail=(
                intelligence_report.suggested_firewall_rules[0]
                if intelligence_report.suggested_firewall_rules
                else "Session isolation recommended while awaiting automated enforcement."
            ),
            timestamp=_iso(step_times[3]),
        ),
        StorylineStep(
            phase="Impact",
            label="Risk posture updated",
            detail=f"Estimated global risk impact: +{risk_delta} points from a current score of {risk_score:.1f}.",
            timestamp=_iso(step_times[4]),
        ),
    ]

    return StorylineReplay(
        storyline_id=storyline_id,
        title=intelligence_report.threat_label,
        severity=severity,
        status="open",
        summary=sequence_summary,
        detected_at=_iso(detected_at),
        user_id=context.user_id,
        cluster_id=context.cluster_id,
        source_ip=source_ip,
        mitre_tactic=intelligence_report.mitre_tactic,
        confidence=round(float(intelligence_report.confidence), 2),
        risk_delta=risk_delta,
        recommended_actions=intelligence_report.remediation_steps,
        containment_actions=intelligence_report.suggested_firewall_rules,
        tags=[
            severity.upper(),
            context.cluster_id,
            intelligence_report.mitre_tactic.split(" - ")[0],
        ],
        metrics={
            "mse": round(float(detection_result["mse"]), 4),
            "threshold": round(float(detection_result["threshold"]), 4),
            "execution_time_ms": round(float(detection_result["execution_time_ms"]), 2),
        },
        steps=steps,
    )


class StorylineReplayStore:
    def __init__(self, max_items: int = 25, storage_path: Path | None = None):
        self._items: Deque[StorylineReplay] = deque(maxlen=max_items)
        self._storage_path = storage_path or Path(__file__).resolve().parents[1] / "db" / "storyline_replays.json"
        self._id_counter = count(1)
        self._load()

    def _load(self):
        if not self._storage_path.exists():
            return

        try:
            payload = json.loads(self._storage_path.read_text(encoding="utf-8"))
            items = [StorylineReplay.model_validate(item) for item in payload]
            self._items.extend(items[: self._items.maxlen])
            next_number = 1
            for item in items:
                try:
                    next_number = max(next_number, int(item.storyline_id.split("-")[1]) + 1)
                except (IndexError, ValueError):
                    continue
            self._id_counter = count(next_number)
        except (OSError, json.JSONDecodeError, ValueError):
            self._items.clear()

    def _persist(self):
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        serialized = [item.model_dump() for item in self._items]
        self._storage_path.write_text(json.dumps(serialized, indent=2), encoding="utf-8")

    def next_id(self) -> str:
        return f"SR-{next(self._id_counter):04d}"

    def add(self, replay: StorylineReplay) -> StorylineReplay:
        self._items.appendleft(replay)
        self._persist()
        return replay

    def list(self) -> List[StorylineReplay]:
        return list(self._items)

    def incident_tickets(self) -> List[AdminIncidentTicket]:
        assignments = {
            "critical": "sec-ops-lead",
            "high": "infra-response",
            "medium": "platform-duty",
        }
        sla_windows = {
            "critical": "42 min remaining",
            "high": "3h 10m remaining",
            "medium": "11h 45m remaining",
        }
        return [
            AdminIncidentTicket(
                incident_id=f"INC-{4000 + index + 1}",
                storyline_id=item.storyline_id,
                title=item.title,
                severity=item.severity,
                status=item.status,
                assigned=assignments.get(item.severity, "platform-duty"),
                source_ip=item.source_ip,
                detected_at=item.detected_at,
                sla_label=sla_windows.get(item.severity, "Queued"),
                summary=item.summary,
                risk_delta=item.risk_delta,
            )
            for index, item in enumerate(self.list())
        ]

    def summary(self) -> dict:
        items = self.list()
        return {
            "storylines": items,
            "totals": {
                "open": sum(1 for item in items if item.status == "open"),
                "critical": sum(1 for item in items if item.severity == "critical"),
                "blocked_ips": sum(1 for item in items if item.containment_actions),
                "avg_confidence": round(
                    sum(item.confidence for item in items) / len(items),
                    2,
                ) if items else 0,
            },
        }


storyline_store = StorylineReplayStore()
