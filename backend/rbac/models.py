"""
backend/rbac/models.py
======================
Async SQLAlchemy models for the RBAC subsystem.
Extends the existing AITRMS Base from db/database.py.
All tables prefixed with rbac_ to avoid conflicts.
"""
import enum
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SAEnum,
    Float, ForeignKey, Integer, JSON, String, Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

# Re-use the existing project Base so Alembic / create_all covers everything
from db.database import Base


# ─── Enums ───────────────────────────────────────────────────────────────────

class UserStatus(str, enum.Enum):
    active    = "active"
    suspended = "suspended"
    locked    = "locked"
    pending   = "pending"


class MFARequirement(str, enum.Enum):
    required = "Required"
    optional = "Optional"


class ActivityAction(str, enum.Enum):
    login          = "LOGIN"
    logout         = "LOGOUT"
    login_failed   = "LOGIN_FAILED"
    role_assign    = "ROLE_ASSIGN"
    role_remove    = "ROLE_REMOVE"
    mfa_toggle     = "MFA_TOGGLE"
    status_change  = "STATUS_CHANGE"
    perm_request   = "PERM_REQUEST"
    perm_update    = "PERM_UPDATE"
    auto_lockout   = "AUTO_LOCKOUT"
    session_kill   = "SESSION_KILL"
    user_create    = "USER_CREATE"
    user_update    = "USER_UPDATE"
    user_delete    = "USER_DELETE"
    settings_update = "SETTINGS_UPDATE"
    password_change = "PASSWORD_CHANGE"
    token_refresh  = "TOKEN_REFRESH"


class ActivityResult(str, enum.Enum):
    success  = "SUCCESS"
    failed   = "FAILED"
    pending  = "PENDING"
    enforced = "ENFORCED"
    denied   = "DENIED"


# ─── Association table ────────────────────────────────────────────────────────

