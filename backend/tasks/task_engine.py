"""
AITRMS Task Management Engine
==============================
Operational task assignment system.
IT Administrators create and assign tasks to IT Technicians (and other roles).
Technicians update status and add progress notes in real-time.

Integration — add to backend/main.py:
    from tasks.task_engine import task_router
    app.include_router(task_router)
"""

import enum
import json
import logging
from datetime import datetime, timezone, timedelta
from itertools import count
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger("TaskEngine")

# ─── Enums ────────────────────────────────────────────────────────────────────

class TaskStatus(str, enum.Enum):
    pending      = "pending"
    in_progress  = "in_progress"
    completed    = "completed"
    cancelled    = "cancelled"
    blocked      = "blocked"

class TaskPriority(str, enum.Enum):
    p1 = "P1"
    p2 = "P2"
    p3 = "P3"
    p4 = "P4"

class TaskCategory(str, enum.Enum):
    backup    = "Backup"
    security  = "Security"
    database  = "Database"
    system    = "System"
    network   = "Network"
    auth      = "Auth / IAM"
    incident  = "Incident Response"
    patch     = "Patching"
    monitoring = "Monitoring"
    other     = "Other"

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class Task(BaseModel):
    id: str
    title: str
    description: str
    category: TaskCategory
    priority: TaskPriority
    status: TaskStatus = TaskStatus.pending
    assigned_to_email: Optional[str] = None
    assigned_to_name:  Optional[str] = None
    assigned_by_email: Optional[str] = None
    assigned_by_name:  Optional[str] = None
    created_at:        str
    updated_at:        str
    due_date:          Optional[str] = None
    completed_at:      Optional[str] = None
    technician_notes:  Optional[str] = None
    admin_notes:       Optional[str] = None
    tags:              List[str] = []
    attachment_refs:   List[str] = []

class TaskCreate(BaseModel):
    title:             str
    description:       str
    category:          TaskCategory
    priority:          TaskPriority
    assigned_to_email: Optional[str] = None
    assigned_to_name:  Optional[str] = None
    assigned_by_email: Optional[str] = None
    assigned_by_name:  Optional[str] = None
    due_date:          Optional[str] = None
    admin_notes:       Optional[str] = None
    tags:              List[str] = []

class TaskUpdate(BaseModel):
    title:             Optional[str] = None
    description:       Optional[str] = None
    category:          Optional[TaskCategory] = None
    priority:          Optional[TaskPriority] = None
    status:            Optional[TaskStatus] = None
    assigned_to_email: Optional[str] = None
    assigned_to_name:  Optional[str] = None
    assigned_by_email: Optional[str] = None
    assigned_by_name:  Optional[str] = None
    due_date:          Optional[str] = None
    technician_notes:  Optional[str] = None
    admin_notes:       Optional[str] = None
    tags:              Optional[List[str]] = None

class TaskStatusUpdate(BaseModel):
    """Lightweight update for technicians — only status and their notes."""
    status:            TaskStatus
    technician_notes:  Optional[str] = None

class TaskAssign(BaseModel):
    """Reassign an existing task to a different technician."""
    assigned_to_email: str
    assigned_to_name:  Optional[str] = None
    assigned_by_email: Optional[str] = None
    assigned_by_name:  Optional[str] = None

class TaskOverview(BaseModel):
    total:         int
    pending:       int
    in_progress:   int
    completed:     int
    blocked:       int
    cancelled:     int
    overdue:       int
    unassigned:    int
    p1_open:       int

# ─── Seed helpers ─────────────────────────────────────────────────────────────

def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _days_from_now(d: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=d)).isoformat()

def _days_ago(d: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=d)).isoformat()

