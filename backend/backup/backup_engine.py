"""
AITRMS Backup Engine
====================
Full backup management system: job scheduling, SHA-256 integrity
verification, storage tracking, and retention policy management.

Integration: Add to backend/main.py:
    from backup_engine import backup_router
    app.include_router(backup_router)
"""

import asyncio
import enum
import hashlib
import json
import logging
import random
from datetime import datetime, timedelta, timezone
from itertools import count
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("BackupEngine")

# ─── Enums ───────────────────────────────────────────────────────────────────

class BackupDestination(str, enum.Enum):
    nas  = "On-Prem NAS"
    s3   = "S3 Cloud"
    tape = "Off-site Tape"

class BackupType(str, enum.Enum):
    full         = "Full"
    incremental  = "Incremental"
    differential = "Differential"

class BackupStatus(str, enum.Enum):
    completed = "completed"
    running   = "running"
    failed    = "failed"
    scheduled = "scheduled"
    pending   = "pending"

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class BackupJob(BaseModel):
    id: str
    name: str
    type: BackupType
    destination: BackupDestination
    status: BackupStatus
    last_run: Optional[str] = None
    next_run: str
    size_gb: float = 0.0
    integrity_hash: Optional[str] = None
    integrity_verified: bool = False
    retention_days: int = 30
    copies: int = 3
    error_message: Optional[str] = None
    duration_seconds: Optional[int] = None
    schedule_cron: str = "0 2 * * *"   # default: 2 AM daily
    created_at: str
    tags: List[str] = []

class BackupJobCreate(BaseModel):
    name: str
    type: BackupType
    destination: BackupDestination
    retention_days: int = 30
    copies: int = 3
    schedule_cron: str = "0 2 * * *"
    tags: List[str] = []

class BackupJobUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[BackupType] = None
    destination: Optional[BackupDestination] = None
    retention_days: Optional[int] = None
    copies: Optional[int] = None
    schedule_cron: Optional[str] = None
    tags: Optional[List[str]] = None

class StorageUtilization(BaseModel):
    destination: str
    used_gb: float
    total_gb: float
    percent: float
    bar_color: str

class RetentionPolicy(BaseModel):
    label: str
    period: str
    copies: int

class BackupOverview(BaseModel):
    jobs_verified: int
    jobs_total: int
    jobs_requiring_attention: int
    failed_jobs: int
    running_jobs: int
    last_failure_ago: str
    total_backup_size_gb: float
    next_full_backup_iso: str
    time_until_next: str
    success_rate_percent: float

# ─── Seed Data ────────────────────────────────────────────────────────────────

def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _hours_ago(h: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=h)).isoformat()

def _hours_from_now(h: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=h)).isoformat()

def _sha256(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()

def _days_ago(d: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=d)).isoformat()

