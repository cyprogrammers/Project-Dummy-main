import { useState, useEffect } from 'react'
import { users as usersAPI, roles as rolesAPI } from '../services/authService'

const NAV_ITEMS = [
  {
    id: 'risk',
    label: 'RISK OVERVIEW',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'backup',
    label: 'BACKUP STATUS',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
  {
    id: 'access',
    label: 'ACCESS CONTROL',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: 'incidents',
    label: 'INCIDENTS',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
]

function RoleProfileView({ role, onBack, dm, styles }) {
  const [activeTab, setActiveTab] = useState('users')
  const [showAddUser, setShowAddUser] = useState(false)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [pamEnabled, setPamEnabled] = useState(false)
  const [restrictHours, setRestrictHours] = useState(false)
  const [geoRestrict, setGeoRestrict] = useState(false)
  const [concurrentSessions, setConcurrentSessions] = useState(false)
  const [emailAlertLogin, setEmailAlertLogin] = useState(false)
  const [alertRoleChange, setAlertRoleChange] = useState(false)
  const [weeklyReport, setWeeklyReport] = useState(false)
  const [showEditUser, setShowEditUser] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [showRemoveUser, setShowRemoveUser] = useState(false)
  const [removingUser, setRemovingUser] = useState(null)
  const tabs = ['USERS', 'PERMISSIONS', 'SETTINGS', 'ACTIVITY LOG']
  const tabIds = ['users', 'permissions', 'settings', 'activity-log']

  // API State
  const [users, setUsers] = useState([])
  const [roleData, setRoleData] = useState(null)
  const [rolePermissions, setRolePermissions] = useState([])
  const [roleSettings, setRoleSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch users and role data on mount or when role changes
  useEffect(() => {
    fetchRoleData()
  }, [role])

  const fetchRoleData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Get all roles to find the current role ID
      const allRoles = await rolesAPI.list()
      const currentRole = allRoles.find(r => r.name === role)

      if (!currentRole) {
        console.error('Role not found:', role)
        setLoading(false)
        return
      }

      setRoleData(currentRole)

      // Fetch users filtered by this role
      const usersResponse = await usersAPI.list({ role_id: currentRole.id })
      setUsers(usersResponse.items || [])

      // Fetch permissions for this role
      const perms = await rolesAPI.permissions(currentRole.id)
      setRolePermissions(perms)

      // Fetch role settings
      try {
        const settings = await rolesAPI.getSettings(currentRole.id)
        setRoleSettings(settings)
        // Update UI toggles
        setMfaEnabled(settings.require_mfa)
        setPamEnabled(settings.pam_sessions_enabled)
        setRestrictHours(settings.restrict_working_hours)
        setGeoRestrict(settings.geo_restriction_enabled)
        setConcurrentSessions(settings.allow_concurrent_sessions)
        setEmailAlertLogin(settings.email_alert_on_login)
        setAlertRoleChange(settings.alert_on_role_change)
        setWeeklyReport(settings.weekly_access_report)
      } catch (err) {
        console.error('Error fetching role settings:', err)
      }

    } catch (err) {
      console.error('Error fetching role data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // CRUD Operations
  const handleAddUser = async (userData) => {
    try {
      await usersAPI.create({
        ...userData,
        role_ids: roleData ? [roleData.id] : []
      })
      await fetchRoleData() // Refresh the list
      setShowAddUser(false)
      alert('User added successfully!')
    } catch (err) {
      console.error('Error adding user:', err)
      alert('Failed to add user: ' + err.message)
    }
  }

  const handleUpdateUser = async (userId, updates) => {
    try {
      await usersAPI.update(userId, updates)
      await fetchRoleData() // Refresh the list
      setShowEditUser(false)
      setEditingUser(null)
      alert('User updated successfully!')
    } catch (err) {
      console.error('Error updating user:', err)
      alert('Failed to update user: ' + err.message)
    }
  }

  const handleDeleteUser = async (userId) => {
    try {
      await usersAPI.delete(userId)
      await fetchRoleData() // Refresh the list
      setShowRemoveUser(false)
      setRemovingUser(null)
      alert('User deleted successfully!')
    } catch (err) {
      console.error('Error deleting user:', err)
      alert('Failed to delete user: ' + err.message)
    }
  }

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
    try {
      await usersAPI.setStatus(userId, newStatus, 'Status changed from dashboard')
      await fetchRoleData()
    } catch (err) {
      console.error('Error toggling status:', err)
      alert('Failed to change status: ' + err.message)
    }
  }

  const handleToggleUserMFA = async (userId, currentMFA) => {
    try {
      await usersAPI.toggleMFA(userId, !currentMFA)
      await fetchRoleData()
    } catch (err) {
      console.error('Error toggling MFA:', err)
      alert('Failed to toggle MFA: ' + err.message)
    }
  }

  const permissionsBase = {
    'Backup Engine': { read: false, write: false, delete: false, admin: false },
    'RBAC Service': { read: false, write: false, delete: false, admin: false },
    'Security Logging': { read: false, write: false, delete: false, admin: false },
    'File Access Detector': { read: false, write: false, delete: false, admin: false },
    'Risk Assessment': { read: false, write: false, delete: false, admin: false },
    'Compliance Manager': { read: false, write: false, delete: false, admin: false },
  }

  const getDefaultPermissions = (currentRole) => {
    if (currentRole === 'IT Technician') {
      return {
        ...permissionsBase,
        'Backup Engine': { read: true, write: true, delete: false, admin: false },
        'RBAC Service': { read: true, write: false, delete: false, admin: false },
        'Security Logging': { read: true, write: false, delete: false, admin: false },
        'File Access Detector': { read: true, write: true, delete: false, admin: false },
        'Risk Assessment': { read: true, write: false, delete: false, admin: false },
      }
    }
    return permissionsBase
  }

  const [permissions, setPermissions] = useState(() => getDefaultPermissions(role))
  const [permissionsSaved, setPermissionsSaved] = useState(false)

  useEffect(() => {
    setPermissions(getDefaultPermissions(role))
    setPermissionsSaved(false)
  }, [role])

  const togglePermission = (module, perm) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [perm]: !prev[module][perm],
      },
    }))
  }

  const handleSavePermissions = () => {
    setPermissionsSaved(true)
    window.setTimeout(() => setPermissionsSaved(false), 1600)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <button onClick={onBack} style={styles.backBtn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Access Control
      </button>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', margin: '0 0 6px' }}>{role}</h2>
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', fontWeight: '500' }}>
              <span style={{ color: '#16a34a' }}>{users.filter(u => u.status === 'active').length} active</span>
              <span style={{ color: dm ? '#64748b' : '#9ca3af' }}>·</span>
              <span style={{ color: '#ef4444' }}>{users.filter(u => u.status === 'suspended').length} suspended</span>
              <span style={{ color: dm ? '#64748b' : '#9ca3af' }}>·</span>
              <span style={{ color: '#f97316' }}>{users.filter(u => u.mfa_enabled).length} MFA enabled</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowAddUser(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            Add User
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', color: dm ? '#94a3b8' : '#374151', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {(() => {
          const totalUsers = users.length
          const activeUsers = users.filter(u => u.status === 'active').length
          const suspendedUsers = users.filter(u => u.status === 'suspended').length
          const mfaEnabled = users.filter(u => u.mfa_enabled).length

          return [
            { label: 'Total Users',  value: totalUsers, color: '#1d4ed8' },
            { label: 'Active',       value: activeUsers, color: '#16a34a' },
            { label: 'Suspended',    value: suspendedUsers, color: '#ef4444' },
            { label: 'MFA Enabled',  value: mfaEnabled, color: '#f97316' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: dm ? '#1e293b' : 'white', borderRadius: '16px', padding: '20px 24px', border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280', marginBottom: '10px' }}>{label}</div>
              <div style={{ fontSize: '36px', fontWeight: '800', color, lineHeight: '1' }}>{loading ? '...' : value}</div>
            </div>
          ))
        })()}
      </div>

      {/* Tabs + content */}
      <div style={{ background: dm ? '#1e293b' : 'white', borderRadius: '16px', border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
          {tabs.map((tab, i) => {
            const isActive = tabIds[i] === activeTab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tabIds[i])}
                style={{
                  flex: 1,
                  padding: '16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #1d4ed8' : '2px solid transparent',
                  fontSize: '13px',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  color: isActive ? '#1d4ed8' : (dm ? '#64748b' : '#9ca3af'),
                  cursor: 'pointer',
                }}
              >
                {tab}
              </button>
            )
          })}
        </div>

        {/* ── PERMISSIONS TAB ── */}
        {activeTab === 'permissions' && (
          <div style={{ padding: '20px 24px' }}>
            {/* Description */}
            <p style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280', margin: '0 0 20px', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
              Module-level permissions for{' '}
              <strong style={{ color: '#0891b2', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>{role}</strong>.
              {' '}Contact IT Administrator to request changes.
            </p>

            {/* Permissions Matrix */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
                  {['Module', 'Read', 'Write', 'Delete', 'Admin'].map((col) => (
                    <th key={col} style={{ padding: '10px 16px', textAlign: col === 'Module' ? 'left' : 'center', fontSize: '13px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.4px' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(permissions).map(([module, perms], i) => (
                  <tr key={module} style={{ borderBottom: i < Object.keys(permissions).length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                    <td style={{ padding: '18px 16px', fontSize: '14px', fontWeight: '600', color: '#0891b2', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>{module}</td>
                    {['read', 'write', 'delete', 'admin'].map((perm) => (
                      <td key={perm} style={{ padding: '18px 16px', textAlign: 'center' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: perms[perm] ? (dm ? '#164e63' : '#dbeafe') : 'transparent', cursor: 'pointer' }}>
                          <input type="checkbox" checked={perms[perm]} onChange={() => togglePermission(module, perm)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>
                Selected permissions are enabled for <strong>{role}</strong>. Tick or untick options as needed and click Save Changes to retain them.
              </div>
              <button onClick={handleSavePermissions} style={{ width: '180px', padding: '12px 18px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                {permissionsSaved ? 'Saved' : 'Save Changes'}
              </button>
            </div>

            {/* Footer warning banner */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: dm ? 'rgba(245,158,11,0.08)' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fde68a'}`, borderRadius: '10px', padding: '14px 16px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span style={{ fontSize: '12px', color: dm ? '#fcd34d' : '#92400e', fontFamily: "'Inter', 'Segoe UI', sans-serif", lineHeight: '1.6' }}>
                Permission changes require IT Administrator approval and are logged to the audit trail per ISO 27001 A.9.
              </span>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div style={{ padding: '24px' }}>
            {/* Authentication Policy Card */}
            <div style={{ background: dm ? '#1e293b' : '#fff', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '12px', overflow: 'hidden' }}>
              {/* Card Header */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dm ? '#94a3b8' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span style={{ fontSize: '13px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', letterSpacing: '0.5px', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>AUTHENTICATION POLICY</span>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Row 1: Require MFA */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', marginBottom: '4px' }}>Require MFA for all users in this role</div>
                    <div style={{ fontSize: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      Enforced by security policy
                    </div>
                  </div>
                  {/* MFA Toggle */}
                  <div onClick={() => setMfaEnabled(v => !v)} style={{ position: 'relative', width: '44px', height: '24px', flexShrink: 0, cursor: 'pointer' }}>
                    <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: mfaEnabled ? '#0891b2' : (dm ? '#334155' : '#d1d5db'), transition: 'background 0.2s' }} />
                    <div style={{ position: 'absolute', top: '3px', left: mfaEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                  </div>
                </div>

                <div style={{ borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}` }} />

                {/* Row 2: Session timeout */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', marginBottom: '2px' }}>Session timeout (minutes)</div>
                    <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>Auto-logout after inactivity</div>
                  </div>
                  <input
                    type="number"
                    placeholder="—"
                    style={{ width: '80px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${dm ? '#475569' : '#d1d5db'}`, background: dm ? '#0f172a' : '#f9fafb', color: dm ? '#f1f5f9' : '#111827', fontSize: '14px', textAlign: 'center', outline: 'none', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
                  />
                </div>

                <div style={{ borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}` }} />

                {/* Row 3: Max failed login attempts */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', marginBottom: '2px' }}>Max failed login attempts before lockout</div>
                    <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>Account locked after N consecutive failures</div>
                  </div>
                  <input
                    type="number"
                    placeholder="—"
                    style={{ width: '80px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${dm ? '#475569' : '#d1d5db'}`, background: dm ? '#0f172a' : '#f9fafb', color: dm ? '#f1f5f9' : '#111827', fontSize: '14px', textAlign: 'center', outline: 'none', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
                  />
                </div>

                <div style={{ borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}` }} />

                {/* Row 4: PAM sessions */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', marginBottom: '2px' }}>Privileged Access Management (PAM) sessions</div>
                    <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>Record and monitor privileged sessions for this role</div>
                  </div>
                  {/* PAM Toggle */}
                  <div onClick={() => setPamEnabled(v => !v)} style={{ position: 'relative', width: '44px', height: '24px', flexShrink: 0, cursor: 'pointer' }}>
                    <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: pamEnabled ? '#0891b2' : (dm ? '#334155' : '#d1d5db'), transition: 'background 0.2s' }} />
                    <div style={{ position: 'absolute', top: '3px', left: pamEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                  </div>
                </div>
              </div>
            </div>
            {/* ACCESS SCOPE Card */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '1.5px', marginBottom: '10px', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>ACCESS SCOPE</div>
              <div style={{ background: dm ? '#1e293b' : '#fff', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '12px', padding: '4px 0' }}>
                {[
                  { label: 'Restrict access to working hours (08:00–17:00 CAT)', val: restrictHours, set: setRestrictHours },
                  { label: 'Geo-restriction (ZW only)', val: geoRestrict, set: setGeoRestrict },
                  { label: 'Allow concurrent sessions', val: concurrentSessions, set: setConcurrentSessions },
                ].map(({ label, val, set }, i, arr) => (
                  <div key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: dm ? '#f1f5f9' : '#111827', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>{label}</span>
                      <div onClick={() => set(v => !v)} style={{ position: 'relative', width: '44px', height: '24px', flexShrink: 0, cursor: 'pointer' }}>
                        <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: val ? '#0891b2' : (dm ? '#334155' : '#d1d5db'), transition: 'background 0.2s' }} />
                        <div style={{ position: 'absolute', top: '3px', left: val ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                      </div>
                    </div>
                    {i < arr.length - 1 && <div style={{ borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, margin: '0 20px' }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* NOTIFICATION PREFERENCES Card */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '1.5px', marginBottom: '10px', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>NOTIFICATION PREFERENCES</div>
              <div style={{ background: dm ? '#1e293b' : '#fff', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '12px', padding: '4px 0' }}>
                {[
                  { label: 'Email alert on new login', val: emailAlertLogin, set: setEmailAlertLogin },
                  { label: 'Alert on role assignment change', val: alertRoleChange, set: setAlertRoleChange },
                  { label: 'Weekly access report', val: weeklyReport, set: setWeeklyReport },
                ].map(({ label, val, set }, i, arr) => (
                  <div key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: dm ? '#f1f5f9' : '#111827', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>{label}</span>
                      <div onClick={() => set(v => !v)} style={{ position: 'relative', width: '44px', height: '24px', flexShrink: 0, cursor: 'pointer' }}>
                        <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: val ? '#0891b2' : (dm ? '#334155' : '#d1d5db'), transition: 'background 0.2s' }} />
                        <div style={{ position: 'absolute', top: '3px', left: val ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                      </div>
                    </div>
                    {i < arr.length - 1 && <div style={{ borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, margin: '0 20px' }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* SAVE SETTINGS Button */}
            <div style={{ marginTop: '24px' }}>
              <button style={{ padding: '12px 28px', background: 'transparent', color: '#0891b2', border: '2px solid #0891b2', borderRadius: '8px', fontSize: '13px', fontWeight: '700', letterSpacing: '1px', fontFamily: "'Inter', 'Segoe UI', sans-serif", cursor: 'pointer' }}>
                SAVE SETTINGS
              </button>
            </div>
          </div>
        )}

        {/* ── ACTIVITY LOG TAB ── */}
        {activeTab === 'activity-log' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
                  {['Timestamp', 'Actor', 'Action', 'Details', 'Result'].map((col) => (
                    <th key={col} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { action: 'ROLE_ASSIGN',   result: 'success'  },
                  { action: 'MFA_TOGGLE',    result: 'success'  },
                  { action: 'STATUS_CHANGE', result: 'success'  },
                  { action: 'PERM_REQUEST',  result: 'pending'  },
                  { action: 'ROLE_REMOVE',   result: 'success'  },
                  { action: 'AUTO_LOCKOUT',  result: 'enforced' },
                  { action: 'SESSION_KILL',  result: 'success'  },
                ].map(({ action, result }, i, arr) => (
                  <tr key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                    <td style={{ padding: '16px 20px', fontSize: '13px', fontFamily: "'Inter', 'Segoe UI', sans-serif", color: dm ? '#64748b' : '#9ca3af', whiteSpace: 'nowrap' }}>—</td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', fontFamily: "'Inter', 'Segoe UI', sans-serif", color: dm ? '#93c5fd' : '#0891b2' }}>—</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', border: `1px solid ${dm ? '#0891b2' : '#67e8f9'}`, color: dm ? '#22d3ee' : '#0891b2', background: 'transparent', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
                        {action}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>—</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', fontFamily: "'Inter', 'Segoe UI', sans-serif",
                        ...(result === 'success'  ? { border: '1px solid #22c55e', color: '#16a34a', background: 'transparent' } :
                            result === 'pending'  ? { border: '1px solid #f59e0b', color: '#d97706', background: 'transparent' } :
                                                    { border: '1px solid #f97316', color: '#ea580c', background: 'transparent' }),
                      }}>
                        {result.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === 'users' && <>
          <div style={{ padding: '20px 24px 0' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <svg style={{ position: 'absolute', left: '14px', color: dm ? '#64748b' : '#9ca3af' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder={`Search ${role} users...`}
                style={{ width: '100%', padding: '12px 14px 12px 42px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Users Table */}
          <div style={{ overflowX: 'auto', padding: '16px 0 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
                {['User', 'Email', 'Status', 'MFA', 'Last Login', 'Sessions', 'Actions'].map((col) => (
                  <th key={col} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>Loading users...</td></tr>
              ) : error ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>No users found for this role</td></tr>
              ) : users.map((user, i, arr) => {
                const initials = `${user.first_name?.[0] || ''}${user.surname?.[0] || ''}`.toUpperCase()
                const fullName = `${user.first_name || ''} ${user.surname || ''}`.trim()
                const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'
                return (
                <tr key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                  {/* User */}
                  <td style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #0891b2, #0e7490)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'white' }}>{initials}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', marginBottom: '2px' }}>{fullName}</div>
                        <div style={{ fontSize: '11px', color: dm ? '#475569' : '#9ca3af' }}>ID: {user.id}</div>
                      </div>
                    </div>
                  </td>
                  {/* Email */}
                  <td style={{ padding: '18px 20px', fontSize: '13px', fontFamily: "'Inter', 'Segoe UI', sans-serif", color: dm ? '#94a3b8' : '#6b7280' }}>{user.email}</td>
                  {/* Status */}
                  <td style={{ padding: '18px 20px' }}>
                    <span
                      onClick={() => handleToggleUserStatus(user.id, user.status)}
                      style={{
                        display: 'inline-block',
                        padding: '3px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700',
                        letterSpacing: '0.5px',
                        cursor: 'pointer',
                        background: user.status === 'active' ? '#d1fae5' : user.status === 'suspended' ? '#fee2e2' : '#f3f4f6',
                        color: user.status === 'active' ? '#065f46' : user.status === 'suspended' ? '#991b1b' : '#6b7280',
                        border: `1px solid ${user.status === 'active' ? '#10b981' : user.status === 'suspended' ? '#ef4444' : '#e5e7eb'}`
                      }}
                    >
                      {user.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </td>
                  {/* MFA */}
                  <td style={{ padding: '18px 20px' }}>
                    <span
                      onClick={() => handleToggleUserMFA(user.id, user.mfa_enabled)}
                      style={{
                        display: 'inline-block',
                        padding: '3px 14px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        background: user.mfa_enabled ? '#fef3c7' : (dm ? '#334155' : '#f3f4f6'),
                        color: user.mfa_enabled ? '#92400e' : (dm ? '#94a3b8' : '#6b7280')
                      }}
                    >
                      {user.mfa_enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </td>
                  {/* Last Login */}
                  <td style={{ padding: '18px 20px', fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap' }}>{lastLogin}</td>
                  {/* Sessions */}
                  <td style={{ padding: '18px 20px', fontSize: '13px', color: dm ? '#64748b' : '#9ca3af' }}>—</td>
                  {/* Actions */}
                  <td style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { setEditingUser(user); setShowEditUser(true) }} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: 'transparent', color: dm ? '#94a3b8' : '#374151', cursor: 'pointer' }}>Edit</button>
                      <button style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #f97316', background: 'transparent', color: '#f97316', cursor: 'pointer' }}>Suspend</button>
                      <button onClick={() => { setRemovingUser(user); setShowRemoveUser(true) }} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        </>}
      </div>

      {/* ── Edit User Modal ── */}
      {showEditUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowEditUser(false)}>
          <div style={{ background: dm ? '#1e293b' : 'white', borderRadius: '18px', padding: '32px 36px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, fontFamily: "'Inter','Segoe UI',sans-serif" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', letterSpacing: '0.8px', color: '#0891b2', textTransform: 'uppercase' }}>Edit User</h3>
              <button onClick={() => setShowEditUser(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dm ? '#64748b' : '#9ca3af', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '6px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* User identity card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: dm ? '#0f172a' : '#f9fafb', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '24px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #0891b2, #0e7490)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'white' }}>{editingUser?.initials || '—'}</span>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', marginBottom: '3px' }}>{editingUser?.name || '—'}</div>
                <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>{editingUser?.id || '—'} &bull; {role}</div>
              </div>
            </div>

            {/* First Name */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>First Name</label>
              <input type="text" defaultValue={editingUser?.firstName || ''}
                placeholder="First name"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Surname */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Surname</label>
              <input type="text" defaultValue={editingUser?.surname || ''}
                placeholder="Surname"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Email</label>
              <input type="email" defaultValue={editingUser?.email || ''}
                placeholder="user@cut.ac.zw"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Status */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Status</label>
              <select defaultValue={editingUser?.status || ''}
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                <option value="">— Select status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: dm ? '#334155' : '#f3f4f6', marginBottom: '20px' }} />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowEditUser(false)}
                style={{ padding: '10px 24px', background: 'transparent', color: dm ? '#94a3b8' : '#374151', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => setShowEditUser(false)}
                style={{ padding: '10px 28px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Removal Modal ── */}
      {showRemoveUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowRemoveUser(false)}>
          <div style={{ background: dm ? '#1e293b' : 'white', borderRadius: '18px', padding: '36px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, fontFamily: "'Inter','Segoe UI',sans-serif" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', letterSpacing: '0.8px', color: '#ef4444', textTransform: 'uppercase' }}>Confirm Removal</h3>
              <button onClick={() => setShowRemoveUser(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dm ? '#64748b' : '#9ca3af', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '6px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Warning icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="rgba(245,158,11,0.15)" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            {/* Message */}
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <p style={{ fontSize: '16px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', margin: '0 0 12px' }}>
                Remove{' '}
                <span style={{ color: '#f97316' }}>{removingUser?.name || '—'}</span>
                {' '}from {role}?
              </p>
              <p style={{ fontSize: '13px', color: dm ? '#64748b' : '#9ca3af', lineHeight: '1.7', margin: 0, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
                This action will be recorded in the audit trail.<br />
                The user's account will NOT be deleted from the system.
              </p>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: dm ? '#334155' : '#f3f4f6', marginBottom: '24px' }} />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowRemoveUser(false)}
                style={{ padding: '10px 24px', background: 'transparent', color: dm ? '#94a3b8' : '#374151', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => setShowRemoveUser(false)}
                style={{ padding: '10px 28px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Remove User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add User Modal ── */}
      {showAddUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowAddUser(false)}>
          <div style={{ background: dm ? '#1e293b' : 'white', borderRadius: '18px', padding: '32px 36px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, fontFamily: "'Inter','Segoe UI',sans-serif" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', letterSpacing: '0.8px', color: '#0891b2', textTransform: 'uppercase' }}>
                Add User — {role}
              </h3>
              <button onClick={() => setShowAddUser(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: dm ? '#64748b' : '#9ca3af', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '6px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* First Name */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>First Name</label>
              <input type="text" placeholder="e.g. Tendai"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Surname */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Surname</label>
              <input type="text" placeholder="e.g. Moyo"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Institutional Email */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Institutional Email</label>
              <input type="email" placeholder="user@cut.ac.zw"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* MFA Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: dm ? '#0f172a' : '#f9fafb', borderRadius: '10px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, marginBottom: '28px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', marginBottom: '3px' }}>Require MFA</div>
                <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>Mandatory for IT Admin &amp; Security Analyst</div>
              </div>
              <button onClick={() => setMfaEnabled(!mfaEnabled)}
                style={{ width: '46px', height: '26px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: mfaEnabled ? '#0891b2' : (dm ? '#334155' : '#d1d5db'), position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: '3px', left: mfaEnabled ? '23px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: dm ? '#334155' : '#f3f4f6', marginBottom: '20px' }} />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowAddUser(false)}
                style={{ padding: '10px 24px', background: 'transparent', color: dm ? '#94a3b8' : '#374151', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => setShowAddUser(false)}
                style={{ padding: '10px 28px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Add User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage({ onLogout }) {
  const [activePage, setActivePage] = useState('risk')
  const [darkMode, setDarkMode] = useState(false)
  const [riskData, setRiskData] = useState(null)
  const [incidentData, setIncidentData] = useState({ incidents: [], totals: { open: 0, critical: 0 } })
  const [managingRole, setManagingRole] = useState(null)

  const fetchRiskData = () => {
    fetch('http://localhost:8000/api/v1/ui/admin/overview')
      .then(res => res.json())
      .then(data => setRiskData(data))
      .catch(err => console.error("Error fetching admin overview", err))
  }

  const fetchIncidentData = () => {
    fetch('http://localhost:8000/api/v1/ui/admin/incidents')
      .then(res => res.json())
      .then(data => setIncidentData(data))
      .catch(err => console.error("Error fetching admin incidents", err))
  }

  useEffect(() => {
    if (activePage === 'risk') {
      fetchRiskData()
    }
    if (activePage === 'incidents') {
      fetchIncidentData()
    }
  }, [activePage])

  const handleDeclareIncident = async () => {
    try {
      await fetch('http://localhost:8000/api/v1/risk/register_incident', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ incident_level: 'P1' })
      })
      setTimeout(() => {
        if (activePage === 'risk') fetchRiskData()
        if (activePage === 'incidents') fetchIncidentData()
      }, 2500)
      alert("P1 incident reported! Global Risk Score is being recalculated.")
    } catch (e) {
      console.error(e)
    }
  }

  const styles = makeStyles(darkMode)
  const dm = darkMode

  return (
    <div style={styles.wrapper}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          {/* Brand */}
          <div style={styles.brand}>
            <div style={styles.brandIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dm ? '#93c5fd' : '#1a237e'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div style={styles.brandName}>IT Admin</div>
              <div style={styles.brandSub}>Security Dashboard</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                style={{
                  ...styles.navItem,
                  ...(activePage === item.id ? styles.navItemActive : {}),
                }}
              >
                <span style={{ color: activePage === item.id ? (dm ? '#93c5fd' : '#1a237e') : (dm ? '#94a3b8' : '#6b7280') }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Admin Profile — pinned to bottom */}
        <div style={styles.profile}>
          <div style={styles.profileInner}>
            <div style={styles.avatar}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div style={styles.profileName}>Admin</div>
              <div style={styles.profileRole}>System Manager</div>
            </div>
          </div>
          {onLogout && (
            <button onClick={onLogout} style={styles.logoutBtn} title="Log out">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Page Header */}
        <div style={{ ...styles.card, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
          <div style={styles.headerLeft}>
            {activePage === 'backup' ? (
              <>
                <h1 style={styles.pageTitle}>Backup Management</h1>
                <p style={styles.pageSubtitle}>
                  Automated Backup Status &mdash;{' '}
                  <span style={styles.subtitleLink}>SHA-256 Integrity Verification</span>
                </p>
              </>
            ) : activePage === 'access' ? (
              <>
                <h1 style={styles.pageTitle}>Role-Based Access Control</h1>
                <p style={styles.pageSubtitle}>
                  RBAC Management &mdash;{' '}
                  <span style={styles.subtitleLink}>Keycloak / LDAP Integration</span>
                </p>
              </>
            ) : activePage === 'incidents' ? (
              <>
                <h1 style={styles.pageTitle}>Incident Tickets</h1>
                <p style={styles.pageSubtitle}>
                  <span style={styles.subtitleLink}>SLA-Tracked Incident Response Lifecycle</span>
                </p>
              </>
            ) : (
              <>
                <h1 style={styles.pageTitle}>IT Administrator</h1>
                <p style={styles.pageSubtitle}>
                  System Risk Overview &mdash;{' '}
                  <span style={styles.subtitleLink}>Chinhoyi University of Technology</span>
                </p>
              </>
            )}
          </div>
          <div style={styles.headerRight}>
            <button 
              onClick={handleDeclareIncident} 
              style={{ ...styles.themeToggle, background: '#ef4444', color: 'white', borderColor: '#b91c1c', fontWeight: 'bold' }}>
              Declare P1 Incident
            </button>
            <span style={styles.lastUpdated}>Last updated: —</span>
            {/* Dark / Light mode toggle */}
            <button onClick={() => setDarkMode(!dm)} style={styles.themeToggle} title={dm ? 'Switch to light mode' : 'Switch to dark mode'}>
              {dm ? (
                /* Sun icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                /* Moon icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── BACKUP STATUS PAGE ── */}
        {activePage === 'backup' && <>
          <div style={styles.cardGrid}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={styles.cardLabel}>JOBS VERIFIED</span>
              <div style={styles.splitValue}>
                <span style={{ color: '#16a34a', fontSize: '34px', fontWeight: '800' }}>—</span>
                <span style={{ color: dm ? '#475569' : '#9ca3af', fontSize: '34px', fontWeight: '800', margin: '0 4px' }}>/</span>
                <span style={{ color: dm ? '#475569' : '#9ca3af', fontSize: '34px', fontWeight: '800' }}>—</span>
              </div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>— require attention</div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
              <span style={styles.cardLabel}>FAILED JOBS</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#ef4444', lineHeight: '1' }}>—</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>— ago</div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={styles.cardLabel}>TOTAL BACKUP SIZE</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#0891b2', lineHeight: '1' }}>— GB</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>Across all destinations</div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
              <span style={styles.cardLabel}>NEXT FULL BACKUP</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#f59e0b', lineHeight: '1' }}>--:--</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>In — h —m</div>
            </div>
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>BACKUP JOB STATUS</span></div>
            <table style={styles.table}>
              <thead>
                <tr>{['Job Name', 'Last Run', 'Size', 'Integrity', 'Status'].map((col) => (
                  <th key={col} style={styles.th}>{col}</th>
                ))}</tr>
              </thead>
              <tbody>
                {['PostgreSQL Primary', 'MongoDB Events', 'File Server NAS', 'Email Archives', 'Keycloak Config', 'Redis Snapshot'].map((job) => (
                  <tr key={job}>
                    <td style={{ ...styles.td, fontWeight: '600', color: dm ? '#f1f5f9' : '#111827' }}>{job}</td>
                    <td style={styles.td}>—</td>
                    <td style={styles.td}>—</td>
                    <td style={styles.td}>—</td>
                    <td style={styles.td}><span style={styles.badgeNeutral}>—</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>STORAGE UTILIZATION</span></div>
            <div style={styles.storageList}>
              {[
                { label: 'On-Prem NAS', barColor: 'linear-gradient(to right, #f97316, #ef4444)' },
                { label: 'S3 Cloud', barColor: '#06b6d4' },
                { label: 'Off-site Tape', barColor: '#06b6d4' },
              ].map(({ label, barColor }) => (
                <div key={label} style={styles.storageRow}>
                  <div style={styles.storageRowHeader}>
                    <span style={styles.storageLabel}>{label}</span>
                    <span style={styles.storageMeta}>—% of —</span>
                  </div>
                  <div style={styles.storageTrack}>
                    <div style={{ ...styles.storageBar, background: barColor, width: '0%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>RETENTION SCHEDULE</span></div>
            <div style={styles.retentionList}>
              {[
                { label: 'Daily Snapshots', sub: '— days' },
                { label: 'Weekly Snapshots', sub: '— weeks' },
                { label: 'Monthly Archives', sub: '— months' },
              ].map(({ label, sub }, i) => (
                <div key={label} style={{ ...styles.retentionRow, borderBottom: i < 2 ? `1px solid ${dm ? '#334155' : '#f3f4f6'}` : 'none' }}>
                  <div>
                    <div style={styles.retentionLabel}>{label}</div>
                    <div style={styles.retentionSub}>{sub}</div>
                  </div>
                  <div style={styles.copiesBadge}>
                    <span style={styles.copiesNum}>—</span>
                    <span style={styles.copiesText}> copies</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── ROLE PROFILE PAGE ── */}
        {activePage === 'access' && managingRole && (
          <RoleProfileView role={managingRole} onBack={() => setManagingRole(null)} dm={dm} styles={styles} />
        )}

        {/* ── ACCESS CONTROL PAGE ── */}
        {activePage === 'access' && !managingRole && <>
          <div style={styles.cardGrid}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={styles.cardLabel}>TOTAL USERS</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#0891b2', lineHeight: '1' }}>—</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>Active accounts</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
              <span style={styles.cardLabel}>MFA ENABLED</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#f59e0b', lineHeight: '1' }}>—</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>—% adoption rate</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={styles.cardLabel}>PENDING APPROVALS</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#f97316', lineHeight: '1' }}>—</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>Elevated permission requests</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
              <span style={styles.cardLabel}>PAM SESSIONS</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#7c3aed', lineHeight: '1' }}>—</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>Active privileged session</div>
            </div>
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>ROLE PERMISSIONS MATRIX</span></div>
            <table style={styles.table}>
              <thead>
                <tr>{['Role', 'Active Users', 'Access Level', 'MFA Required', 'Actions'].map((col) => (
                  <th key={col} style={styles.th}>{col}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[
                  { role: 'IT Administrator', access: 'Full', mfa: 'required' },
                  { role: 'Security Analyst', access: 'Security & Logs', mfa: 'required' },
                  { role: 'Compliance Officer', access: 'Reports & Policies', mfa: 'optional' },
                  { role: 'System Auditor', access: 'Read-Only Audit', mfa: 'optional' },
                  { role: 'IT Technician', access: 'Operational', mfa: 'optional' },
                ].map(({ role, access, mfa }) => (
                  <tr key={role}>
                    <td style={{ ...styles.td, color: '#0891b2', fontWeight: '600' }}>{role}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>—</td>
                    <td style={styles.td}>{access}</td>
                    <td style={styles.td}>
                      {mfa === 'required' ? <span style={styles.mfaRequired}>Required</span> : <span style={styles.mfaOptional}>Optional</span>}
                    </td>
                    <td style={styles.td}><button onClick={() => setManagingRole(role)} style={styles.manageLink}>Manage &gt;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {/* ── INCIDENTS PAGE ── */}
        {activePage === 'incidents' && (
          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>OPEN &amp; ACTIVE INCIDENTS</span></div>
            <div style={styles.incidentList}>
              {false && (incidentData.incidents || []).map(({ title, incident_id, storyline_id, assigned, status, severity, sla_label, source_ip }, i, arr) => (
                <div key={incident_id} style={{ ...styles.incidentRow, borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#334155' : '#f3f4f6'}` : 'none' }}>
                  <div style={styles.incidentLeft}>
                    <span style={{ ...styles.incidentDot, background: severity === 'critical' ? '#ef4444' : severity === 'high' ? '#f97316' : '#f59e0b' }} />
                    <div>
                      <div style={styles.incidentTitle}>{title}</div>
                      <div style={styles.incidentMeta}>{incident_id} &bull; {storyline_id} &bull; Assigned: {assigned} &bull; Source: {source_ip || 'unknown'}</div>
                    </div>
                  </div>
                  <div style={styles.incidentRight}>
                    {status === 'resolved'
                      ? <span style={styles.slaMet}>SLA met</span>
                      : <span style={styles.incidentTime}>{sla_label}</span>}
                    <span style={status === 'open' ? styles.badgeOpen : status === 'in-progress' ? styles.badgeInProgress : styles.badgeResolved}>{status}</span>
                    <span style={severity === 'critical' ? styles.badgeCritical : severity === 'high' ? styles.badgeHigh : styles.badgeMedium}>{severity}</span>
                  </div>
                </div>
              ))}
              <div style={{ padding: '24px 0', color: dm ? '#94a3b8' : '#6b7280', fontSize: '14px' }}>
                No incidents to display. Incident data will appear here once the system is operational.
              </div>
              {false && [
                { title: 'Brute-force on admin account', id: 'INC-0041', assigned: 'analyst_01', dot: '#ef4444', status: 'open', severity: 'critical' },
                { title: 'Email archive backup failure', id: 'INC-0040', assigned: 'tech_02', dot: '#f97316', status: 'in-progress', severity: 'high' },
                { title: 'Unauthorised access /data/finance', id: 'INC-0039', assigned: 'analyst_02', dot: '#ef4444', status: 'open', severity: 'critical' },
                { title: 'Port scan from external IP', id: 'INC-0038', assigned: 'analyst_01', dot: '#f97316', status: 'resolved', severity: 'medium' },
                { title: 'GDPR control gap \u2014 Data Retention', id: 'INC-0037', assigned: 'compliance', dot: '#f97316', status: 'in-progress', severity: 'medium' },
              ].map(({ title, id, assigned, dot, status, severity }, i, arr) => (
                <div key={id} style={{ ...styles.incidentRow, borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#334155' : '#f3f4f6'}` : 'none' }}>
                  <div style={styles.incidentLeft}>
                    <span style={{ ...styles.incidentDot, background: dot }} />
                    <div>
                      <div style={styles.incidentTitle}>{title}</div>
                      <div style={styles.incidentMeta}>{id} &bull; Assigned: {assigned}</div>
                    </div>
                  </div>
                  <div style={styles.incidentRight}>
                    {status === 'resolved'
                      ? <span style={styles.slaMet}>SLA met</span>
                      : <span style={styles.incidentTime}>— remaining</span>}
                    <span style={status === 'open' ? styles.badgeOpen : status === 'in-progress' ? styles.badgeInProgress : styles.badgeResolved}>{status}</span>
                    <span style={severity === 'critical' ? styles.badgeCritical : severity === 'high' ? styles.badgeHigh : styles.badgeMedium}>{severity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RISK OVERVIEW PAGE ── */}
        {activePage === 'risk' && <>
          <div style={styles.cardGrid}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <div style={styles.cardHeader}>
                <span style={styles.cardLabel}>OVERALL RISK SCORE</span>
                <div style={{ ...styles.iconBadge, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              </div>
              <div style={styles.cardValue}>{riskData ? riskData.overall_risk_score.toFixed(1) : '—'}</div>
              <div style={styles.cardMeta}>
                <span style={{ color: '#16a34a', fontWeight: '600' }}>↓ — pts</span>
                <span style={{ color: dm ? '#94a3b8' : '#6b7280' }}> from last month</span>
              </div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
              <div style={styles.cardHeader}>
                <span style={styles.cardLabel}>CRITICAL VULNS</span>
                <div style={{ ...styles.iconBadge, background: '#fff1f2', border: '1px solid #fecdd3' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
              </div>
              <div style={styles.cardValue}>{riskData ? riskData.critical_vulns : '—'}</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>Requires immediate action</div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce7'}` }}>
              <div style={styles.cardHeader}>
                <span style={styles.cardLabel}>ACTIVE INCIDENTS</span>
                <div style={{ ...styles.iconBadge, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <line x1="12" y1="2" x2="12" y2="4" />
                  </svg>
                </div>
              </div>
              <div style={styles.cardValue}>{riskData ? riskData.active_incidents : '—'}</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>
                {riskData ? `${riskData.critical_incidents} critical, ${riskData.medium_incidents} medium` : '— critical, — medium'}
              </div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
              <div style={styles.cardHeader}>
                <span style={styles.cardLabel}>MONITORED ENDPOINTS</span>
                <div style={{ ...styles.iconBadge, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
              </div>
              <div style={styles.cardValue}>{riskData ? riskData.monitored_endpoints : '—'}</div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>—% reporting</div>
            </div>
          </div>

          {/* Risk Score Trend */}
          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>RISK SCORE TREND (9 MONTHS)</span></div>
            <div style={styles.chartArea}>
              <div style={styles.chartInner}>
                <div style={styles.yAxis}>
                  {[100, 75, 50, 25, 0].map((v) => <span key={v} style={styles.yLabel}>{v}</span>)}
                </div>
                <div style={styles.chartPlaceholder}>
                  <svg width="100%" height="100%" viewBox="0 0 800 200" preserveAspectRatio="none" style={{ display: 'block' }}>
                    {[0, 50, 100, 150, 200].map((y) => (
                      <line key={y} x1="0" y1={y} x2="800" y2={y} stroke={dm ? '#334155' : '#e5e7eb'} strokeWidth="1" strokeDasharray="4,4" />
                    ))}
                    <path d="M0,140 C100,130 200,100 300,80 C400,60 500,90 600,120 C700,150 750,170 800,180 L800,200 L0,200 Z" fill="rgba(249,115,22,0.12)" />
                    <path d="M0,140 C100,130 200,100 300,80 C400,60 500,90 600,120 C700,150 750,170 800,180" fill="none" stroke="#f97316" strokeWidth="2.5" />
                  </svg>
                </div>
              </div>
              <div style={styles.xAxis}>
                {['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m) => <span key={m} style={styles.xLabel}>{m}</span>)}
              </div>
            </div>
          </div>

          {/* Department Risk Heatmap */}
          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>DEPARTMENT RISK HEATMAP</span></div>
            <div style={styles.heatmapArea}>
              <div style={styles.heatmapRows}>
                {['Finance', 'Research', 'Registry', 'Library', 'IT Ops', 'HR'].map((dept) => (
                  <div key={dept} style={styles.heatmapRow}>
                    <span style={styles.deptLabel}>{dept}</span>
                    <div style={styles.barTrack}><div style={styles.barEmpty} /></div>
                  </div>
                ))}
              </div>
              <div style={styles.heatmapXAxis}>
                <div style={styles.heatmapXLabels}>
                  {[0, 25, 50, 75, 100].map((v) => <span key={v} style={styles.heatmapXLabel}>{v}</span>)}
                </div>
              </div>
            </div>
            <div style={styles.legend}>
              {[{ color: '#ef4444', label: 'High Risk' }, { color: '#f59e0b', label: 'Medium Risk' }, { color: '#22c55e', label: 'Low Risk' }].map(({ color, label }) => (
                <div key={label} style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, background: color }} />
                  <span style={styles.legendLabel}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Vulnerability Distribution */}
          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>VULNERABILITY DISTRIBUTION BY SEVERITY</span></div>
            <div style={styles.vulnBody}>
              <div style={styles.donutWrap}>
                <svg width="130" height="130" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="56" fill="none" stroke={dm ? '#334155' : '#f3f4f6'} strokeWidth="28" />
                  <circle cx="80" cy="80" r="56" fill="none" stroke="#ef4444" strokeWidth="28" strokeDasharray="0 351.86" strokeLinecap="butt" transform="rotate(-90 80 80)" />
                  <circle cx="80" cy="80" r="56" fill="none" stroke="#f97316" strokeWidth="28" strokeDasharray="0 351.86" strokeLinecap="butt" transform="rotate(-90 80 80)" />
                  <circle cx="80" cy="80" r="56" fill="none" stroke="#f59e0b" strokeWidth="28" strokeDasharray="0 351.86" strokeLinecap="butt" transform="rotate(-90 80 80)" />
                  <circle cx="80" cy="80" r="56" fill="none" stroke="#22c55e" strokeWidth="28" strokeDasharray="0 351.86" strokeLinecap="butt" transform="rotate(-90 80 80)" />
                </svg>
              </div>
              <div style={styles.vulnRows}>
                {[
                  { label: 'Critical', color: '#ef4444' },
                  { label: 'High', color: '#f97316' },
                  { label: 'Medium', color: '#f59e0b' },
                  { label: 'Low', color: '#22c55e' },
                ].map(({ label, color }) => (
                  <div key={label} style={styles.vulnRow}>
                    <div style={styles.vulnRowHeader}>
                      <div style={styles.vulnRowLeft}>
                        <span style={{ ...styles.vulnDot, background: color }} />
                        <span style={styles.vulnLabel}>{label}</span>
                      </div>
                      <span style={styles.vulnCount}>— CVEs</span>
                    </div>
                    <div style={styles.vulnTrack}>
                      <div style={{ ...styles.vulnBar, background: color, width: '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={styles.vulnFooter}>
              <span style={styles.vulnTotalLabel}>Total Vulnerabilities</span>
              <span style={styles.vulnTotalValue}>— CVEs</span>
            </div>
          </div>
        </>}

        <div style={{ minHeight: '32px', flexShrink: 0 }} />
      </main>
    </div>
  )
}

const makeStyles = (dm) => ({
  wrapper: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    background: dm ? '#0f172a' : '#f1f5f9',
  },
  sidebar: {
    width: '260px',
    minWidth: '260px',
    height: '100vh',
    background: dm ? '#1e293b' : 'white',
    borderRight: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 0 20px',
    flexShrink: 0,
    boxSizing: 'border-box',
  },
  sidebarTop: {
    display: 'flex',
    flexDirection: 'column',
    gap: '40px',
    flex: 1,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 24px',
  },
  brandIcon: {
    width: '44px',
    height: '44px',
    background: dm ? '#1e3a5f' : '#eff6ff',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brandName: {
    fontSize: '24px',
    fontWeight: '800',
    color: dm ? '#f1f5f9' : '#111827',
    lineHeight: '1.2',
  },
  brandSub: {
    fontSize: '14px',
    color: dm ? '#64748b' : '#9ca3af',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0 12px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 20px',
    borderRadius: '12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '500',
    color: dm ? '#94a3b8' : '#6b7280',
    letterSpacing: '0.5px',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.15s',
  },
  navItemActive: {
    background: dm ? '#3b82f6' : '#0f172a',
    color: 'white',
    fontWeight: '600',
    boxShadow: dm ? '0 4px 12px rgba(59, 130, 246, 0.3)' : '0 4px 12px rgba(15, 23, 42, 0.15)',
  },
  profile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderTop: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
    flexShrink: 0,
  },
  profileInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: dm ? '#64748b' : '#9ca3af',
    padding: '6px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#1a237e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileName: {
    fontSize: '14px',
    fontWeight: '600',
    color: dm ? '#f1f5f9' : '#111827',
  },
  profileRole: {
    fontSize: '12px',
    color: dm ? '#64748b' : '#9ca3af',
  },
  main: {
    flex: 1,
    height: '100vh',
    padding: '40px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    overflowY: 'auto',
    background: dm ? '#0f172a' : '#f1f5f9',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: '800',
    color: dm ? '#f1f5f9' : '#111827',
    margin: '0 0 4px 0',
    textAlign: 'left',
    letterSpacing: '-0.5px',
  },
  pageSubtitle: {
    fontSize: '16px',
    fontWeight: '400',
    color: dm ? '#94a3b8' : '#6b7280',
    margin: 0,
    textAlign: 'left',
  },
  subtitleLink: {
    color: dm ? '#93c5fd' : '#1a237e',
    fontWeight: '500',
  },
  lastUpdated: {
    fontSize: '13px',
    color: dm ? '#64748b' : '#9ca3af',
  },
  themeToggle: {
    background: dm ? '#1e293b' : '#f8fafc',
    border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: dm ? '#f59e0b' : '#6b7280',
    padding: '6px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '24px',
  },
  card: {
    background: dm ? '#1e293b' : 'white',
    borderRadius: '20px',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: dm ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.05)',
    border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: dm ? '#64748b' : '#9ca3af',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  iconBadge: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardValue: {
    fontSize: '35px',
    fontWeight: '800',
    color: dm ? '#f1f5f9' : '#111827',
    lineHeight: '1',
    letterSpacing: '-1px',
  },
  cardMeta: {
    fontSize: '13px',
  },
  splitValue: {
    display: 'flex',
    alignItems: 'baseline',
    lineHeight: '1',
  },
  chartCard: {
    background: dm ? '#1e293b' : 'white',
    borderRadius: '16px',
    padding: '20px 24px 16px',
    boxShadow: dm ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.05)',
    border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
  },
  chartHeader: {
    marginBottom: '16px',
  },
  chartTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: dm ? '#64748b' : '#9ca3af',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  chartArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },
  chartInner: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: '8px',
  },
  yAxis: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: '32px',
    minWidth: '32px',
    height: '200px',
    pointerEvents: 'none',
  },
  yLabel: {
    fontSize: '12px',
    color: dm ? '#64748b' : '#9ca3af',
    textAlign: 'right',
  },
  chartPlaceholder: {
    flex: 1,
    height: '200px',
  },
  xAxis: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
    paddingLeft: '40px',
  },
  xLabel: {
    fontSize: '12px',
    color: dm ? '#64748b' : '#9ca3af',
    flex: 1,
    textAlign: 'center',
  },
  heatmapArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  heatmapRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  heatmapRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  deptLabel: {
    width: '72px',
    minWidth: '72px',
    fontSize: '12px',
    color: dm ? '#94a3b8' : '#6b7280',
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: '28px',
    background: dm ? '#334155' : '#f3f4f6',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barEmpty: {
    height: '100%',
    width: '0%',
    background: dm ? '#475569' : '#e5e7eb',
    borderRadius: '4px',
  },
  heatmapXAxis: {
    paddingLeft: '84px',
    marginTop: '8px',
  },
  heatmapXLabels: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  heatmapXLabel: {
    fontSize: '12px',
    color: dm ? '#64748b' : '#9ca3af',
  },
  legend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '28px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: '13px',
    color: dm ? '#94a3b8' : '#6b7280',
  },
  vulnBody: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  donutWrap: { flexShrink: 0 },
  vulnRows: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  vulnRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  vulnRowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vulnRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  vulnDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  vulnLabel: {
    fontSize: '13px',
    color: dm ? '#94a3b8' : '#374151',
    fontWeight: '500',
  },
  vulnCount: {
    fontSize: '13px',
    fontWeight: '700',
    color: dm ? '#f1f5f9' : '#111827',
  },
  vulnTrack: {
    height: '8px',
    background: dm ? '#334155' : '#f3f4f6',
    borderRadius: '999px',
    overflow: 'hidden',
  },
  vulnBar: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 0.4s ease',
  },
  vulnFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '14px',
    paddingTop: '12px',
    borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
  },
  vulnTotalLabel: {
    fontSize: '13px',
    color: dm ? '#94a3b8' : '#6b7280',
  },
  vulnTotalValue: {
    fontSize: '20px',
    fontWeight: '800',
    color: dm ? '#f1f5f9' : '#111827',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '700',
    color: dm ? '#94a3b8' : '#6b7280',
    padding: '14px 16px',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: dm ? '#94a3b8' : '#6b7280',
    borderBottom: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
  },
  mfaRequired: {
    display: 'inline-block',
    padding: '3px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: '500',
    border: '1px solid #6ee7b7',
    color: '#059669',
    background: 'transparent',
  },
  mfaOptional: {
    display: 'inline-block',
    padding: '3px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: '500',
    border: '1px solid #fcd34d',
    color: '#d97706',
    background: 'transparent',
  },
  manageLink: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0891b2',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: '0',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: dm ? '#94a3b8' : '#374151',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  incidentList: {
    display: 'flex',
    flexDirection: 'column',
  },
  incidentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 0',
    gap: '16px',
  },
  incidentLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    flex: 1,
    minWidth: 0,
  },
  incidentDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  incidentTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: dm ? '#f1f5f9' : '#111827',
    marginBottom: '4px',
  },
  incidentMeta: {
    fontSize: '12px',
    color: dm ? '#64748b' : '#9ca3af',
  },
  incidentRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  incidentTime: {
    fontSize: '14px',
    fontWeight: '600',
    color: dm ? '#94a3b8' : '#374151',
    marginRight: '4px',
  },
  slaMet: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#059669',
    marginRight: '4px',
  },
  badgeOpen: { display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '500', border: '1px solid #fca5a5', color: '#ef4444', background: 'transparent' },
  badgeInProgress: { display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '500', border: '1px solid #fcd34d', color: '#d97706', background: 'transparent' },
  badgeResolved: { display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '500', border: '1px solid #6ee7b7', color: '#059669', background: 'transparent' },
  badgeCritical: { display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '500', border: '1px solid #fca5a5', color: '#ef4444', background: 'transparent' },
  badgeHigh: { display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '500', border: '1px solid #fcd34d', color: '#d97706', background: 'transparent' },
  badgeMedium: { display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '500', border: '1px solid #fcd34d', color: '#d97706', background: 'transparent' },
  badgeNeutral: { display: 'inline-block', padding: '3px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500', border: `1px solid ${dm ? '#475569' : '#e5e7eb'}`, color: dm ? '#94a3b8' : '#6b7280', background: 'transparent' },
  storageList: { display: 'flex', flexDirection: 'column', gap: '18px' },
  storageRow: { display: 'flex', flexDirection: 'column', gap: '8px' },
  storageRowHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  storageLabel: { fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827' },
  storageMeta: { fontSize: '13px', color: dm ? '#64748b' : '#9ca3af' },
  storageTrack: { height: '10px', background: dm ? '#334155' : '#f3f4f6', borderRadius: '999px', overflow: 'hidden' },
  storageBar: { height: '100%', borderRadius: '999px', transition: 'width 0.4s ease' },
  retentionList: { display: 'flex', flexDirection: 'column' },
  retentionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' },
  retentionLabel: { fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', marginBottom: '4px' },
  retentionSub: { fontSize: '13px', color: dm ? '#64748b' : '#9ca3af' },
  copiesBadge: { border: '2px solid #06b6d4', borderRadius: '12px', padding: '10px 20px', textAlign: 'center', minWidth: '100px' },
  copiesNum: { fontSize: '18px', fontWeight: '800', color: '#0891b2' },
  copiesText: { fontSize: '13px', color: '#0891b2', fontWeight: '500' },
})