SEED_TASKS: list[dict] = [
    {
        "id": "task-001",
        "title": "SSL Certificate Renewal — Keycloak IAM",
        "description": (
            "The SSL certificate for the Keycloak identity provider expires in 3 days. "
            "Renew via Let's Encrypt (certbot), deploy to the Keycloak node, and restart the service. "
            "Verify login flow on staging before production."
        ),
        "category": "Auth / IAM",
        "priority": "P1",
        "status": "pending",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name":  "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name":  "System Manager",
        "created_at":        _days_ago(1),
        "updated_at":        _days_ago(1),
        "due_date":          _days_from_now(3),
        "admin_notes":       "Certificate must be renewed before midnight on the due date to avoid auth outages during peak hours.",
        "tags":              ["ssl", "keycloak", "auth", "critical"],
    },
    {
        "id": "task-002",
        "title": "PostgreSQL WAL Log Purge — Primary Node",
        "description": (
            "WAL logs have accumulated and disk usage is at 87%. "
            "Purge WAL segments older than the last 3 successful base backups. "
            "Run VACUUM ANALYZE on large tables (cve_cache, rbac_activity_logs). "
            "Document disk usage before and after."
        ),
        "category": "Database",
        "priority": "P2",
        "status": "in_progress",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name":  "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name":  "System Manager",
        "created_at":        _days_ago(2),
        "updated_at":        _days_ago(0),
        "due_date":          _days_from_now(0),
        "admin_notes":       "Disk at 87%, recovery window begins at 90%. Do not wait.",
        "technician_notes":  "Started WAL purge, currently at 79%. VACUUM running on cve_cache.",
        "tags":              ["postgres", "database", "storage", "urgent"],
    },
    {
        "id": "task-003",
        "title": "OS Patch Cycle — All Ubuntu 24 Nodes",
        "description": (
            "Apply all pending security patches (apt upgrade) to the 6 Ubuntu 24 nodes in the cluster. "
            "Schedule maintenance windows per node to avoid simultaneous reboots. "
            "Test Elasticsearch and Kafka connectivity after each reboot."
        ),
        "category": "Patching",
        "priority": "P2",
        "status": "pending",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name":  "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name":  "System Manager",
        "created_at":        _days_ago(3),
        "updated_at":        _days_ago(3),
        "due_date":          _days_from_now(7),
        "admin_notes":       "Monthly patch cycle. Coordinate with security analyst for CVE checks post-patch.",
        "tags":              ["patching", "ubuntu", "system"],
    },
    {
        "id": "task-004",
        "title": "Elasticsearch Index Rotation & Cleanup",
        "description": (
            "Rotate Elasticsearch indices older than 30 days to cold storage. "
            "Delete indices older than 90 days (filebeat-*). "
            "Adjust refresh_interval and number_of_replicas for current indices to reduce latency."
        ),
        "category": "Monitoring",
        "priority": "P3",
        "status": "pending",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name":  "IT Technician",
        "assigned_by_email": "analyst@cut.ac.zw",
        "assigned_by_name":  "Security Analyst",
        "created_at":        _days_ago(1),
        "updated_at":        _days_ago(1),
        "due_date":          _days_from_now(2),
        "admin_notes":       "Latency spikes observed. ELK disk at 64%. Rotate before ingestion backlog grows.",
        "tags":              ["elasticsearch", "elk", "logging", "performance"],
    },
    {
        "id": "task-005",
        "title": "Redis maxmemory Policy Review & Tune",
        "description": (
            "Redis is using allkeys-lru with 512MB limit. Review eviction logs and tune maxmemory to 768MB "
            "if host allows. Verify session cache hit rate post-change. Update config in redis.conf and "
            "document new settings."
        ),
        "category": "System",
        "priority": "P3",
        "status": "pending",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name":  "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name":  "System Manager",
        "created_at":        _days_ago(0),
        "updated_at":        _days_ago(0),
        "due_date":          _days_from_now(5),
        "tags":              ["redis", "cache", "performance"],
    },
    {
        "id": "task-006",
        "title": "Email Archive Backup — Tape Library Reconnect",
        "description": (
            "The Off-site Tape backup job for Email Archives failed with a connection timeout. "
            "Diagnose the tape library connection (iSCSI or Fibre Channel), restore connectivity, "
            "run a test backup, and verify SHA-256 hash integrity."
        ),
        "category": "Backup",
        "priority": "P1",
        "status": "blocked",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name":  "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name":  "System Manager",
        "created_at":        _days_ago(0),
        "updated_at":        _days_ago(0),
        "due_date":          _days_from_now(1),
        "admin_notes":       "Last successful tape backup was 48h ago. SLA requires daily. Escalate to vendor if HW issue.",
        "technician_notes":  "Tape library not responding on port 3260. Awaiting vendor callback for iSCSI config.",
        "tags":              ["backup", "tape", "storage", "blocked"],
    },
]