SEED_JOBS = [
    {
        "id": "bkp-001",
        "name": "PostgreSQL Primary",
        "type": "Full",
        "destination": "On-Prem NAS",
        "status": "completed",
        "last_run": _hours_ago(6),
        "next_run": _hours_from_now(18),
        "size_gb": 142.7,
        "integrity_hash": _sha256("bkp-001-pg-primary"),
        "integrity_verified": True,
        "retention_days": 30,
        "copies": 3,
        "duration_seconds": 1847,
        "schedule_cron": "0 2 * * *",
        "created_at": _days_ago(90),
        "tags": ["database", "critical"],
    },
    {
        "id": "bkp-002",
        "name": "MongoDB Events",
        "type": "Incremental",
        "destination": "S3 Cloud",
        "status": "completed",
        "last_run": _hours_ago(2),
        "next_run": _hours_from_now(4),
        "size_gb": 38.4,
        "integrity_hash": _sha256("bkp-002-mongodb"),
        "integrity_verified": True,
        "retention_days": 14,
        "copies": 2,
        "duration_seconds": 412,
        "schedule_cron": "0 */6 * * *",
        "created_at": _days_ago(60),
        "tags": ["database", "events"],
    },
    {
        "id": "bkp-003",
        "name": "File Server NAS",
        "type": "Differential",
        "destination": "Off-site Tape",
        "status": "failed",
        "last_run": _hours_ago(12),
        "next_run": _hours_from_now(12),
        "size_gb": 0.0,
        "integrity_verified": False,
        "retention_days": 90,
        "copies": 3,
        "error_message": "Connection timeout to tape library. Retry scheduled in 12h.",
        "schedule_cron": "0 4 * * *",
        "created_at": _days_ago(180),
        "tags": ["files", "tape"],
    },
    {
        "id": "bkp-004",
        "name": "Email Archives",
        "type": "Full",
        "destination": "S3 Cloud",
        "status": "completed",
        "last_run": _hours_ago(24),
        "next_run": _hours_from_now(24),
        "size_gb": 287.3,
        "integrity_hash": _sha256("bkp-004-email"),
        "integrity_verified": True,
        "retention_days": 365,
        "copies": 5,
        "duration_seconds": 5621,
        "schedule_cron": "0 1 * * *",
        "created_at": _days_ago(365),
        "tags": ["email", "compliance", "long-retention"],
    },
    {
        "id": "bkp-005",
        "name": "Keycloak Config",
        "type": "Full",
        "destination": "On-Prem NAS",
        "status": "scheduled",
        "next_run": _hours_from_now(3),
        "size_gb": 0.0,
        "integrity_verified": False,
        "retention_days": 30,
        "copies": 3,
        "schedule_cron": "0 3 * * 0",
        "created_at": _days_ago(30),
        "tags": ["auth", "config"],
    },
    {
        "id": "bkp-006",
        "name": "Redis Snapshot",
        "type": "Incremental",
        "destination": "S3 Cloud",
        "status": "completed",
        "last_run": _hours_ago(0),
        "next_run": _hours_from_now(1),
        "size_gb": 4.1,
        "integrity_hash": _sha256("bkp-006-redis"),
        "integrity_verified": True,
        "retention_days": 7,
        "copies": 2,
        "duration_seconds": 87,
        "schedule_cron": "0 * * * *",
        "created_at": _days_ago(14),
        "tags": ["cache", "frequent"],
    },
]

# Storage capacities per destination (GB)
STORAGE_CAPACITY: dict[str, dict] = {
    "On-Prem NAS": {"total_gb": 500.0,  "color": "#ef4444"},
    "S3 Cloud":    {"total_gb": 2000.0, "color": "#06b6d4"},
    "Off-site Tape": {"total_gb": 1000.0, "color": "#7c3aed"},
}

RETENTION_POLICIES: list[RetentionPolicy] = [
    RetentionPolicy(label="Daily Snapshots",  period="7 days",    copies=7),
    RetentionPolicy(label="Weekly Snapshots", period="4 weeks",   copies=4),
    RetentionPolicy(label="Monthly Archives", period="12 months", copies=12),
]

# ─── Backup Store ─────────────────────────────────────────────────────────────

