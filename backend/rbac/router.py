"""
backend/rbac/router.py
======================
All RBAC endpoints mounted under  /api/v1/rbac/
Includes: auth login/logout/refresh/MFA, users CRUD, roles CRUD,
          permissions matrix, role settings, sessions, activity trail.
"""
import asyncio
import math
from typing import Any, Dict, List, Optional

import pyotp
from services.email_service import send_mfa_code, send_welcome_email
from services.otp_store import otp_store

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.database import get_db
from rbac import auth_utils as au
from rbac.models import (
    ActivityAction, ActivityResult,
    RBACActivityLog, RBACModule, RBACPermission, RBACRole, RBACRoleSettings,
    RBACSession, RBACUser, RBACUserPermission, RBACUserRole, UserStatus, MFARequirement,
)

router = APIRouter(prefix="/api/v1/rbac", tags=["RBAC"])


# ══════════════════════════════════════════════════════════════════════════════
# PYDANTIC SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email:     EmailStr
    password:  str
    totp_code: Optional[str] = None

class TokenOut(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int

class RefreshRequest(BaseModel):
    refresh_token: str

class MFASetupOut(BaseModel):
    secret: str; qr_code_url: str; backup_codes: List[str]

class MFAVerifyIn(BaseModel):
    totp_code: str = Field(..., min_length=6, max_length=6)

class RoleBasicOut(BaseModel):
    id: int; name: str; frontend_key: Optional[str]; mfa_requirement: MFARequirement
    model_config = {"from_attributes": True}

class UserOut(BaseModel):
    id: int; first_name: str; surname: str; email: str
    status: UserStatus; mfa_enabled: bool
    last_login: Optional[Any]; roles: List[RoleBasicOut] = []
    model_config = {"from_attributes": True}

class LoginOut(BaseModel):
    token: TokenOut; user: UserOut; mfa_required: bool = False; message: str = "Login successful"

class UserCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    surname:    str = Field(..., min_length=1, max_length=100)
    email:      EmailStr
    password:   str = Field(..., min_length=8)
    require_mfa: bool = False
    role_ids:    List[int] = []

    @field_validator("password")
    @classmethod
    def strong_pw(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError("Need at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Need at least one digit")
        return v

class UserUpdate(BaseModel):
    first_name: Optional[str] = None; surname: Optional[str] = None; email: Optional[EmailStr] = None

class StatusUpdate(BaseModel):
    status: UserStatus; reason: Optional[str] = None

class MFAToggle(BaseModel):
    enabled: bool

class PasswordChange(BaseModel):
    current_password: str; new_password: str = Field(..., min_length=8)

class RoleCreate(BaseModel):
    name:            str = Field(..., min_length=1, max_length=100)
    description:     Optional[str] = None
    frontend_key:    Optional[str] = None
    mfa_requirement: MFARequirement = MFARequirement.optional

class RoleUpdate(BaseModel):
    name: Optional[str] = None; description: Optional[str] = None
    mfa_requirement: Optional[MFARequirement] = None

class RoleOut(BaseModel):
    id: int; name: str; description: Optional[str]; frontend_key: Optional[str]
    mfa_requirement: MFARequirement; is_system_role: bool; user_count: int = 0; active_user_count: int = 0
    model_config = {"from_attributes": True}

class PermOut(BaseModel):
    id: int; module_id: int; module_name: str = ""; can_read: bool; can_write: bool; can_delete: bool; can_admin: bool
    model_config = {"from_attributes": True}

class PermUpdateItem(BaseModel):
    module_id: int; can_read: bool = False; can_write: bool = False; can_delete: bool = False; can_admin: bool = False

class BulkPermUpdate(BaseModel):
    permissions: List[PermUpdateItem]

class UserPermOut(BaseModel):
    module_id: int; module_name: str = ""; can_read: bool; can_write: bool; can_delete: bool; can_admin: bool; is_override: bool = False
    model_config = {"from_attributes": True}

class UserPermUpdateItem(BaseModel):
    module_id: int; can_read: bool = False; can_write: bool = False; can_delete: bool = False; can_admin: bool = False

class BulkUserPermUpdate(BaseModel):
    permissions: List[UserPermUpdateItem]

class SettingsUpdate(BaseModel):
    require_mfa: Optional[bool] = None
    session_timeout_minutes: Optional[int] = Field(None, ge=5, le=1440)
    max_failed_attempts: Optional[int] = Field(None, ge=1, le=20)
    pam_sessions_enabled: Optional[bool] = None
    restrict_working_hours: Optional[bool] = None
    geo_restriction_enabled: Optional[bool] = None
    allowed_countries: Optional[List[str]] = None
    allow_concurrent_sessions: Optional[bool] = None
    email_alert_on_login: Optional[bool] = None
    alert_on_role_change: Optional[bool] = None
    weekly_access_report: Optional[bool] = None

class SettingsOut(BaseModel):
    require_mfa: bool; session_timeout_minutes: int; max_failed_attempts: int
    pam_sessions_enabled: bool; restrict_working_hours: bool; working_hours_start: str
    working_hours_end: str; geo_restriction_enabled: bool; allowed_countries: List[str]
    allow_concurrent_sessions: bool; email_alert_on_login: bool
    alert_on_role_change: bool; weekly_access_report: bool
    model_config = {"from_attributes": True}

class SessionOut(BaseModel):
    id: int; user_id: int; user_email: str = ""; ip_address: Optional[str]
    is_active: bool; is_pam_session: bool; auth_source: str
    created_at: Any; last_activity: Any; expires_at: Any
    terminated_at: Optional[Any]; termination_reason: Optional[str]
    model_config = {"from_attributes": True}

class ActivityOut(BaseModel):
    id: int; timestamp: Any; actor_email: Optional[str]; target_user_email: Optional[str]
    role_name: Optional[str]; action: ActivityAction; result: ActivityResult
    details: Optional[Dict]; ip_address: Optional[str]
    model_config = {"from_attributes": True}

class Msg(BaseModel):
    message: str; success: bool = True

class Paginated(BaseModel):
    items: List[Any]; total: int; page: int; page_size: int; total_pages: int


# ══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/auth/login", response_model=LoginOut, summary="Login — returns JWT tokens")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    ip = au.get_client_ip(request)
    ua = request.headers.get("User-Agent", "")

    # Fetch user with roles eagerly loaded
    res  = await db.execute(
        select(RBACUser)
        .where(RBACUser.email == body.email)
        .options(selectinload(RBACUser.roles).selectinload(RBACRole.settings))
    )
    user = res.scalars().first()

    if not user or not user.hashed_password:
        await au.log_activity(db, ActivityAction.login_failed, ActivityResult.failed,
                              details={"email": body.email, "reason": "not found"}, ip_address=ip)
        raise HTTPException(401, "Invalid email or password")

    if user.status == UserStatus.suspended:
        raise HTTPException(403, "Account suspended")
    if user.status == UserStatus.locked:
        raise HTTPException(403, "Account locked — contact your administrator")

    # Verify password
    if not au.verify_password(body.password, user.hashed_password):
        user.failed_login_attempts += 1
        max_attempts = 5
        for role in user.roles:
            if role.settings:
                max_attempts = min(max_attempts, role.settings.max_failed_attempts)
        if user.failed_login_attempts >= max_attempts:
            user.status = UserStatus.locked
            await db.commit()
            await au.log_activity(db, ActivityAction.auto_lockout, ActivityResult.enforced,
                                   target_user=user, details={"email": user.email, "attempts": user.failed_login_attempts}, ip_address=ip)
            raise HTTPException(403, "Account locked after too many failed attempts")
        await db.commit()
        await au.log_activity(db, ActivityAction.login_failed, ActivityResult.failed,
                               target_user=user, details={"email": user.email, "attempts": user.failed_login_attempts}, ip_address=ip)
        raise HTTPException(401, "Invalid email or password")

    # ── MFA check (email OTP) ──────────────────────────────────────────────
    mfa_required = user.mfa_enabled or any(r.settings and r.settings.require_mfa for r in user.roles)
    if mfa_required:
        if not body.totp_code:
            # Step 1 — password correct, no OTP yet: generate, store and email it
            code = await otp_store.create(user.id)
            asyncio.create_task(
                asyncio.to_thread(
                    send_mfa_code,
                    user.email,
                    f"{user.first_name} {user.surname}",
                    code,
                )
            )
            return LoginOut(
                token=TokenOut(access_token="", refresh_token="", expires_in=0),
                user=UserOut.model_validate(user),
                mfa_required=True,
                message="A verification code has been sent to your email address.",
            )

        # Step 2 — OTP submitted: verify against stored code
        code_valid = await otp_store.verify(user.id, body.totp_code)
        if not code_valid:
            still_pending = await otp_store.has_pending(user.id)
            await au.log_activity(db, ActivityAction.login_failed, ActivityResult.failed,
                                   target_user=user, details={"reason": "invalid or expired email OTP"}, ip_address=ip)
            if still_pending:
                raise HTTPException(401, "Incorrect code — please try again.")
            else:
                raise HTTPException(401, "Code has expired or was already used. Sign in again to receive a new one.")
    # ──────────────────────────────────────────────────────────────────────────

    # Check user-level permission overrides — if admin revoked all read access, block login
    user_perms = (await db.execute(
        select(RBACUserPermission).where(RBACUserPermission.user_id == user.id)
    )).scalars().all()
    if user_perms and not any(p.can_read for p in user_perms):
        await au.log_activity(db, ActivityAction.login_failed, ActivityResult.denied,
                               target_user=user,
                               details={"email": user.email, "reason": "access revoked by administrator"},
                               ip_address=ip)
        raise HTTPException(403, "Access revoked — contact your IT Administrator")

    # Success — reset counter, build session
    from datetime import datetime, timezone
    user.failed_login_attempts = 0
    user.last_login    = datetime.now(timezone.utc)
    user.last_login_ip = ip
    await db.commit()

    # Concurrent-session policy
    for role in user.roles:
        if role.settings and not role.settings.allow_concurrent_sessions:
            old = await db.execute(
                select(RBACSession).where(RBACSession.user_id == user.id, RBACSession.is_active == True)
            )
            for s in old.scalars().all():
                await au.terminate_session(db, s, "New login — concurrent disallowed")

    timeout = au.get_timeout_for_user(user)
    session, access, refresh = await au.create_session(db, user, ip, ua, timeout)
    await au.log_activity(db, ActivityAction.login, ActivityResult.success,
                           actor=user, ip_address=ip, session_id=session.id)

    return LoginOut(
        token=TokenOut(access_token=access, refresh_token=refresh, expires_in=timeout * 60),
        user=UserOut.model_validate(user),
    )


@router.post("/auth/logout", response_model=Msg)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: RBACUser = Depends(au.get_current_rbac_user),
):
    token = (request.headers.get("Authorization", "")).replace("Bearer ", "").strip()
    res = await db.execute(select(RBACSession).where(RBACSession.session_token == token))
    s   = res.scalars().first()
    if s:
        await au.terminate_session(db, s, "User logout")
    await au.log_activity(db, ActivityAction.logout, ActivityResult.success,
                           actor=current_user, ip_address=au.get_client_ip(request))
    return Msg(message="Logged out successfully")


@router.post("/auth/refresh", response_model=TokenOut)
async def refresh(
    request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db),
):
    payload = au.decode_refresh_token(body.refresh_token)
    if not payload:
        raise HTTPException(401, "Invalid or expired refresh token")
    res  = await db.execute(select(RBACUser).where(RBACUser.id == int(payload["sub"])))
    user = res.scalars().first()
    if not user or user.status != UserStatus.active:
        raise HTTPException(401, "User not found or inactive")
    res2    = await db.execute(
        select(RBACSession).where(RBACSession.refresh_token == body.refresh_token, RBACSession.is_active == True)
    )
    old = res2.scalars().first()
    if not old:
        raise HTTPException(401, "Session not found")
    await au.terminate_session(db, old, "Token refreshed")
    timeout = au.get_timeout_for_user(user)
    ip      = au.get_client_ip(request)
    session, access, new_refresh = await au.create_session(db, user, ip, request.headers.get("User-Agent"), timeout)
    await au.log_activity(db, ActivityAction.token_refresh, ActivityResult.success,
                           actor=user, ip_address=ip, session_id=session.id)
    return TokenOut(access_token=access, refresh_token=new_refresh, expires_in=timeout * 60)