# ─── Task Store ───────────────────────────────────────────────────────────────

class TaskStore:
    def __init__(self, storage_path: Optional[Path] = None):
        base = Path(__file__).resolve().parent / "db"
        self._path = storage_path or (base / "tasks.json")
        self._tasks: dict[str, Task] = {}
        self._counter = count(7)
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not self._path.exists():
            self._seed(); return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            for item in raw:
                t = Task.model_validate(item)
                self._tasks[t.id] = t
            max_num = 6
            for tid in self._tasks:
                try:
                    max_num = max(max_num, int(tid.split("-")[1]))
                except (IndexError, ValueError):
                    pass
            self._counter = count(max_num + 1)
        except Exception:
            logger.warning("Task store corrupt; re-seeding.")
            self._seed()

    def _seed(self) -> None:
        for t in SEED_TASKS:
            self._tasks[t["id"]] = Task(**t)
        self._persist()

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps([t.model_dump() for t in self._tasks.values()], indent=2),
            encoding="utf-8",
        )

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def next_id(self) -> str:
        return f"task-{next(self._counter):03d}"

    def list_tasks(
        self,
        assigned_to: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        priority: Optional[TaskPriority] = None,
        category: Optional[TaskCategory] = None,
    ) -> List[Task]:
        result = list(self._tasks.values())
        if assigned_to:
            result = [t for t in result if t.assigned_to_email == assigned_to]
        if status:
            result = [t for t in result if t.status == status]
        if priority:
            result = [t for t in result if t.priority == priority]
        if category:
            result = [t for t in result if t.category == category]
        # Sort: P1 first, then by created_at desc
        priority_order = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}
        result.sort(key=lambda t: (priority_order.get(t.priority, 9), t.created_at), reverse=False)
        result.sort(key=lambda t: priority_order.get(t.priority, 9))
        return result

    def get_task(self, task_id: str) -> Optional[Task]:
        return self._tasks.get(task_id)

    def create_task(self, task: Task) -> Task:
        self._tasks[task.id] = task
        self._persist()
        return task

    def update_task(self, task: Task) -> Task:
        task.updated_at = _iso_now()
        self._tasks[task.id] = task
        self._persist()
        return task

    def delete_task(self, task_id: str) -> bool:
        if task_id not in self._tasks:
            return False
        del self._tasks[task_id]
        self._persist()
        return True

    # ── Aggregates ────────────────────────────────────────────────────────────

    def overview(self) -> TaskOverview:
        tasks = list(self._tasks.values())
        now = datetime.now(timezone.utc)

        def is_overdue(t: Task) -> bool:
            if t.status in (TaskStatus.completed, TaskStatus.cancelled):
                return False
            if not t.due_date:
                return False
            try:
                due = datetime.fromisoformat(t.due_date.replace("Z", "+00:00"))
                return due < now
            except ValueError:
                return False

        return TaskOverview(
            total=len(tasks),
            pending=sum(1 for t in tasks if t.status == TaskStatus.pending),
            in_progress=sum(1 for t in tasks if t.status == TaskStatus.in_progress),
            completed=sum(1 for t in tasks if t.status == TaskStatus.completed),
            blocked=sum(1 for t in tasks if t.status == TaskStatus.blocked),
            cancelled=sum(1 for t in tasks if t.status == TaskStatus.cancelled),
            overdue=sum(1 for t in tasks if is_overdue(t)),
            unassigned=sum(1 for t in tasks if not t.assigned_to_email),
            p1_open=sum(1 for t in tasks if t.priority == TaskPriority.p1 and t.status not in (TaskStatus.completed, TaskStatus.cancelled)),
        )