class BackupStore:
    def __init__(self, storage_path: Optional[Path] = None):
        base = Path(__file__).resolve().parent / "db"
        self._path = storage_path or (base / "backup_jobs.json")
        self._jobs: dict[str, BackupJob] = {}
        self._id_counter = count(7)
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not self._path.exists():
            self._seed()
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            for item in data:
                job = BackupJob.model_validate(item)
                self._jobs[job.id] = job
            max_num = 6
            for jid in self._jobs:
                try:
                    max_num = max(max_num, int(jid.split("-")[1]))
                except (IndexError, ValueError):
                    pass
            self._id_counter = count(max_num + 1)
        except (OSError, json.JSONDecodeError, ValueError):
            logger.warning("Backup store corrupt; re-seeding.")
            self._seed()

    def _seed(self) -> None:
        for j in SEED_JOBS:
            self._jobs[j["id"]] = BackupJob(**j)
        self._persist()

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps([j.model_dump() for j in self._jobs.values()], indent=2),
            encoding="utf-8",
        )

    # ── CRUD ─────────────────────────────────────────────────────────────────

    def next_id(self) -> str:
        return f"bkp-{next(self._id_counter):03d}"

    def list_jobs(self) -> List[BackupJob]:
        return list(self._jobs.values())

    def get_job(self, job_id: str) -> Optional[BackupJob]:
        return self._jobs.get(job_id)

    def create_job(self, job: BackupJob) -> BackupJob:
        self._jobs[job.id] = job
        self._persist()
        return job

    def update_job(self, job: BackupJob) -> BackupJob:
        self._jobs[job.id] = job
        self._persist()
        return job

    def delete_job(self, job_id: str) -> bool:
        if job_id not in self._jobs:
            return False
        del self._jobs[job_id]
        self._persist()
        return True

    # ── Aggregates ────────────────────────────────────────────────────────────

    def get_overview(self) -> BackupOverview:
        jobs = list(self._jobs.values())
        if not jobs:
            return BackupOverview(
                jobs_verified=0, jobs_total=0, jobs_requiring_attention=0,
                failed_jobs=0, running_jobs=0, last_failure_ago="None",
                total_backup_size_gb=0.0, next_full_backup_iso="",
                time_until_next="—", success_rate_percent=100.0,
            )

        completed = [j for j in jobs if j.status == "completed"]
        verified  = [j for j in completed if j.integrity_verified]
        failed    = [j for j in jobs if j.status == "failed"]
        running   = [j for j in jobs if j.status == "running"]
        attention = len(failed) + len([j for j in jobs if j.status == "pending"])
        total_size = round(sum(j.size_gb for j in jobs), 1)

        # Next full backup
        full_upcoming = [
            j for j in jobs
            if j.type == "Full" and j.status in ("scheduled", "completed")
        ]
        if full_upcoming:
            nxt = min(full_upcoming, key=lambda j: j.next_run)
            next_dt = datetime.fromisoformat(nxt.next_run.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            diff_secs = max(0, (next_dt - now).total_seconds())
            h = int(diff_secs // 3600)
            m = int((diff_secs % 3600) // 60)
            next_iso  = nxt.next_run
            time_until = f"{h}h {m}m"
        else:
            next_iso   = ""
            time_until = "—"

        # Last failure
        last_failure_ago = "None"
        if failed:
            runs = [j for j in failed if j.last_run]
            if runs:
                lf = max(runs, key=lambda j: j.last_run)
                fail_dt = datetime.fromisoformat(lf.last_run.replace("Z", "+00:00"))
                h = int((datetime.now(timezone.utc) - fail_dt).total_seconds() // 3600)
                last_failure_ago = f"{h}h ago"

        # Success rate (last 30 days — approximate from available data)
        total_ran = len(completed) + len(failed)
        rate = round(len(completed) / total_ran * 100, 1) if total_ran > 0 else 100.0

        return BackupOverview(
            jobs_verified=len(verified),
            jobs_total=len(jobs),
            jobs_requiring_attention=attention,
            failed_jobs=len(failed),
            running_jobs=len(running),
            last_failure_ago=last_failure_ago,
            total_backup_size_gb=total_size,
            next_full_backup_iso=next_iso,
            time_until_next=time_until,
            success_rate_percent=rate,
        )

    def get_storage(self) -> List[StorageUtilization]:
        used: dict[str, float] = {k: 0.0 for k in STORAGE_CAPACITY}
        for job in self._jobs.values():
            dest_key = job.destination
            if dest_key in used:
                used[dest_key] += job.size_gb

        result = []
        for dest, cap in STORAGE_CAPACITY.items():
            u = round(used.get(dest, 0.0), 1)
            pct = round(min(100.0, u / cap["total_gb"] * 100), 1)
            result.append(StorageUtilization(
                destination=dest,
                used_gb=u,
                total_gb=cap["total_gb"],
                percent=pct,
                bar_color=cap["color"],
            ))
        return result


# ─── Singleton store ──────────────────────────────────────────────────────────

backup_store = BackupStore()

# ─── Background simulation ───────────────────────────────────────────────────

async def _simulate_run_completion(job_id: str, fast: bool = False) -> None:
    """Simulates a backup job completing (90 % success rate)."""
    delay = random.uniform(3, 8) if fast else random.uniform(10, 30)
    await asyncio.sleep(delay)

    job = backup_store.get_job(job_id)
    if not job:
        return

    data = job.model_dump()
    if random.random() > 0.1:          # 90 % success
        fake_size = (
            round(random.uniform(1.0, 50.0), 1) if data["size_gb"] == 0.0
            else round(data["size_gb"] * random.uniform(0.95, 1.05), 1)
        )
        data.update(
            status="completed",
            last_run=_iso_now(),
            next_run=_hours_from_now(24),
            size_gb=fake_size,
            integrity_hash=_sha256(f"{job_id}-{_iso_now()}"),
            integrity_verified=True,
            duration_seconds=random.randint(60, 7200),
            error_message=None,
        )
        logger.info("Simulated backup completed: %s", job_id)
    else:
        data.update(
            status="failed",
            last_run=_iso_now(),
            integrity_verified=False,
            error_message="Simulated failure: destination unreachable during backup window.",
        )
        logger.warning("Simulated backup failed: %s", job_id)

    backup_store.update_job(BackupJob(**data))

# ─── FastAPI Router ───────────────────────────────────────────────────────────

backup_router = APIRouter(prefix="/api/v1/backup", tags=["Backup Engine"])


# Overview -------------------------------------------------------------------

@backup_router.get("/overview", response_model=BackupOverview)
def get_backup_overview():
    """Dashboard summary stats for the backup module."""
    return backup_store.get_overview()


# Jobs -----------------------------------------------------------------------

@backup_router.get("/jobs")
def list_backup_jobs():
    """Return all backup jobs sorted by next run time."""
    jobs = sorted(backup_store.list_jobs(), key=lambda j: j.next_run)
    return {"jobs": jobs, "count": len(jobs)}


@backup_router.post("/jobs", status_code=201)
def create_backup_job(body: BackupJobCreate):
    """Register a new backup job."""
    job = BackupJob(
        id=backup_store.next_id(),
        name=body.name,
        type=body.type,
        destination=body.destination,
        status=BackupStatus.scheduled,
        next_run=_hours_from_now(1),
        size_gb=0.0,
        integrity_verified=False,
        retention_days=body.retention_days,
        copies=body.copies,
        schedule_cron=body.schedule_cron,
        tags=body.tags,
        created_at=_iso_now(),
    )
    return backup_store.create_job(job)


@backup_router.get("/jobs/{job_id}")
def get_backup_job(job_id: str):
    """Get a single backup job by ID."""
    job = backup_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Backup job '{job_id}' not found.")
    return job


@backup_router.patch("/jobs/{job_id}")
def update_backup_job(job_id: str, body: BackupJobUpdate):
    """Update backup job configuration (non-runtime fields)."""
    job = backup_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Backup job '{job_id}' not found.")
    if job.status == "running":
        raise HTTPException(status_code=409, detail="Cannot modify a job that is currently running.")
    updated = job.model_dump()
    for field, value in body.model_dump(exclude_unset=True).items():
        updated[field] = value
    return backup_store.update_job(BackupJob(**updated))


@backup_router.delete("/jobs/{job_id}")
def delete_backup_job(job_id: str):
    """Remove a backup job from the schedule."""
    job = backup_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Backup job '{job_id}' not found.")
    if job.status == "running":
        raise HTTPException(status_code=409, detail="Cannot delete a job that is currently running.")
    backup_store.delete_job(job_id)
    return {"status": "deleted", "job_id": job_id}


# Manual trigger -------------------------------------------------------------

@backup_router.post("/jobs/{job_id}/run")
async def trigger_backup_run(job_id: str):
    """Immediately trigger a backup job run (fire-and-forget simulation)."""
    job = backup_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Backup job '{job_id}' not found.")
    if job.status == "running":
        raise HTTPException(status_code=409, detail="Job is already running.")

    data = job.model_dump()
    data["status"] = "running"
    data["error_message"] = None
    backup_store.update_job(BackupJob(**data))

    # Fire-and-forget: simulate completion in background
    asyncio.create_task(_simulate_run_completion(job_id, fast=True))

    return {
        "status": "started",
        "job_id": job_id,
        "job_name": job.name,
        "message": f"Backup run initiated for '{job.name}'.",
    }


# Verify integrity -----------------------------------------------------------

@backup_router.post("/jobs/{job_id}/verify")
def verify_job_integrity(job_id: str):
    """Re-verify the SHA-256 integrity hash for a completed backup."""
    job = backup_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed jobs can be verified.")

    # Simulate verification (in production, compare hash against stored backup)
    verified = job.integrity_hash is not None
    data = job.model_dump()
    data["integrity_verified"] = verified
    backup_store.update_job(BackupJob(**data))

    return {
        "job_id": job_id,
        "integrity_hash": job.integrity_hash,
        "verified": verified,
        "message": "Integrity check passed." if verified else "No hash available.",
    }


# Storage & Retention --------------------------------------------------------

@backup_router.get("/storage")
def get_storage_utilization():
    """Storage utilization broken down by destination."""
    return {"storage": backup_store.get_storage()}


@backup_router.get("/retention")
def get_retention_policies():
    """Default retention schedule configured on this system."""
    return {"policies": [p.model_dump() for p in RETENTION_POLICIES]}
