

import enum
from sqlalchemy import (
    Column, DateTime, Enum as SAEnum,
    String, Text, JSON,
)
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import ENUM

from db.database import Base


class TaskStatusDB(str, enum.Enum):
    pending     = "pending"
    in_progress = "in_progress"
    completed   = "completed"
    cancelled   = "cancelled"
    blocked     = "blocked"


class TaskPriorityDB(str, enum.Enum):
    p1 = "P1"
    p2 = "P2"
    p3 = "P3"
    p4 = "P4"


class TaskCategoryDB(str, enum.Enum):
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


# Pre-define the PostgreSQL ENUM types with explicit names
# This ensures SQLAlchemy uses the existing database types
task_status_enum = ENUM(
    'pending', 'in_progress', 'completed', 'cancelled', 'blocked',
    name='task_status',
    create_type=False
)

task_priority_enum = ENUM(
    'P1', 'P2', 'P3', 'P4',
    name='task_priority',
    create_type=False
)

task_category_enum = ENUM(
    'Backup', 'Security', 'Database', 'System', 'Network',
    'Auth / IAM', 'Incident Response', 'Patching', 'Monitoring', 'Other',
    name='task_category',
    create_type=False
)


class TaskORM(Base):
    __tablename__ = "tasks"

    id                 = Column(String(20),  primary_key=True, index=True)
    title              = Column(String(200), nullable=False)
    description        = Column(Text,        nullable=False)

    # Use pre-defined PostgreSQL ENUM types that reference existing database types
    category           = Column(task_category_enum, nullable=False)
    priority           = Column(task_priority_enum, nullable=False)
    status             = Column(task_status_enum, nullable=False, default='pending')

    assigned_to_email  = Column(String(255), nullable=True)
    assigned_to_name   = Column(String(200), nullable=True)
    assigned_by_email  = Column(String(255), nullable=True)
    assigned_by_name   = Column(String(200), nullable=True)

    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    due_date           = Column(DateTime(timezone=True), nullable=True)
    completed_at       = Column(DateTime(timezone=True), nullable=True)

    technician_notes   = Column(Text, nullable=True)
    admin_notes        = Column(Text, nullable=True)
    tags               = Column(JSON, nullable=False, default=list)
    attachment_refs    = Column(JSON, nullable=False, default=list)
