"""
backend/rbac/seed.py
====================
Seeds the PostgreSQL DB with all 5 AITRMS roles (matching the frontend),
6 system modules, default permissions matrix, and the admin@cut.ac.zw account.


"""
import asyncio
from sqlalchemy import select

from db.database import engine, AsyncSessionLocal, Base
from rbac.models import (
    MFARequirement, RBACModule, RBACPermission, RBACRole, RBACRoleSettings,
    RBACUser, RBACUserRole, UserStatus,
)
from rbac.auth_utils import hash_password


# ─── Default role definitions ─────────────────────────────────────────────────

ROLES = [
    {
        "name": "IT Administrator",
        "frontend_key": "it-admin",
        "mfa_requirement": MFARequirement.optional,
        "is_system_role": True,
        "settings": {
            "require_mfa": False, "session_timeout_minutes": 30,
            "max_failed_attempts": 3, "pam_sessions_enabled": True,
            "restrict_working_hours": False, "geo_restriction_enabled": False,
            "allowed_countries": ["ZW"], "allow_concurrent_sessions": True,
            "email_alert_on_login": True, "alert_on_role_change": True,
            "weekly_access_report": True,
        },
    },
    {
        "name": "Security Analyst",
        "frontend_key": "security-analyst",
        "mfa_requirement": MFARequirement.required,
        "is_system_role": True,
        "settings": {
            "require_mfa": True, "session_timeout_minutes": 60,
            "max_failed_attempts": 5, "pam_sessions_enabled": False,
            "restrict_working_hours": True, "geo_restriction_enabled": True,
            "allowed_countries": ["ZW"], "allow_concurrent_sessions": False,
            "email_alert_on_login": True, "alert_on_role_change": True,
            "weekly_access_report": True,
        },
    },
    {
        "name": "Compliance Officer",
        "frontend_key": "compliance-officer",
        "mfa_requirement": MFARequirement.optional,
        "is_system_role": True,
        "settings": {
            "require_mfa": False, "session_timeout_minutes": 120,
            "max_failed_attempts": 5, "pam_sessions_enabled": False,
            "restrict_working_hours": True, "geo_restriction_enabled": False,
            "allow_concurrent_sessions": True, "email_alert_on_login": False,
            "alert_on_role_change": True, "weekly_access_report": True,
        },
    },
    {
        "name": "System Auditor",
        "frontend_key": "systems-auditor",
        "mfa_requirement": MFARequirement.optional,
        "is_system_role": True,
        "settings": {
            "require_mfa": False, "session_timeout_minutes": 120,
            "max_failed_attempts": 5, "pam_sessions_enabled": False,
            "restrict_working_hours": False, "geo_restriction_enabled": False,
            "allow_concurrent_sessions": True, "email_alert_on_login": False,
            "alert_on_role_change": False, "weekly_access_report": True,
        },
    },
    {
        "name": "IT Technician",
        "frontend_key": "it-technician",
        "mfa_requirement": MFARequirement.optional,
        "is_system_role": True,
        "settings": {
            "require_mfa": False, "session_timeout_minutes": 480,
            "max_failed_attempts": 5, "pam_sessions_enabled": False,
            "restrict_working_hours": True, "geo_restriction_enabled": False,
            "allow_concurrent_sessions": True, "email_alert_on_login": False,
            "alert_on_role_change": False, "weekly_access_report": False,
        },
    },
]

MODULES = [
    {"name": "Backup Engine",        "description": "Backup jobs and restore operations"},
    {"name": "RBAC Service",         "description": "Role-based access control management"},
    {"name": "Security Logging",     "description": "Security event logging and SIEM"},
    {"name": "File Access Detector", "description": "Unauthorised file access monitoring"},
    {"name": "Risk Assessment",      "description": "Risk scoring and CVE management"},
    {"name": "Compliance Manager",   "description": "Policy and compliance reporting"},
]

