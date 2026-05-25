"""
AITRMS Task Management Engine — PostgreSQL edition
====================================================
Operational task assignment system backed by the shared PostgreSQL database.
IT Administrators create and assign tasks; Technicians update status / notes.

Migration from JSON file:
  Run backend/tasks/migration.sql against your aitrms database first, then
  replace backend/tasks/task_engine.py with this file.

Integration — backend/main.py (no change needed if already wired):
    from tasks.task_engine import task_router
    app.include_router(task_router)
"""

import enum
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import AsyncSessionLocal, get_db
from tasks.task_model import TaskCategoryDB, TaskORM, TaskPriorityDB, TaskStatusDB

logger = logging.getLogger("TaskEngine")

# ─── Enums (Pydantic-facing — kept identical so frontend sees no change) ──────

class TaskStatus(str, enum.Enum):
    pending     = "pending"
    in_progress = "in_progress"
    completed   = "completed"
    cancelled   = "cancelled"
    blocked     = "blocked"

class TaskPriority(str, enum.Enum):
    p1 = "P1"
    p2 = "P2"
    p3 = "P3"
    p4 = "P4"

class TaskCategory(str, enum.Enum):
    backup      = "Backup"
    security    = "Security"
    database    = "Database"
    system      = "System"
    network     = "Network"
    auth        = "Auth / IAM"
    incident    = "Incident Response"
    patch       = "Patching"
    monitoring  = "Monitoring"
    other       = "Other"

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class Task(BaseModel):
    id:                str
    title:             str
    description:       str
    category:          TaskCategory
    priority:          TaskPriority
    status:            TaskStatus = TaskStatus.pending
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
    title:             Optional[str]         = None
    description:       Optional[str]         = None
    category:          Optional[TaskCategory] = None
    priority:          Optional[TaskPriority] = None
    status:            Optional[TaskStatus]   = None
    assigned_to_email: Optional[str]         = None
    assigned_to_name:  Optional[str]         = None
    due_date:          Optional[str]         = None
    admin_notes:       Optional[str]         = None
    technician_notes:  Optional[str]         = None
    tags:              Optional[List[str]]   = None

class TaskStatusUpdate(BaseModel):
    status:            TaskStatus
    technician_notes:  Optional[str] = None

class TaskAssign(BaseModel):
    assigned_to_email: str
    assigned_to_name:  Optional[str] = None
    admin_notes:       Optional[str] = None

class TaskOverview(BaseModel):
    total:       int
    pending:     int
    in_progress: int
    completed:   int
    cancelled:   int
    blocked:     int
    p1_open:     int
    overdue:     int

# ─── Helper: ORM → Pydantic ───────────────────────────────────────────────────

def _orm_to_task(row: TaskORM) -> Task:
    def _iso(dt) -> Optional[str]:
        if dt is None:
            return None
        if isinstance(dt, datetime):
            return dt.astimezone(timezone.utc).isoformat()
        return str(dt)

    return Task(
        id=row.id,
        title=row.title,
        description=row.description,
        category=TaskCategory(row.category.value if hasattr(row.category, "value") else row.category),
        priority=TaskPriority(row.priority.value if hasattr(row.priority, "value") else row.priority),
        status=TaskStatus(row.status.value if hasattr(row.status, "value") else row.status),
        assigned_to_email=row.assigned_to_email,
        assigned_to_name=row.assigned_to_name,
        assigned_by_email=row.assigned_by_email,
        assigned_by_name=row.assigned_by_name,
        created_at=_iso(row.created_at) or "",
        updated_at=_iso(row.updated_at) or "",
        due_date=_iso(row.due_date),
        completed_at=_iso(row.completed_at),
        technician_notes=row.technician_notes,
        admin_notes=row.admin_notes,
        tags=row.tags or [],
        attachment_refs=row.attachment_refs or [],
    )


def _next_task_id() -> str:
    """Short collision-resistant ID: TASK-<8 hex chars>"""
    return f"TASK-{uuid.uuid4().hex[:8].upper()}"

# ─── Seed helper (runs once on startup if table is empty) ────────────────────

