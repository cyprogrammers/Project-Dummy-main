from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from rbac.router import router as rbac_router
from rbac.seed   import seed as rbac_seed
import logging

import config as cfg

from core.anomaly_detection import AnomalyDetector
from core.agentic_ai import agentic_router
from core.risk_engine import risk_engine, ComponentRiskData, EnvironmentState
from core.storyline_replay import (
    build_storyline_from_timeline_llm,
    storyline_store,
)
from core.incident_correlation import (
    build_minimal_timeline_from_anomaly,
    fetch_and_cluster_recent_timelines,
    fetch_context_timeline_for_anomaly,
    fingerprint_store,
    IncidentTimeline,
)
from core.incident_reconstruction import (
    anomaly_metrics_block,
    invoke_timeline_llm,
    StorylineLLMUnavailable,
)
from auth.keycloak import get_telemetry_ingest_roles
from connectors.elk_ingestor import poll_elasticsearch
import asyncio
from backup.backup_engine import backup_router
from tasks.task_engine import task_router
from core.gdpr_evaluator import gdpr_router
from core.popia_evaluator import popia_router
from core.iso27001_evaluator import iso27001_router
from core.controls_effectiveness import controls_router
from demo.attack_simulator import attack_simulator
from pydantic import BaseModel as PydanticBaseModel
from typing import List as TypingList


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AITRMS-Main")

app = FastAPI(title="AITRMS Core Intelligence Hub", version="1.0")

# Aligning backend with the Vite frontend (port 5173) we saw in the UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(agentic_router)
app.include_router(rbac_router)
app.include_router(backup_router)
app.include_router(gdpr_router)
app.include_router(popia_router)
app.include_router(iso27001_router)
app.include_router(controls_router)
app.include_router(task_router)


# Simulation API Endpoints
class SimulationRequest(PydanticBaseModel):
    scenario_name: str
    user_id: str = "demo_user"
    cluster_id: str = "cluster_admin"
    suspicious_ip: str = "203.0.113.45"


@app.post("/api/v1/simulation/trigger")
async def trigger_simulation(request: SimulationRequest):
    """
    Trigger a security attack simulation to demonstrate automated detection and response

    Available scenarios:
    - brute_force: Brute force login attempts
    - privilege_escalation: Unauthorized privilege escalation
    - data_exfiltration: Large data transfer to external IP
    - malware_execution: Suspicious process execution
    """
    from demo.attack_simulator import SCENARIOS
    session = await attack_simulator.run_scenario(
        scenario_name=request.scenario_name,
        user_id=request.user_id,
        cluster_id=request.cluster_id,
        suspicious_ip=request.suspicious_ip
    )
    return session


@app.get("/api/v1/simulation/sessions/{session_id}")
async def get_simulation_session(session_id: str):
    """Retrieve details of a specific simulation session"""
    session = attack_simulator.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return session


@app.get("/api/v1/simulation/sessions")
async def list_simulation_sessions():
    """List all simulation sessions"""
    return attack_simulator.list_sessions()


@app.get("/api/v1/simulation/scenarios")
async def list_scenarios():
    """List all available attack scenarios"""
    from demo.attack_simulator import SCENARIOS
    return [
        {
            "id": key,
            "name": scenario.name,
            "description": scenario.description,
            "mitre_technique": scenario.mitre_technique
        }
        for key, scenario in SCENARIOS.items()
    ]


@app.delete("/api/v1/simulation/sessions")
async def clear_simulation_sessions():
    """Clear all simulation sessions"""
    attack_simulator.clear_sessions()
    return {"status": "cleared"}


# Setup Templates and Static Files
templates = Jinja2Templates(directory="templates")
# app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

# Initialize Layer 3
anomaly_detector = AnomalyDetector(input_dim=32, seq_len=60)
anomaly_detector.set_cluster_threshold("cluster_admin", 0.05)
anomaly_detector.set_cluster_threshold("cluster_student", 0.15)
anomaly_detector.set_cluster_threshold("default", 0.10)
# Normally you'd train the IsolationForest with historical data:
# anomaly_detector.train_isolation_forest(historical_normal_data)