class RBACUserRole(Base):
    __tablename__ = "rbac_user_roles"

    user_id     = Column(Integer, ForeignKey("rbac_users.id",  ondelete="CASCADE"), primary_key=True)
    role_id     = Column(Integer, ForeignKey("rbac_roles.id",  ondelete="CASCADE"), primary_key=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    assigned_by = Column(Integer, ForeignKey("rbac_users.id",  ondelete="SET NULL"), nullable=True)


# ─── Core Models ─────────────────────────────────────────────────────────────

class RBACRole(Base):
    __tablename__ = "rbac_roles"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), unique=True, nullable=False, index=True)
    description     = Column(Text, nullable=True)
    # Maps directly to the 5 roles in the frontend: it-admin, security-analyst, etc.
    frontend_key    = Column(String(60), unique=True, nullable=True)  # e.g. "it-admin"
    mfa_requirement = Column(SAEnum(MFARequirement), default=MFARequirement.optional)
    is_system_role  = Column(Boolean, default=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    users        = relationship("RBACUser", secondary="rbac_user_roles", back_populates="roles",
                                primaryjoin="RBACRole.id == RBACUserRole.role_id",
                                secondaryjoin="RBACUser.id == RBACUserRole.user_id")
    permissions  = relationship("RBACPermission", back_populates="role",   cascade="all, delete-orphan")
    settings     = relationship("RBACRoleSettings", back_populates="role", uselist=False, cascade="all, delete-orphan")
    activity_logs = relationship("RBACActivityLog", back_populates="role")


class RBACUser(Base):
    __tablename__ = "rbac_users"

    id                   = Column(Integer, primary_key=True, index=True)
    first_name           = Column(String(100), nullable=False)
    surname              = Column(String(100), nullable=False)
    email                = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password      = Column(String(255), nullable=True)  # NULL for Keycloak-only users
    keycloak_sub         = Column(String(255), unique=True, nullable=True, index=True)  # Keycloak subject claim
    status               = Column(SAEnum(UserStatus), default=UserStatus.active)
    mfa_enabled          = Column(Boolean, default=False)
    mfa_secret           = Column(String(64), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    last_login           = Column(DateTime(timezone=True), nullable=True)
    last_login_ip        = Column(String(45), nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    updated_at           = Column(DateTime(timezone=True), onupdate=func.now())
    created_by           = Column(Integer, ForeignKey("rbac_users.id", ondelete="SET NULL"), nullable=True)

    roles    = relationship("RBACRole", secondary="rbac_user_roles", back_populates="users",
                            primaryjoin="RBACUser.id == RBACUserRole.user_id",
                            secondaryjoin="RBACRole.id == RBACUserRole.role_id")
    sessions = relationship("RBACSession", back_populates="user",
                            cascade="all, delete-orphan",
                            foreign_keys="RBACSession.user_id")
    activity_logs  = relationship("RBACActivityLog", back_populates="actor",
                                  foreign_keys="RBACActivityLog.actor_id")
    target_logs    = relationship("RBACActivityLog", back_populates="target_user",
                                  foreign_keys="RBACActivityLog.target_user_id")


class RBACModule(Base):
    """System modules that fine-grained permissions can be granted on."""
    __tablename__ = "rbac_modules"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    permissions = relationship("RBACPermission", back_populates="module", cascade="all, delete-orphan")


class RBACPermission(Base):
    """Read/Write/Delete/Admin flags per role per module."""
    __tablename__ = "rbac_permissions"

    id         = Column(Integer, primary_key=True, index=True)
    role_id    = Column(Integer, ForeignKey("rbac_roles.id",   ondelete="CASCADE"), nullable=False)
    module_id  = Column(Integer, ForeignKey("rbac_modules.id", ondelete="CASCADE"), nullable=False)
    can_read   = Column(Boolean, default=False)
    can_write  = Column(Boolean, default=False)
    can_delete = Column(Boolean, default=False)
    can_admin  = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("rbac_users.id", ondelete="SET NULL"), nullable=True)

    role   = relationship("RBACRole",   back_populates="permissions")
    module = relationship("RBACModule", back_populates="permissions")


class RBACRoleSettings(Base):
    """Authentication policy and access-scope settings per role."""
    __tablename__ = "rbac_role_settings"

    id       = Column(Integer, primary_key=True, index=True)
    role_id  = Column(Integer, ForeignKey("rbac_roles.id", ondelete="CASCADE"), unique=True)

    # Authentication policy
    require_mfa              = Column(Boolean, default=False)
    session_timeout_minutes  = Column(Integer, default=60)
    max_failed_attempts      = Column(Integer, default=5)
    pam_sessions_enabled     = Column(Boolean, default=False)

    # Access scope
    restrict_working_hours   = Column(Boolean, default=False)
    working_hours_start      = Column(String(5), default="08:00")
    working_hours_end        = Column(String(5), default="17:00")
    geo_restriction_enabled  = Column(Boolean, default=False)
    allowed_countries        = Column(JSON, default=lambda: ["ZW"])
    allow_concurrent_sessions = Column(Boolean, default=False)

    # Notifications
    email_alert_on_login     = Column(Boolean, default=False)
    alert_on_role_change     = Column(Boolean, default=True)
    weekly_access_report     = Column(Boolean, default=False)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    role       = relationship("RBACRole", back_populates="settings")


class RBACSession(Base):
    """Active and historical user sessions — enables timeout and PAM tracking."""
    __tablename__ = "rbac_sessions"

    id                 = Column(Integer, primary_key=True, index=True)
    user_id            = Column(Integer, ForeignKey("rbac_users.id", ondelete="CASCADE"), nullable=False)
    session_token      = Column(String(1024), unique=True, nullable=False, index=True)
    refresh_token      = Column(String(1024), unique=True, nullable=True,  index=True)
    ip_address         = Column(String(45), nullable=True)
    user_agent         = Column(Text, nullable=True)
    is_active          = Column(Boolean, default=True)
    is_pam_session     = Column(Boolean, default=False)
    # Auth source: "internal" | "keycloak"
    auth_source        = Column(String(20), default="internal")
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    last_activity      = Column(DateTime(timezone=True), server_default=func.now())
    expires_at         = Column(DateTime(timezone=True), nullable=False)
    terminated_at      = Column(DateTime(timezone=True), nullable=True)
    terminated_by      = Column(Integer, ForeignKey("rbac_users.id", ondelete="SET NULL"), nullable=True)
    termination_reason = Column(String(200), nullable=True)

    user = relationship("RBACUser", back_populates="sessions", foreign_keys=[user_id])


class RBACActivityLog(Base):
    """
    Immutable audit trail — ISO 27001 A.9 compliant.
    Written on every significant security event.  Never deleted.
    """
    __tablename__ = "rbac_activity_logs"

    id                = Column(Integer, primary_key=True, index=True)
    timestamp         = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    actor_id          = Column(Integer, ForeignKey("rbac_users.id", ondelete="SET NULL"), nullable=True)
    actor_email       = Column(String(255), nullable=True)   # snapshot at event time
    target_user_id    = Column(Integer, ForeignKey("rbac_users.id", ondelete="SET NULL"), nullable=True)
    target_user_email = Column(String(255), nullable=True)   # snapshot
    role_id           = Column(Integer, ForeignKey("rbac_roles.id", ondelete="SET NULL"), nullable=True)
    role_name         = Column(String(100), nullable=True)   # snapshot
    action            = Column(SAEnum(ActivityAction), nullable=False)
    details           = Column(JSON, nullable=True)
    result            = Column(SAEnum(ActivityResult), nullable=False)
    ip_address        = Column(String(45), nullable=True)
    session_id        = Column(Integer, ForeignKey("rbac_sessions.id", ondelete="SET NULL"), nullable=True)

    actor       = relationship("RBACUser", back_populates="activity_logs",  foreign_keys=[actor_id])
    target_user = relationship("RBACUser", back_populates="target_logs",    foreign_keys=[target_user_id])
    role        = relationship("RBACRole", back_populates="activity_logs")