SEED_TASKS = [
    {
        "title": "Verify PostgreSQL backup integrity",
        "description": "Run SHA-256 integrity check on last night's PostgreSQL dump and update the backup log.",
        "category": "Backup",
        "priority": "P1",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name": "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name": "System Manager",
        "admin_notes": "Check bkp-001 — NAS destination. Escalate if hash mismatch.",
        "tags": ["database", "critical", "backup"],
    },
    {
        "title": "Patch Keycloak to latest stable",
        "description": "Apply the latest Keycloak security patch. Test SSO login across all roles post-patch.",
        "category": "Patching",
        "priority": "P1",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name": "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name": "System Manager",
        "admin_notes": "Reference: CVE-2024-3094 workaround notes in Confluence.",
        "tags": ["auth", "patching", "keycloak"],
    },
    {
        "title": "Restart Elasticsearch cluster nodes",
        "description": "Rolling restart of ELK nodes to apply updated JVM heap settings (-Xmx4g).",
        "category": "System",
        "priority": "P2",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name": "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name": "System Manager",
        "tags": ["elk", "monitoring"],
    },
    {
        "title": "Review firewall rules on campus perimeter",
        "description": "Audit iptables rules. Remove stale DROP rules older than 90 days unless justified.",
        "category": "Network",
        "priority": "P2",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name": "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name": "System Manager",
        "admin_notes": "Export current ruleset to /backup/fw-rules-$(date).txt first.",
        "tags": ["network", "security"],
    },
    {
        "title": "Rotate Redis cache passwords",
        "description": "Update Redis AUTH passwords across all environment configs. Notify relevant services.",
        "category": "Security",
        "priority": "P3",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name": "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name": "System Manager",
        "tags": ["redis", "security"],
    },
    {
        "title": "Set up weekly MongoDB Events backup",
        "description": "Configure cron job for weekly MongoDB Events full export to S3. Test restore procedure.",
        "category": "Backup",
        "priority": "P3",
        "assigned_to_email": "tech@cut.ac.zw",
        "assigned_to_name": "IT Technician",
        "assigned_by_email": "itadmin@cut.ac.zw",
        "assigned_by_name": "System Manager",
        "tags": ["database", "backup", "mongodb"],
    },
]


async def _seed_tasks_if_empty() -> None:
    """Insert seed tasks only when the tasks table is empty."""
    async with AsyncSessionLocal() as db:
        count_result = await db.execute(select(func.count(TaskORM.id)))
        if (count_result.scalar() or 0) > 0:
            return

        now = datetime.now(timezone.utc)
        for seed in SEED_TASKS:
            task = TaskORM(
                id=_next_task_id(),
                title=seed["title"],
                description=seed["description"],
                category=seed["category"],  # Now using string values directly
                priority=seed["priority"],  # Now using string values directly
                status="pending",  # Use string instead of enum
                assigned_to_email=seed.get("assigned_to_email"),
                assigned_to_name=seed.get("assigned_to_name"),
                assigned_by_email=seed.get("assigned_by_email"),
                assigned_by_name=seed.get("assigned_by_name"),
                admin_notes=seed.get("admin_notes"),
                tags=seed.get("tags", []),
                attachment_refs=[],
            )
            db.add(task)
        await db.commit()
        logger.info("Task table seeded with %d tasks.", len(SEED_TASKS))


# ─── FastAPI Router ───────────────────────────────────────────────────────────

task_router = APIRouter(prefix="/api/v1/tasks", tags=["Task Engine"])


@task_router.on_event("startup")   # noqa — fires once
async def _startup():
    await _seed_tasks_if_empty()


# ── Overview ─────────────────────────────────────────────────────────────────

@task_router.get("/overview", response_model=TaskOverview)
async def get_task_overview(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)

    rows = (await db.execute(select(TaskORM))).scalars().all()

    def _status(row, s): return row.status.value == s if hasattr(row.status, "value") else row.status == s
    def _priority(row, p): return row.priority.value == p if hasattr(row.priority, "value") else row.priority == p

    total       = len(rows)
    pending     = sum(1 for r in rows if _status(r, "pending"))
    in_progress = sum(1 for r in rows if _status(r, "in_progress"))
    completed   = sum(1 for r in rows if _status(r, "completed"))
    cancelled   = sum(1 for r in rows if _status(r, "cancelled"))
    blocked     = sum(1 for r in rows if _status(r, "blocked"))
    p1_open     = sum(1 for r in rows if _priority(r, "P1") and not _status(r, "completed") and not _status(r, "cancelled"))
    overdue     = sum(
        1 for r in rows
        if r.due_date and r.due_date.replace(tzinfo=timezone.utc) < now
        and not _status(r, "completed") and not _status(r, "cancelled")
    )

    return TaskOverview(
        total=total,
        pending=pending,
        in_progress=in_progress,
        completed=completed,
        cancelled=cancelled,
        blocked=blocked,
        p1_open=p1_open,
        overdue=overdue,
    )