# Registering some dummy baseline risk components for demonstration
risk_engine.register_component(ComponentRiskData(
    component_id="auth-server-abc",
    cves=[{"CVE-2024-XXXX": 9.8}],
    exposure=0.5,
    criticality=1.5
))

# --- Endpoints for Layer 3 (Anomaly) -> Layer 4 (Agent logic) Pipeline ---

class TelemetryWindow(BaseModel):
    user_id: str
    cluster_id: str
    rbac_permissions: list[str]
    window_data: list[list[float]]  # 60x32 matrix
    suspicious_ip: str | None = None
    events_summary: str | None = None


async def persist_storyline_from_timeline(
    timeline: IncidentTimeline,
    detection_result: dict | None,
    user_id: str,
    cluster_id: str,
    source_ip: str | None,
):
    """LLM-only reconstruction; returns None if fingerprint already stored."""
    if not fingerprint_store.is_new(timeline.fingerprint):
        return None

    llm_out = await invoke_timeline_llm(timeline)
    detected_at = timeline.events[-1].get("@timestamp") if timeline.events else None
    replay = build_storyline_from_timeline_llm(
        storyline_store.next_id(),
        llm_out,
        user_id=user_id,
        cluster_id=cluster_id,
        source_ip=source_ip,
        risk_score=risk_engine.calculate_global_risk_score(),
        metrics=anomaly_metrics_block(detection_result)
        if detection_result
        else {"source": "elasticsearch_correlation"},
        detected_at_iso=detected_at,
    )
    storyline_store.add(replay)
    fingerprint_store.add(timeline.fingerprint)
    return replay


async def correlation_storyline_worker():
    """Periodic ES correlation → LLM storyline reconstruction (deduped)."""
    await asyncio.sleep(15)
    while True:
        try:
            timelines = await fetch_and_cluster_recent_timelines()
            for tl in timelines:
                try:
                    replay = await persist_storyline_from_timeline(
                        tl,
                        detection_result=None,
                        user_id="correlation-worker",
                        cluster_id="elasticsearch",
                        source_ip=next(
                            (e.get("source_ip") for e in tl.events if e.get("source_ip")),
                            None,
                        ),
                    )
                    if replay:
                        logger.info("Correlation storyline persisted: %s", replay.storyline_id)
                except StorylineLLMUnavailable as exc:
                    logger.warning("Correlation storyline skipped (LLM): %s", exc)
                except Exception as exc:
                    logger.error("Correlation worker error: %s", exc)
        except Exception as exc:
            logger.error("Correlation sweep failed: %s", exc)
        await asyncio.sleep(cfg.CORRELATION_POLL_INTERVAL_SECONDS)


@app.on_event("startup")
async def startup_event():
    logger.info("Seeding RBAC database...")
    await rbac_seed()
    logger.info("RBAC seeding complete!")

    # Start Elasticsearch-dependent tasks only if ES is available
    logger.info("Starting background tasks (Elasticsearch-dependent tasks will fail gracefully if ES unavailable)...")
    asyncio.create_task(poll_elasticsearch())
    asyncio.create_task(correlation_storyline_worker())