# {role_frontend_key: {module_name: (read, write, delete, admin)}}
PERMISSIONS_MATRIX = {
    "it-admin":           {m["name"]: (True, True, True, True)   for m in MODULES},
    "security-analyst":   {
        "Backup Engine":        (True,  False, False, False),
        "RBAC Service":         (True,  False, False, False),
        "Security Logging":     (True,  True,  False, False),
        "File Access Detector": (True,  True,  False, False),
        "Risk Assessment":      (True,  True,  False, False),
        "Compliance Manager":   (True,  False, False, False),
    },
    "compliance-officer": {
        "Backup Engine":        (False, False, False, False),
        "RBAC Service":         (True,  False, False, False),
        "Security Logging":     (True,  False, False, False),
        "File Access Detector": (False, False, False, False),
        "Risk Assessment":      (True,  False, False, False),
        "Compliance Manager":   (True,  True,  False, False),
    },
    "systems-auditor":    {m["name"]: (True, False, False, False) for m in MODULES},
    "it-technician":      {
        "Backup Engine":        (True,  True,  False, False),
        "RBAC Service":         (False, False, False, False),
        "Security Logging":     (False, False, False, False),
        "File Access Detector": (True,  False, False, False),
        "Risk Assessment":      (True,  False, False, False),
        "Compliance Manager":   (False, False, False, False),
    },
}

# Default user accounts matching the frontend demo credentials
DEFAULT_USERS = [
    {"first_name": "Marrison", "surname": "Banda",    "email": "marrisonbanda64@gmail.com", "password": "Admin@123",    "role": "it-admin"},
    {"first_name": "System", "surname": "Manager",    "email": "itadmin@cut.ac.zw",    "password": "Admin@12345",    "role": "it-admin"},
    {"first_name": "Security", "surname": "Analyst",  "email": "analyst@cut.ac.zw",    "password": "Analyst@12345",  "role": "security-analyst"},
    {"first_name": "Compliance", "surname": "Officer","email": "compliance@cut.ac.zw", "password": "Comply@12345",   "role": "compliance-officer"},
    {"first_name": "System", "surname": "Auditor",    "email": "auditor@cut.ac.zw",    "password": "Audit@12345",    "role": "systems-auditor"},
    {"first_name": "IT", "surname": "Technician",     "email": "tech@cut.ac.zw",       "password": "Tech@12345",     "role": "it-technician"},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # ── Modules ──────────────────────────────────────────────────────────
        module_map = {}
        for md in MODULES:
            existing = (await db.execute(select(RBACModule).where(RBACModule.name == md["name"]))).scalars().first()
            if not existing:
                existing = RBACModule(**md)
                db.add(existing)
                await db.flush()
                print(f"  ✓ Module:  {md['name']}")
            module_map[md["name"]] = existing

        # ── Roles + Settings + Permissions ───────────────────────────────────
        role_map = {}
        for rd in ROLES:
            settings_data = rd.pop("settings")
            existing = (await db.execute(select(RBACRole).where(RBACRole.frontend_key == rd["frontend_key"]))).scalars().first()
            if not existing:
                existing = RBACRole(**rd)
                db.add(existing)
                await db.flush()
                print(f"  ✓ Role:    {rd['name']}")
                # Settings
                db.add(RBACRoleSettings(role_id=existing.id, **settings_data))
                # Permissions
                perm_map = PERMISSIONS_MATRIX.get(rd["frontend_key"], {})
                for mod_name, (r, w, d, a) in perm_map.items():
                    mod = module_map.get(mod_name)
                    if mod:
                        db.add(RBACPermission(role_id=existing.id, module_id=mod.id,
                                              can_read=r, can_write=w, can_delete=d, can_admin=a))
            role_map[rd["frontend_key"]] = existing
            rd["settings"] = settings_data  # restore

        # ── Users ─────────────────────────────────────────────────────────────
        admin_user = None
        for ud in DEFAULT_USERS:
            existing = (await db.execute(select(RBACUser).where(RBACUser.email == ud["email"]))).scalars().first()
            if not existing:
                existing = RBACUser(
                    first_name=ud["first_name"], surname=ud["surname"], email=ud["email"],
                    hashed_password=hash_password(ud["password"]), status=UserStatus.active,
                )
                db.add(existing)
                await db.flush()
                role = role_map.get(ud["role"])
                if role:
                    db.add(RBACUserRole(user_id=existing.id, role_id=role.id, assigned_by=existing.id))
                print(f"  ✓ User:    {ud['email']}  /  {ud['password']}")
            if ud["role"] == "it-admin":
                admin_user = existing

        await db.commit()
        print("\n✅ RBAC seed complete!")
        print("\nDefault credentials:")
        for ud in DEFAULT_USERS:
            print(f"   {ud['email']:<30}  {ud['password']}")


if __name__ == "__main__":
    print("Seeding AITRMS tables into PostgreSQL...")
    asyncio.run(seed())