# ── List Tasks ────────────────────────────────────────────────────────────────

@task_router.get("", response_model=List[Task])
async def list_tasks(
    assigned_to: Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    priority:    Optional[str] = Query(None),
    category:    Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(TaskORM)
    if assigned_to:
        q = q.where(TaskORM.assigned_to_email == assigned_to)
    if status:
        q = q.where(TaskORM.status == status)
    if priority:
        q = q.where(TaskORM.priority == priority)
    if category:
        q = q.where(TaskORM.category == category)

    rows = (await db.execute(q.order_by(TaskORM.created_at.desc()))).scalars().all()
    return [_orm_to_task(r) for r in rows]


# ── Create Task ───────────────────────────────────────────────────────────────

@task_router.post("", response_model=Task, status_code=201)
async def create_task(body: TaskCreate, db: AsyncSession = Depends(get_db)):
    due_dt = None
    if body.due_date:
        try:
            due_dt = datetime.fromisoformat(body.due_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid due_date format. Use ISO 8601.")

    task = TaskORM(
        id=_next_task_id(),
        title=body.title,
        description=body.description,
        category=body.category.value,  # Use string value directly
        priority=body.priority.value,  # Use string value directly
        status="pending",  # Use string instead of enum
        assigned_to_email=body.assigned_to_email,
        assigned_to_name=body.assigned_to_name,
        assigned_by_email=body.assigned_by_email,
        assigned_by_name=body.assigned_by_name,
        due_date=due_dt,
        admin_notes=body.admin_notes,
        tags=body.tags,
        attachment_refs=[],
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    logger.info("Task created: %s — %s", task.id, task.title)
    return _orm_to_task(task)


# ── Get Single Task ───────────────────────────────────────────────────────────

@task_router.get("/{task_id}", response_model=Task)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(TaskORM).where(TaskORM.id == task_id))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return _orm_to_task(row)


# ── Update Task ───────────────────────────────────────────────────────────────

@task_router.patch("/{task_id}", response_model=Task)
async def update_task(task_id: str, body: TaskUpdate, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(TaskORM).where(TaskORM.id == task_id))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in ("category", "priority", "status") and value is not None:
            # Convert enum to string value
            setattr(row, field, value.value if hasattr(value, "value") else value)
        else:
            setattr(row, field, value)

    if "status" in update_data and update_data["status"] == "completed":
        row.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    return _orm_to_task(row)


# ── Delete Task ───────────────────────────────────────────────────────────────

@task_router.delete("/{task_id}")
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(TaskORM).where(TaskORM.id == task_id))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    await db.delete(row)
    await db.commit()
    return {"status": "deleted", "task_id": task_id}


# ── Reassign Task ─────────────────────────────────────────────────────────────

@task_router.post("/{task_id}/assign", response_model=Task)
async def assign_task(task_id: str, body: TaskAssign, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(TaskORM).where(TaskORM.id == task_id))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    row.assigned_to_email = body.assigned_to_email
    if body.assigned_to_name:
        row.assigned_to_name = body.assigned_to_name
    if body.admin_notes is not None:
        row.admin_notes = body.admin_notes
    await db.commit()
    await db.refresh(row)
    return _orm_to_task(row)


# ── Update Status (technician endpoint) ──────────────────────────────────────

@task_router.post("/{task_id}/status", response_model=Task)
async def update_task_status(task_id: str, body: TaskStatusUpdate, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(TaskORM).where(TaskORM.id == task_id))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

    row.status = body.status.value  # Use string value directly
    if body.technician_notes is not None:
        row.technician_notes = body.technician_notes
    if body.status == TaskStatus.completed:
        row.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    logger.info("Task %s status → %s", task_id, body.status)
    return _orm_to_task(row)