# ─── Singleton ────────────────────────────────────────────────────────────────

task_store = TaskStore()

# ─── Router ───────────────────────────────────────────────────────────────────

task_router = APIRouter(prefix="/api/v1/tasks", tags=["Task Management"])


# Overview -----------------------------------------------------------------------

@task_router.get("/overview", response_model=TaskOverview)
def get_task_overview():
    """Dashboard summary of all task statuses."""
    return task_store.overview()


# List / Create ------------------------------------------------------------------

@task_router.get("")
def list_tasks(
    assigned_to: Optional[str] = Query(None, description="Filter by assignee email"),
    status:      Optional[TaskStatus]   = Query(None),
    priority:    Optional[TaskPriority] = Query(None),
    category:    Optional[TaskCategory] = Query(None),
):
    """Return all tasks with optional filtering."""
    tasks = task_store.list_tasks(
        assigned_to=assigned_to,
        status=status,
        priority=priority,
        category=category,
    )
    return {"tasks": tasks, "count": len(tasks)}


@task_router.post("", status_code=201, response_model=Task)
def create_task(body: TaskCreate):
    """Create and optionally assign a new task."""
    task = Task(
        id=task_store.next_id(),
        title=body.title,
        description=body.description,
        category=body.category,
        priority=body.priority,
        status=TaskStatus.pending,
        assigned_to_email=body.assigned_to_email,
        assigned_to_name=body.assigned_to_name,
        assigned_by_email=body.assigned_by_email,
        assigned_by_name=body.assigned_by_name,
        due_date=body.due_date,
        admin_notes=body.admin_notes,
        tags=body.tags,
        created_at=_iso_now(),
        updated_at=_iso_now(),
    )
    return task_store.create_task(task)


# Single task --------------------------------------------------------------------

@task_router.get("/{task_id}", response_model=Task)
def get_task(task_id: str):
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return task


@task_router.patch("/{task_id}", response_model=Task)
def update_task(task_id: str, body: TaskUpdate):
    """Full or partial update (admin use — all fields)."""
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    data = task.model_dump()
    for field, value in body.model_dump(exclude_unset=True).items():
        data[field] = value
    return task_store.update_task(Task(**data))


@task_router.delete("/{task_id}")
def delete_task(task_id: str):
    """Remove a task permanently."""
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    if task.status == TaskStatus.in_progress:
        raise HTTPException(status_code=409, detail="Cannot delete a task that is in progress.")
    task_store.delete_task(task_id)
    return {"status": "deleted", "task_id": task_id}


# Assign -------------------------------------------------------------------------

@task_router.post("/{task_id}/assign", response_model=Task)
def assign_task(task_id: str, body: TaskAssign):
    """Assign or reassign a task to a technician."""
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    data = task.model_dump()
    data["assigned_to_email"] = body.assigned_to_email
    data["assigned_to_name"]  = body.assigned_to_name
    if body.assigned_by_email:
        data["assigned_by_email"] = body.assigned_by_email
    if body.assigned_by_name:
        data["assigned_by_name"] = body.assigned_by_name
    # Auto-set to pending if it was unassigned
    if data["status"] == TaskStatus.cancelled:
        pass  # keep cancelled
    else:
        data["status"] = TaskStatus.pending
    logger.info("Task %s assigned to %s", task_id, body.assigned_to_email)
    return task_store.update_task(Task(**data))


# Status update (technician) -----------------------------------------------------

@task_router.post("/{task_id}/status", response_model=Task)
def update_task_status(task_id: str, body: TaskStatusUpdate):
    """
    Lightweight endpoint for technicians:
    update status and optionally add progress notes.
    """
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    data = task.model_dump()
    data["status"] = body.status
    if body.technician_notes is not None:
        data["technician_notes"] = body.technician_notes
    if body.status == TaskStatus.completed:
        data["completed_at"] = _iso_now()
    elif body.status != TaskStatus.completed:
        data["completed_at"] = None   # reset if un-completing
    logger.info("Task %s status → %s", task_id, body.status)
    return task_store.update_task(Task(**data))