@app.post("/api/v1/telemetry/ingest")
async def ingest_telemetry_window(
    payload: TelemetryWindow,
    rbac_roles: list[str] = Depends(get_telemetry_ingest_roles),
):
    """
    Ingests a 60-event (32-dim) window, runs it through Layer 3 IsolationForest & LSTM-Autoencoder.
    If an anomaly is detected, it is forwarded immediately to Layer 4 (Agentic AI) for intelligence reporting.
    """
    import numpy as np
    
    try:
        sequence = np.array(payload.window_data)
        if sequence.shape != (60, 32):
             raise ValueError(f"Invalid sequence shape. Expected (60, 32), got {sequence.shape}")
             
        # Phase 1: Layer 3 Detection
        detection_result = anomaly_detector.analyze_sequence(sequence, cluster_id=payload.cluster_id)
        
        # If normal, return immediately
        if not detection_result["is_anomaly"]:
            return {"status": "normal", "details": detection_result}

        logger.warning("Anomaly detected for user %s — reconstructing ES-backed storyline (LLM required).", payload.user_id)

        sequence_summary = payload.events_summary or (
            "Behavioral anomaly: elevated reconstruction triggered from neural detection pipeline."
        )
        suspicious_ip = payload.suspicious_ip

        es_timeline = await fetch_context_timeline_for_anomaly(
            suspicious_ip=suspicious_ip,
            user_name=payload.user_id,
        )
        if es_timeline and len(es_timeline.events) >= cfg.CORRELATION_MIN_EVENTS_PER_SESSION:
            timeline = es_timeline
        else:
            timeline = build_minimal_timeline_from_anomaly(
                correlation_key=f"{payload.cluster_id}|{payload.user_id}|ml-anomaly",
                user_id=payload.user_id,
                summary=sequence_summary,
                suspicious_ip=suspicious_ip or "unknown",
                detection_snippet=detection_result,
            )

        try:
            replay = await persist_storyline_from_timeline(
                timeline,
                detection_result,
                user_id=payload.user_id,
                cluster_id=payload.cluster_id,
                source_ip=suspicious_ip,
            )
        except StorylineLLMUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        out = {
            "status": "anomaly_detected",
            "layer_3_metrics": detection_result,
            "storyline_replay": replay,
        }
        if replay is None:
            out["storyline_skipped"] = "duplicate_fingerprint"
        return out
        
    except Exception as e:
        logger.error(f"Error processing telemetry window: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- Endpoints for Phase 3: Dynamic Risk Assessment Engine ---

class NewCVEReq(BaseModel):
    component_id: str
    cve_id: str
    cvss_score: float

class IncidentRegistrationReq(BaseModel):
    incident_level: str # e.g. "P1", "P2", "P3"


class StorylineSimulateReq(BaseModel):
    """Trigger correlation over recent ES data and persist new LLM storylines."""

    window_minutes: int | None = None

@app.post("/api/v1/risk/register_cve")
async def register_new_cve(payload: NewCVEReq, background_tasks: BackgroundTasks):
    """
    Registers a new CVE against a component and triggers global risk recalculation.
    """
    if payload.component_id not in risk_engine.components:
         # Register dummy representation if component doesn't exist
         risk_engine.register_component(ComponentRiskData(
             component_id=payload.component_id,
             cves=[],
             exposure=0.8, # Assume high exposure for demo
             criticality=2.0 
         ))
         
    # Append the CVE
    risk_engine.components[payload.component_id].cves.append({payload.cve_id: payload.cvss_score})
    
    # Trigger Recalculation (Constraint: within 30 seconds)
    background_tasks.add_task(risk_engine.trigger_recalculation, reason=f"New CVE {payload.cve_id} on {payload.component_id}")
    
    return {"status": "CVE registered. Risk recalculation triggered."}

@app.post("/api/v1/risk/register_incident")
async def register_incident(payload: IncidentRegistrationReq, background_tasks: BackgroundTasks):
    """
    Registers an incident affecting the global incident multiplier.
    """
    if payload.incident_level in ["P1", "P2"]:
        risk_engine.state.open_p1_p2_incidents += 1
        background_tasks.add_task(risk_engine.trigger_recalculation, reason=f"New High-Severity Incident ({payload.incident_level})")
        return {"status": "Incident acknowledged. Global risk multiplier increased & recalculation triggered."}
    return {"status": "Incident logged. (Did not meet P1/P2 threshold for risk multiplier modification)."}

@app.get("/api/v1/risk/global_score")
def get_global_risk_score():
    return {
        "score": risk_engine.calculate_global_risk_score(),
        "open_incidents": risk_engine.state.open_p1_p2_incidents,
        "last_recalculated": risk_engine.last_recalculated
    }


@app.get("/api/v1/ui/analyst/storylines")
def get_storyline_replays():
    return storyline_store.summary()


@app.get("/api/v1/ui/admin/incidents")
def get_admin_incidents():
    return {
        "incidents": storyline_store.incident_tickets(),
        "totals": storyline_store.summary()["totals"],
    }


@app.post("/api/v1/ui/analyst/storylines/simulate")
async def simulate_storyline_replay(payload: StorylineSimulateReq):
    """
    Scan Elasticsearch for correlated sessions in the time window, run LLM reconstruction
    for each new fingerprint, and persist storylines.
    """
    window = payload.window_minutes if payload.window_minutes is not None else cfg.CORRELATION_WINDOW_MINUTES
    try:
        timelines = await fetch_and_cluster_recent_timelines(window_minutes=window)
    except Exception as exc:
        logger.exception("Failed to fetch timelines from Elasticsearch")
        raise HTTPException(status_code=502, detail=f"Elasticsearch correlation failed: {exc}") from exc

    if not timelines:
        return {
            "status": "no_sessions",
            "message": f"No correlated event sessions found in the last {window} minutes (threshold "
            f"{cfg.CORRELATION_MIN_EVENTS_PER_SESSION}+ events per key).",
            "created": [],
            "totals": storyline_store.summary()["totals"],
        }

    created = []
    try:
        for tl in timelines:
            try:
                replay = await persist_storyline_from_timeline(
                    tl,
                    detection_result=None,
                    user_id="analyst-simulate",
                    cluster_id="correlation",
                    source_ip=next(
                        (e.get("source_ip") for e in tl.events if e.get("source_ip")),
                        None,
                    ),
                )
                if replay:
                    created.append(replay)
            except StorylineLLMUnavailable as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HTTPException:
        raise

    return {
        "status": "ok",
        "window_minutes": window,
        "created_count": len(created),
        "created": created,
        "totals": storyline_store.summary()["totals"],
    }

# --- UI Alignment Endpoints (Mapping backend models to Frontend React Views) ---

@app.get("/api/v1/ui/admin/overview")
def get_admin_overview():
    """Provides high-level infrastructure metrics for the IT Administrator 'RISK OVERVIEW' tab."""
    score = risk_engine.calculate_global_risk_score()
    storylines = storyline_store.list()
    critical_storylines = sum(1 for item in storylines if item.severity == "critical")
    medium_storylines = sum(1 for item in storylines if item.severity == "medium")
    return {
        "overall_risk_score": score,
        "critical_vulns": sum(len(c.cves) for c in risk_engine.components.values()),
        "open_incidents": risk_engine.state.open_p1_p2_incidents,
        "active_incidents": len(storylines),
        "critical_incidents": critical_storylines,
        "medium_incidents": medium_storylines,
        "mttr_days": getattr(risk_engine.state, 'mttr_days', 4.2), # Default demo value
        "patch_compliance": getattr(risk_engine.state, 'patch_compliance', 88.5), # Default demo value
        "risk_trend": "increasing" if score > 50 else "stable",
        "monitored_endpoints": len(risk_engine.components),
        "risk_trend_data": [25, 30, 45, 60, 65, 55, 40, 20, score] # 9-month mock trend matching UI
    }

@app.get("/api/v1/ui/analyst/intelligence")
def get_analyst_intelligence():
    """Provides tactical threat intel for the Security Analyst 'THREAT INTELLIGENCE' tab."""
    # This aligns the Agentic AI capabilities directly with the Analyst view's requirements
    storylines = storyline_store.list()
    latest_alerts = [
        {
            "level": item.severity,
            "label": item.title,
            "source_ip": item.source_ip or "unknown",
        }
        for item in storylines[:3]
    ]
    return {
        "active_iocs": max(124, len(storylines) * 7),
        "new_cves_7d": 8,
        "threat_feeds": 5,
        "blocked_ips": sum(1 for item in storylines if item.containment_actions),
        "remediation_priority": [
            {"id": "CVE-2024-3094", "days_open": 12, "criticality": "Critical", "impact": "High Risk Surge"},
            {"id": "CVE-2024-21626", "days_open": 24, "criticality": "High", "impact": "Component Decay"},
            {"id": "CVE-2023-44487", "days_open": 45, "criticality": "Medium", "impact": "Legacy Debt"}
        ],
        "live_alerts": latest_alerts or [
            {
                "level": "critical",
                "label": "Brute Force Detected (T1110)",
                "source_ip": "192.168.45.99"
            }
        ]
    }


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting AITRMS Engine...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