@router.get("/auth/me", response_model=UserOut)
async def me(current_user: RBACUser = Depends(au.get_current_rbac_user)):
    return current_user


@router.post("/auth/mfa/setup", response_model=MFASetupOut)
async def mfa_setup(
    current_user: RBACUser = Depends(au.get_current_rbac_user),
    db: AsyncSession = Depends(get_db),
):
    secret = au.generate_mfa_secret()
    current_user.mfa_secret = secret
    await db.commit()
    return MFASetupOut(
        secret=secret, qr_code_url=au.get_totp_uri(secret, current_user.email),
        backup_codes=au.generate_backup_codes(),
    )


@router.post("/auth/mfa/verify", response_model=Msg)
async def mfa_verify(
    body: MFAVerifyIn,
    current_user: RBACUser = Depends(au.get_current_rbac_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.mfa_secret:
        raise HTTPException(400, "Call /auth/mfa/setup first")
    if not au.verify_totp(current_user.mfa_secret, body.totp_code):
        raise HTTPException(400, "Invalid TOTP code")
    current_user.mfa_enabled = True
    await db.commit()
    await au.log_activity(db, ActivityAction.mfa_toggle, ActivityResult.success,
                           actor=current_user, target_user=current_user, details={"enabled": True})
    return Msg(message="MFA enabled")


# ══════════════════════════════════════════════════════════════════════════════
# USERS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/users", response_model=Paginated)
async def list_users(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    status: Optional[UserStatus] = None, search: Optional[str] = None,
    role_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: RBACUser = Depends(au.get_current_rbac_user),
):
    q = select(RBACUser).options(selectinload(RBACUser.roles))
    if role_id:
        q = q.join(RBACUserRole, RBACUser.id == RBACUserRole.user_id).where(RBACUserRole.role_id == role_id)
    if status:
        q = q.where(RBACUser.status == status)
    if search:
        t = f"%{search}%"
        q = q.where(
            RBACUser.first_name.ilike(t) | RBACUser.surname.ilike(t) | RBACUser.email.ilike(t)
        )
    count_q = select(func.count()).select_from(q.subquery())
    total   = (await db.execute(count_q)).scalar_one()
    users   = (await db.execute(q.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return Paginated(items=[UserOut.model_validate(u) for u in users], total=total,
                     page=page, page_size=page_size, total_pages=math.ceil(total / page_size))


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    request: Request, body: UserCreate,
    db: AsyncSession = Depends(get_db),
    actor: RBACUser = Depends(au.get_current_rbac_user),
):
    clash = (await db.execute(select(RBACUser).where(RBACUser.email == body.email))).scalars().first()
    if clash:
        raise HTTPException(409, "Email already registered")
    user = RBACUser(
        first_name=body.first_name, surname=body.surname, email=body.email,
        hashed_password=au.hash_password(body.password), mfa_enabled=body.require_mfa,
        created_by=actor.id,
    )
    db.add(user)
    await db.flush()
    for rid in (body.role_ids or []):
        db.add(RBACUserRole(user_id=user.id, role_id=rid, assigned_by=actor.id))
    await db.commit()
    await db.refresh(user, ["roles"])
    await au.log_activity(db, ActivityAction.user_create, ActivityResult.success,
                           actor=actor, target_user=user, details={"roles": body.role_ids},
                           ip_address=au.get_client_ip(request))

    # ── Welcome email ─────────────────────────────────────────────────────────
    role_label = "System User"
    if body.role_ids:
        role_rec = (await db.execute(
            select(RBACRole).where(RBACRole.id == body.role_ids[0])
        )).scalars().first()
        if role_rec:
            role_label = role_rec.name
    asyncio.create_task(
        asyncio.to_thread(
            send_welcome_email,
            user.email,
            f"{user.first_name} {user.surname}",
            role_label,
            body.password,
        )
    )
    # ─────────────────────────────────────────────────────────────────────────

    return user


@router.get("/users/{uid}", response_model=UserOut)
async def get_user(uid: int, db: AsyncSession = Depends(get_db),
                   _: RBACUser = Depends(au.get_current_rbac_user)):
    u = (await db.execute(
        select(RBACUser).options(selectinload(RBACUser.roles)).where(RBACUser.id == uid)
    )).scalars().first()
    if not u:
        raise HTTPException(404, "User not found")
    return u


@router.put("/users/{uid}", response_model=UserOut)
async def update_user(
    request: Request, uid: int, body: UserUpdate,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    u = (await db.execute(
        select(RBACUser).options(selectinload(RBACUser.roles)).where(RBACUser.id == uid)
    )).scalars().first()
    if not u:
        raise HTTPException(404, "User not found")
    changes = {}
    if body.first_name: changes["first_name"] = (u.first_name, body.first_name); u.first_name = body.first_name
    if body.surname:    changes["surname"]     = (u.surname,    body.surname);    u.surname    = body.surname
    if body.email and body.email != u.email:
        if (await db.execute(select(RBACUser).where(RBACUser.email == body.email))).scalars().first():
            raise HTTPException(409, "Email in use")
        changes["email"] = (u.email, body.email); u.email = body.email
    await db.commit()
    await db.refresh(u, ["roles"])
    await au.log_activity(db, ActivityAction.user_update, ActivityResult.success,
                           actor=actor, target_user=u, details=changes,
                           ip_address=au.get_client_ip(request))
    return u


@router.delete("/users/{uid}", response_model=Msg)
async def delete_user(
    request: Request, uid: int,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    if uid == actor.id:
        raise HTTPException(400, "Cannot delete yourself")
    u = (await db.execute(select(RBACUser).where(RBACUser.id == uid))).scalars().first()
    if not u:
        raise HTTPException(404, "User not found")
    await au.log_activity(db, ActivityAction.user_delete, ActivityResult.success,
                           actor=actor, details={"email": u.email},
                           ip_address=au.get_client_ip(request))
    await db.delete(u); await db.commit()
    return Msg(message=f"User {u.email} deleted")


@router.patch("/users/{uid}/status", response_model=UserOut)
async def update_status(
    request: Request, uid: int, body: StatusUpdate,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    if uid == actor.id:
        raise HTTPException(400, "Cannot change your own status")
    u = (await db.execute(select(RBACUser).where(RBACUser.id == uid))).scalars().first()
    if not u:
        raise HTTPException(404)
    old = u.status; u.status = body.status
    if body.status == UserStatus.active:
        u.failed_login_attempts = 0
    await db.commit()
    u = (await db.execute(
        select(RBACUser).where(RBACUser.id == uid)
        .options(selectinload(RBACUser.roles))
    )).scalars().first()
    await au.log_activity(db, ActivityAction.status_change, ActivityResult.success,
                           actor=actor, target_user=u,
                           details={"from": old, "to": body.status, "reason": body.reason},
                           ip_address=au.get_client_ip(request))
    return u


@router.patch("/users/{uid}/mfa", response_model=UserOut)
async def toggle_mfa(
    request: Request, uid: int, body: MFAToggle,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    u = (await db.execute(
        select(RBACUser).where(RBACUser.id == uid)
        .options(selectinload(RBACUser.roles).selectinload(RBACRole.settings))
    )).scalars().first()
    if not u:
        raise HTTPException(404)
    if not body.enabled and any(r.settings and r.settings.require_mfa for r in u.roles):
        raise HTTPException(400, "MFA enforced by role — cannot disable")
    u.mfa_enabled = body.enabled
    if not body.enabled:
        u.mfa_secret = None
    await db.commit()
    u = (await db.execute(
        select(RBACUser).where(RBACUser.id == uid)
        .options(selectinload(RBACUser.roles))
    )).scalars().first()
    await au.log_activity(db, ActivityAction.mfa_toggle, ActivityResult.success,
                           actor=actor, target_user=u, details={"enabled": body.enabled},
                           ip_address=au.get_client_ip(request))
    return u


@router.post("/users/{uid}/password", response_model=Msg)
async def change_password(
    request: Request, uid: int, body: PasswordChange,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    is_admin = any(r.frontend_key == "it-admin" for r in actor.roles)
    if uid != actor.id and not is_admin:
        raise HTTPException(403, "Not authorised")
    u = (await db.execute(select(RBACUser).where(RBACUser.id == uid))).scalars().first()
    if not u:
        raise HTTPException(404)
    if uid == actor.id and not au.verify_password(body.current_password, u.hashed_password):
        raise HTTPException(400, "Current password incorrect")
    u.hashed_password = au.hash_password(body.new_password)
    await db.commit()
    await au.log_activity(db, ActivityAction.password_change, ActivityResult.success,
                           actor=actor, target_user=u, ip_address=au.get_client_ip(request))
    return Msg(message="Password updated")


# ── User-level permission overrides ──────────────────────────────────────────

@router.get("/users/{uid}/permissions", response_model=List[UserPermOut])
async def get_user_permissions(
    uid: int,
    db: AsyncSession = Depends(get_db),
    _: RBACUser = Depends(au.get_current_rbac_user),
):
    u = (await db.execute(
        select(RBACUser).where(RBACUser.id == uid).options(selectinload(RBACUser.roles))
    )).scalars().first()
    if not u:
        raise HTTPException(404, "User not found")

    modules = (await db.execute(select(RBACModule).where(RBACModule.is_active == True))).scalars().all()

    role_ids = [r.id for r in u.roles]
    role_perms: dict[int, dict] = {}
    if role_ids:
        rp_rows = (await db.execute(
            select(RBACPermission).where(RBACPermission.role_id.in_(role_ids))
            .options(selectinload(RBACPermission.module))
        )).scalars().all()
        for rp in rp_rows:
            existing = role_perms.get(rp.module_id, {})
            role_perms[rp.module_id] = {
                "can_read":   existing.get("can_read",   False) or rp.can_read,
                "can_write":  existing.get("can_write",  False) or rp.can_write,
                "can_delete": existing.get("can_delete", False) or rp.can_delete,
                "can_admin":  existing.get("can_admin",  False) or rp.can_admin,
            }

    up_rows = (await db.execute(
        select(RBACUserPermission).where(RBACUserPermission.user_id == uid)
    )).scalars().all()
    user_overrides = {up.module_id: up for up in up_rows}

    result = []
    for m in modules:
        override = user_overrides.get(m.id)
        if override:
            result.append(UserPermOut(
                module_id=m.id, module_name=m.name,
                can_read=override.can_read, can_write=override.can_write,
                can_delete=override.can_delete, can_admin=override.can_admin,
                is_override=True,
            ))
        else:
            base = role_perms.get(m.id, {})
            result.append(UserPermOut(
                module_id=m.id, module_name=m.name,
                can_read=base.get("can_read", False),
                can_write=base.get("can_write", False),
                can_delete=base.get("can_delete", False),
                can_admin=base.get("can_admin", False),
                is_override=False,
            ))
    return result


@router.put("/users/{uid}/permissions", response_model=Msg)
async def update_user_permissions(
    request: Request, uid: int, body: BulkUserPermUpdate,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    u = (await db.execute(select(RBACUser).where(RBACUser.id == uid))).scalars().first()
    if not u:
        raise HTTPException(404, "User not found")

    updated = []
    for pu in body.permissions:
        existing = (await db.execute(
            select(RBACUserPermission).where(
                RBACUserPermission.user_id == uid,
                RBACUserPermission.module_id == pu.module_id,
            )
        )).scalars().first()
        if existing:
            existing.can_read   = pu.can_read
            existing.can_write  = pu.can_write
            existing.can_delete = pu.can_delete
            existing.can_admin  = pu.can_admin
            existing.updated_by = actor.id
        else:
            db.add(RBACUserPermission(
                user_id=uid, module_id=pu.module_id,
                can_read=pu.can_read, can_write=pu.can_write,
                can_delete=pu.can_delete, can_admin=pu.can_admin,
                updated_by=actor.id,
            ))
        updated.append(pu.module_id)

    await db.commit()

    has_read = any(pu.can_read for pu in body.permissions)
    status_note = ""
    if body.permissions and not has_read and u.status == UserStatus.active:
        u.status = UserStatus.suspended
        await db.commit()
        await au.log_activity(db, ActivityAction.status_change, ActivityResult.enforced,
                               actor=actor, target_user=u,
                               details={"reason": "All module read permissions revoked", "auto": True},
                               ip_address=au.get_client_ip(request))
        status_note = " User suspended — all read access revoked."
    elif has_read and u.status == UserStatus.suspended:
        u.status = UserStatus.active
        u.failed_login_attempts = 0
        await db.commit()
        await au.log_activity(db, ActivityAction.status_change, ActivityResult.success,
                               actor=actor, target_user=u,
                               details={"reason": "Module read permissions restored", "auto": True},
                               ip_address=au.get_client_ip(request))
        status_note = " User reactivated — read access restored."

    await au.log_activity(db, ActivityAction.perm_update, ActivityResult.success,
                           actor=actor, target_user=u,
                           details={"modules": updated, "type": "user_override"},
                           ip_address=au.get_client_ip(request))
    return Msg(message=f"Updated {len(updated)} module permissions for user {u.email}.{status_note}")


# ══════════════════════════════════════════════════════════════════════════════
# ROLES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/roles", response_model=List[RoleOut])
async def list_roles(db: AsyncSession = Depends(get_db),
                     _: RBACUser = Depends(au.get_current_rbac_user)):
    roles = (await db.execute(
        select(RBACRole).options(selectinload(RBACRole.users))
    )).scalars().all()
    result = []
    for r in roles:
        out = RoleOut.model_validate(r)
        out.user_count = len(r.users)
        out.active_user_count = sum(1 for u in r.users if u.status == UserStatus.active)
        result.append(out)
    return result


@router.post("/roles", response_model=RoleOut, status_code=201)
async def create_role(
    request: Request, body: RoleCreate,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    if (await db.execute(select(RBACRole).where(RBACRole.name == body.name))).scalars().first():
        raise HTTPException(409, "Role name exists")
    role = RBACRole(name=body.name, description=body.description,
                    frontend_key=body.frontend_key, mfa_requirement=body.mfa_requirement)
    db.add(role); await db.flush()
    db.add(RBACRoleSettings(role_id=role.id, require_mfa=(body.mfa_requirement == MFARequirement.required)))
    modules = (await db.execute(select(RBACModule).where(RBACModule.is_active == True))).scalars().all()
    for m in modules:
        db.add(RBACPermission(role_id=role.id, module_id=m.id))
    await db.commit(); await db.refresh(role)
    out = RoleOut.model_validate(role); out.user_count = 0
    return out


@router.get("/roles/{rid}", response_model=RoleOut)
async def get_role(rid: int, db: AsyncSession = Depends(get_db),
                   _: RBACUser = Depends(au.get_current_rbac_user)):
    r = (await db.execute(
        select(RBACRole).where(RBACRole.id == rid).options(selectinload(RBACRole.users))
    )).scalars().first()
    if not r:
        raise HTTPException(404)
    out = RoleOut.model_validate(r); out.user_count = len(r.users)
    return out


@router.put("/roles/{rid}", response_model=RoleOut)
async def update_role(
    rid: int, body: RoleUpdate,
    db: AsyncSession = Depends(get_db), _: RBACUser = Depends(au.get_current_rbac_user),
):
    r = (await db.execute(
        select(RBACRole).where(RBACRole.id == rid).options(selectinload(RBACRole.users))
    )).scalars().first()
    if not r:
        raise HTTPException(404)
    if body.name: r.name = body.name
    if body.description is not None: r.description = body.description
    if body.mfa_requirement: r.mfa_requirement = body.mfa_requirement
    await db.commit()
    await db.refresh(r, ['users'])
    out = RoleOut.model_validate(r); out.user_count = len(r.users)
    return out


@router.delete("/roles/{rid}", response_model=Msg)
async def delete_role(
    request: Request, rid: int,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    r = (await db.execute(
        select(RBACRole).where(RBACRole.id == rid).options(selectinload(RBACRole.users))
    )).scalars().first()
    if not r:
        raise HTTPException(404)
    if r.is_system_role:
        raise HTTPException(400, "System roles cannot be deleted")
    if r.users:
        raise HTTPException(400, f"Remove {len(r.users)} users first")
    await db.delete(r); await db.commit()
    return Msg(message=f"Role '{r.name}' deleted")


@router.post("/roles/{rid}/users/{uid}", response_model=Msg)
async def assign_user(
    request: Request, rid: int, uid: int,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    r = (await db.execute(select(RBACRole).where(RBACRole.id == rid))).scalars().first()
    u = (await db.execute(select(RBACUser).where(RBACUser.id == uid))).scalars().first()
    if not r or not u:
        raise HTTPException(404)
    if (await db.execute(select(RBACUserRole).where(RBACUserRole.user_id == uid, RBACUserRole.role_id == rid))).scalars().first():
        raise HTTPException(409, "Already assigned")
    db.add(RBACUserRole(user_id=uid, role_id=rid, assigned_by=actor.id))
    await db.commit()
    await au.log_activity(db, ActivityAction.role_assign, ActivityResult.success,
                           actor=actor, target_user=u, role=r, ip_address=au.get_client_ip(request))
    return Msg(message=f"Assigned to '{r.name}'")


@router.delete("/roles/{rid}/users/{uid}", response_model=Msg)
async def remove_user_from_role(
    request: Request, rid: int, uid: int,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    r = (await db.execute(select(RBACRole).where(RBACRole.id == rid))).scalars().first()
    u = (await db.execute(select(RBACUser).where(RBACUser.id == uid))).scalars().first()
    ur = (await db.execute(select(RBACUserRole).where(RBACUserRole.user_id == uid, RBACUserRole.role_id == rid))).scalars().first()
    if not r or not u or not ur:
        raise HTTPException(404)
    await db.delete(ur); await db.commit()
    await au.log_activity(db, ActivityAction.role_remove, ActivityResult.success,
                           actor=actor, target_user=u, role=r, ip_address=au.get_client_ip(request))
    return Msg(message=f"Removed from '{r.name}'")


# ── Permissions ───────────────────────────────────────────────────────────────

@router.get("/roles/{rid}/permissions", response_model=List[PermOut])
async def get_permissions(rid: int, db: AsyncSession = Depends(get_db),
                           _: RBACUser = Depends(au.get_current_rbac_user)):
    perms = (await db.execute(
        select(RBACPermission)
        .where(RBACPermission.role_id == rid)
        .options(selectinload(RBACPermission.module))
    )).scalars().all()
    result = []
    for p in perms:
        out = PermOut.model_validate(p)
        out.module_name = p.module.name if p.module else ""
        result.append(out)
    return result


@router.put("/roles/{rid}/permissions", response_model=Msg)
async def update_permissions(
    request: Request, rid: int, body: BulkPermUpdate,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    r = (await db.execute(select(RBACRole).where(RBACRole.id == rid))).scalars().first()
    if not r:
        raise HTTPException(404)
    updated = []
    for pu in body.permissions:
        p = (await db.execute(
            select(RBACPermission).where(RBACPermission.role_id == rid, RBACPermission.module_id == pu.module_id)
        )).scalars().first()
        if not p:
            p = RBACPermission(role_id=rid, module_id=pu.module_id); db.add(p)
        p.can_read = pu.can_read; p.can_write = pu.can_write
        p.can_delete = pu.can_delete; p.can_admin = pu.can_admin
        p.updated_by = actor.id; updated.append(pu.module_id)
    await db.commit()
    await au.log_activity(db, ActivityAction.perm_update, ActivityResult.success,
                           actor=actor, role=r, details={"modules": updated},
                           ip_address=au.get_client_ip(request))
    return Msg(message=f"Updated {len(updated)} modules")


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/roles/{rid}/settings", response_model=SettingsOut)
async def get_settings(rid: int, db: AsyncSession = Depends(get_db),
                        _: RBACUser = Depends(au.get_current_rbac_user)):
    r = (await db.execute(
        select(RBACRole).where(RBACRole.id == rid).options(selectinload(RBACRole.settings))
    )).scalars().first()
    if not r or not r.settings:
        raise HTTPException(404)
    return r.settings


@router.put("/roles/{rid}/settings", response_model=SettingsOut)
async def update_settings(
    request: Request, rid: int, body: SettingsUpdate,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    r = (await db.execute(
        select(RBACRole).where(RBACRole.id == rid).options(selectinload(RBACRole.settings))
    )).scalars().first()
    if not r:
        raise HTTPException(404)
    if not r.settings:
        s = RBACRoleSettings(role_id=rid); db.add(s); await db.flush()
    s = r.settings
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    await db.commit(); await db.refresh(s)
    await au.log_activity(db, ActivityAction.settings_update, ActivityResult.success,
                           actor=actor, role=r,
                           details={"fields": list(body.model_dump(exclude_unset=True).keys())},
                           ip_address=au.get_client_ip(request))
    return s


# ══════════════════════════════════════════════════════════════════════════════
# SESSIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/sessions", response_model=List[SessionOut])
async def list_sessions(
    active_only: bool = False, user_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db), _: RBACUser = Depends(au.get_current_rbac_user),
):
    await au.expire_stale_sessions(db)
    q = select(RBACSession)
    if active_only: q = q.where(RBACSession.is_active == True)
    if user_id:     q = q.where(RBACSession.user_id == user_id)
    sessions = (await db.execute(q.order_by(RBACSession.created_at.desc()))).scalars().all()
    result = []
    for s in sessions:
        out = SessionOut.model_validate(s)
        if s.user: out.user_email = s.user.email
        result.append(out)
    return result


@router.get("/sessions/active/count")
async def active_session_count(db: AsyncSession = Depends(get_db),
                                _: RBACUser = Depends(au.get_current_rbac_user)):
    await au.expire_stale_sessions(db)
    total = (await db.execute(select(func.count()).where(RBACSession.is_active == True))).scalar_one()
    pam   = (await db.execute(
        select(func.count()).where(RBACSession.is_active == True, RBACSession.is_pam_session == True)
    )).scalar_one()
    return {"total_active": total, "pam_sessions": pam}


@router.delete("/sessions/{sid}", response_model=Msg)
async def kill_session(
    request: Request, sid: int,
    db: AsyncSession = Depends(get_db), actor: RBACUser = Depends(au.get_current_rbac_user),
):
    s = (await db.execute(select(RBACSession).where(RBACSession.id == sid))).scalars().first()
    if not s:
        raise HTTPException(404)
    if not s.is_active:
        raise HTTPException(400, "Already terminated")
    target = (await db.execute(select(RBACUser).where(RBACUser.id == s.user_id))).scalars().first()
    await au.terminate_session(db, s, "Killed by administrator", actor.id)
    await au.log_activity(db, ActivityAction.session_kill, ActivityResult.success,
                           actor=actor, target_user=target,
                           details={"session_id": sid}, ip_address=au.get_client_ip(request))
    return Msg(message=f"Session {sid} terminated")


# ══════════════════════════════════════════════════════════════════════════════
# ACTIVITY LOG
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/activity", response_model=List[ActivityOut])
async def list_activity(
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    action: Optional[ActivityAction] = None,
    result: Optional[ActivityResult] = None,
    actor_id: Optional[int] = None,
    role_id:  Optional[int] = None,
    actor_ids: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: RBACUser = Depends(au.get_current_rbac_user),
):
    from sqlalchemy import or_
    q = select(RBACActivityLog)
    if action:   q = q.where(RBACActivityLog.action   == action)
    if result:   q = q.where(RBACActivityLog.result   == result)
    if actor_id: q = q.where(RBACActivityLog.actor_id == actor_id)
    if actor_ids:
        ids = [int(i) for i in actor_ids.split(",") if i.strip().isdigit()]
        if ids:
            conditions = [
                RBACActivityLog.actor_id.in_(ids),
                RBACActivityLog.target_user_id.in_(ids),
            ]
            if role_id:
                conditions.append(RBACActivityLog.role_id == role_id)
            q = q.where(or_(*conditions))
    elif role_id:
        q = q.where(RBACActivityLog.role_id == role_id)
    logs = (await db.execute(
        q.order_by(RBACActivityLog.timestamp.desc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return logs


@router.get("/activity/{lid}", response_model=ActivityOut)
async def get_activity(lid: int, db: AsyncSession = Depends(get_db),
                        _: RBACUser = Depends(au.get_current_rbac_user)):
    log = (await db.execute(select(RBACActivityLog).where(RBACActivityLog.id == lid))).scalars().first()
    if not log:
        raise HTTPException(404)
    return log


# ══════════════════════════════════════════════════════════════════════════════
# MODULES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/modules")
async def list_modules(db: AsyncSession = Depends(get_db),
                        _: RBACUser = Depends(au.get_current_rbac_user)):
    return (await db.execute(select(RBACModule).where(RBACModule.is_active == True))).scalars().all()


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD STATS (feeds Access Control cards)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard/stats")
async def rbac_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _: RBACUser = Depends(au.get_current_rbac_user),
):
    await au.expire_stale_sessions(db)
    total     = (await db.execute(select(func.count(RBACUser.id)))).scalar_one()
    active    = (await db.execute(
        select(func.count(RBACUser.id)).where(RBACUser.status == UserStatus.active)
    )).scalar_one()
    mfa_count = (await db.execute(
        select(func.count(RBACUser.id)).where(RBACUser.mfa_enabled == True)
    )).scalar_one()
    pending   = (await db.execute(
        select(func.count(RBACActivityLog.id)).where(
            RBACActivityLog.action == ActivityAction.perm_request,
            RBACActivityLog.result == ActivityResult.pending,
        )
    )).scalar_one()
    pam       = (await db.execute(
        select(func.count(RBACSession.id)).where(
            RBACSession.is_active == True, RBACSession.is_pam_session == True
        )
    )).scalar_one()
    return {
        "total_users":       total,
        "active_users":      active,
        "mfa_enabled":       mfa_count,
        "mfa_adoption_rate": round(mfa_count / total * 100, 1) if total else 0,
        "pending_approvals": pending,
        "pam_sessions":      pam,
    }


@router.get("/dashboard/login-stats")
async def rbac_login_stats(
    db: AsyncSession = Depends(get_db),
    _: RBACUser = Depends(au.get_current_rbac_user),
):
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    logins_24h = (await db.execute(
        select(func.count(RBACActivityLog.id)).where(
            RBACActivityLog.action == ActivityAction.login,
            RBACActivityLog.result == ActivityResult.success,
            RBACActivityLog.timestamp >= cutoff,
        )
    )).scalar_one()

    failures_24h = (await db.execute(
        select(func.count(RBACActivityLog.id)).where(
            RBACActivityLog.action == ActivityAction.login_failed,
            RBACActivityLog.timestamp >= cutoff,
        )
    )).scalar_one()

    locked_users = (await db.execute(
        select(func.count(RBACUser.id)).where(RBACUser.status == UserStatus.locked)
    )).scalar_one()

    total_attempts = logins_24h + failures_24h
    failure_rate = round(failures_24h / total_attempts * 100, 1) if total_attempts else 0.0

    return {
        "logins_24h":   logins_24h,
        "failures_24h": failures_24h,
        "failure_rate": failure_rate,
        "locked_users": locked_users,
    }


@router.get("/dashboard/login-hourly")
async def rbac_login_hourly(
    db: AsyncSession = Depends(get_db),
    _: RBACUser = Depends(au.get_current_rbac_user),
):
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    logs = (await db.execute(
        select(RBACActivityLog.timestamp, RBACActivityLog.action, RBACActivityLog.result).where(
            RBACActivityLog.action.in_([ActivityAction.login, ActivityAction.login_failed]),
            RBACActivityLog.timestamp >= cutoff,
        )
    )).all()

    hourly: dict[int, dict] = {h: {"successful": 0, "failed": 0} for h in range(24)}
    for ts, action, result in logs:
        h = ts.hour
        if action == ActivityAction.login and result == ActivityResult.success:
            hourly[h]["successful"] += 1
        else:
            hourly[h]["failed"] += 1

    return {"hours": [{"hour": h, **counts} for h, counts in hourly.items()]}