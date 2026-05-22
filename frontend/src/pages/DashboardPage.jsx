import { useState, useEffect } from 'react'
import { users as usersAPI, roles as rolesAPI, activity as activityAPI, dashboard as dashboardAPI } from '../services/authService'
import BackupManagementTab from '../components/BackupManagementTab'

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
  const [sessionTimeout, setSessionTimeout] = useState('')
  const [maxFailedAttempts, setMaxFailedAttempts] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [newUserFirstName, setNewUserFirstName] = useState('')
  const [newUserSurname, setNewUserSurname] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState('')
  const [showNewUserPassword, setShowNewUserPassword] = useState(false)
  const [newUserMFA, setNewUserMFA] = useState(false)
  const [editFirstName, setEditFirstName] = useState('')
  const [editSurname, setEditSurname] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editStatus, setEditStatus] = useState('active')
  const [editOldPassword, setEditOldPassword] = useState('')
  const [editNewPassword, setEditNewPassword] = useState('')
  const [editConfirmPassword, setEditConfirmPassword] = useState('')
  const [editPwError, setEditPwError] = useState('')
  const [showEditPasswords, setShowEditPasswords] = useState(false)
  const [editOldPasswordValid, setEditOldPasswordValid] = useState(null)
  const [editOldPasswordChecking, setEditOldPasswordChecking] = useState(false)
  const tabs = ['USERS', 'PERMISSIONS', 'SETTINGS', 'ACTIVITY LOG']
  const tabIds = ['users', 'permissions', 'settings', 'activity-log']

  // API State
  const [users, setUsers] = useState([])
  const [roleData, setRoleData] = useState(null)
  const [rolePermissions, setRolePermissions] = useState([])
  const [roleSettings, setRoleSettings] = useState(null)
  const [activityLogs, setActivityLogs] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  // User-specific permissions
  const [selectedPermUser, setSelectedPermUser] = useState(null)
  const [userPermissions, setUserPermissions] = useState([])
  const [userPermsLoading, setUserPermsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch users and role data on mount or when role changes
  useEffect(() => {
    fetchRoleData()
  }, [role])

  // Fetch activity logs when tab opens, roleData, or users list changes
  useEffect(() => {
    if (activeTab !== 'activity-log' || !roleData) return
    const fetchActivity = async () => {
      setActivityLoading(true)
      try {
        const params = { page_size: 100, role_id: roleData.id }
        if (users.length > 0) {
          params.actor_ids = users.map(u => u.id).join(',')
        }
        const logs = await activityAPI.list(params)
        setActivityLogs(logs)
      } catch (err) {
        console.error('Failed to fetch activity logs:', err)
      } finally {
        setActivityLoading(false)
      }
    }
    fetchActivity()
  }, [activeTab, roleData, users])

  // Load permissions when user is selected in Permissions tab
  useEffect(() => {
    if (!selectedPermUser) { setUserPermissions([]); return }
    const load = async () => {
      setUserPermsLoading(true)
      try {
        // Fall back to role permissions if user-level endpoint not available yet
        let perms
        try {
          perms = await usersAPI.getPermissions(selectedPermUser.id)
        } catch {
          perms = rolePermissions.map(p => ({ ...p, is_override: false }))
        }
        setUserPermissions(perms)
      } catch (err) {
        console.error('Failed to load user permissions:', err)
        setUserPermissions(rolePermissions.map(p => ({ ...p, is_override: false })))
      } finally {
        setUserPermsLoading(false)
      }
    }
    load()
  }, [selectedPermUser])

  const handleToggleUserPermission = (moduleId, permType) => {
    setUserPermissions(prev => prev.map(p =>
      p.module_id === moduleId ? { ...p, [`can_${permType}`]: !p[`can_${permType}`] } : p
    ))
  }

  const handleSaveUserPermissions = async () => {
    if (!selectedPermUser || userPermissions.length === 0) {
      alert('No permissions loaded. Select a user first.')
      return
    }

    const hasAnyRead = userPermissions.some(p => p.can_read)
    const currentStatus = selectedPermUser.status

    try {
      // Try to save permission overrides (requires backend restart if table is new)
      try {
        await usersAPI.updatePermissions(selectedPermUser.id, {
          permissions: userPermissions.map(p => ({
            module_id:  p.module_id,
            can_read:   p.can_read,
            can_write:  p.can_write,
            can_delete: p.can_delete,
            can_admin:  p.can_admin,
          }))
        })
      } catch (permErr) {
        console.warn('Permission overrides could not be saved:', permErr.message)
      }

      // Directly enforce via user status — same mechanism as the Suspend button
      if (!hasAnyRead && currentStatus === 'active') {
        await usersAPI.setStatus(selectedPermUser.id, 'suspended', 'All module read permissions revoked')
        setUsers(prev => prev.map(u => u.id === selectedPermUser.id ? { ...u, status: 'suspended' } : u))
        setSelectedPermUser(prev => ({ ...prev, status: 'suspended' }))
        alert(`${selectedPermUser.first_name} ${selectedPermUser.surname} has been SUSPENDED — no read access granted.`)
      } else if (hasAnyRead && currentStatus === 'suspended') {
        await usersAPI.setStatus(selectedPermUser.id, 'active', 'Module read permissions restored')
        setUsers(prev => prev.map(u => u.id === selectedPermUser.id ? { ...u, status: 'active' } : u))
        setSelectedPermUser(prev => ({ ...prev, status: 'active' }))
        alert(`${selectedPermUser.first_name} ${selectedPermUser.surname} has been REACTIVATED — read access restored.`)
      } else {
        alert(`Permissions updated for ${selectedPermUser.first_name} ${selectedPermUser.surname}.`)
      }

      fetchRoleData().catch(() => {})
    } catch (err) {
      console.error('Failed to enforce permissions:', err)
      alert('Failed: ' + err.message)
    }
  }

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
        setSessionTimeout(settings.session_timeout_minutes || '')
        setMaxFailedAttempts(settings.max_failed_login_attempts || '')
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
  const handleAddUser = async () => {
    try {
      if (!newUserFirstName || !newUserSurname || !newUserEmail || !newUserPassword) {
        alert('Please fill in all required fields')
        return
      }
      if (newUserPassword !== newUserConfirmPassword) {
        alert('Passwords do not match')
        return
      }

      await usersAPI.create({
        first_name: newUserFirstName,
        surname: newUserSurname,
        email: newUserEmail,
        password: newUserPassword,
        require_mfa: newUserMFA,
        role_ids: roleData ? [roleData.id] : []
      })

      // Clear form
      setNewUserFirstName('')
      setNewUserSurname('')
      setNewUserEmail('')
      setNewUserPassword('')
      setNewUserConfirmPassword('')
      setShowNewUserPassword(false)
      setNewUserMFA(false)

      await fetchRoleData() // Refresh the list
      setShowAddUser(false)
      alert('User added successfully!')
    } catch (err) {
      console.error('Error adding user:', err)
      alert('Failed to add user: ' + err.message)
    }
  }

  const handleUpdateUser = async () => {
    if (!editingUser) return
    setEditPwError('')

    // Password change validation
    if (editOldPassword || editNewPassword || editConfirmPassword) {
      if (!editOldPassword) { setEditPwError('Please enter your current password.'); return }
      if (!editNewPassword) { setEditPwError('Please enter a new password.'); return }
      if (editNewPassword === editOldPassword) { setEditPwError('New password must be different from the current password.'); return }
      if (editNewPassword !== editConfirmPassword) { setEditPwError('New passwords do not match.'); return }
      if (editNewPassword.length < 8) { setEditPwError('New password must be at least 8 characters.'); return }
    }

    try {
      const updates = {}
      if (editFirstName && editFirstName !== editingUser.first_name) updates.first_name = editFirstName
      if (editSurname && editSurname !== editingUser.surname) updates.surname = editSurname
      if (editEmail && editEmail !== editingUser.email) updates.email = editEmail

      if (Object.keys(updates).length > 0) {
        await usersAPI.update(editingUser.id, updates)
      }

      if (editOldPassword && editNewPassword) {
        try {
          await usersAPI.changePassword(editingUser.id, editOldPassword, editNewPassword)
        } catch (pwErr) {
          setEditPwError(pwErr.message?.includes('400') || pwErr.message?.toLowerCase().includes('incorrect')
            ? 'Current password is incorrect.'
            : (pwErr.message || 'Password change failed.'))
          return
        }
      }

      await fetchRoleData()
      setShowEditUser(false)
      setEditingUser(null)
      alert('User updated successfully!')
    } catch (err) {
      console.error('Error updating user:', err)
      alert('Failed to update user: ' + err.message)
    }
  }

  // Effect to populate edit form when editingUser changes
  useEffect(() => {
    if (editingUser) {
      setEditFirstName(editingUser.first_name || '')
      setEditSurname(editingUser.surname || '')
      setEditEmail(editingUser.email || '')
      setEditStatus(editingUser.status || 'active')
      setEditOldPassword('')
      setEditNewPassword('')
      setEditConfirmPassword('')
      setEditPwError('')
      setShowEditPasswords(false)
      setEditOldPasswordValid(null)
      setEditOldPasswordChecking(false)
    }
  }, [editingUser])

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

  const openPrintWindow = (title, html) => {
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const sharedStyle = `
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 32px; color: #111827; }
    h1 { font-size: 20px; margin: 0 0 4px; color: #0891b2; }
    .meta { font-size: 12px; color: #6b7280; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead tr { background: #f1f5f9; }
    th { text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:last-child td { border-bottom: none; }
    footer { margin-top: 32px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  `

  const handleExportUsers = () => {
    const now = new Date().toLocaleString()
    const rows = users.map(u => `
      <tr>
        <td>${u.first_name} ${u.surname}</td>
        <td>${u.email}</td>
        <td>${u.status?.toUpperCase()}</td>
        <td>${u.mfa_enabled ? 'Enabled' : 'Disabled'}</td>
        <td>${u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
      </tr>`).join('')
    openPrintWindow(`${role} Users`, `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${role} Users — AITRMS</title><style>${sharedStyle}</style></head><body>
      <h1>AITRMS — ${role} Users</h1>
      <div class="meta">Exported on ${now} &nbsp;·&nbsp; ${users.length} user(s)</div>
      <table><thead><tr><th>User</th><th>Email</th><th>Status</th><th>MFA</th><th>Last Login</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <footer>IT Automated Risk Management System &nbsp;·&nbsp; Chinhoyi University of Technology</footer>
      </body></html>`)
  }

  const handleExportActivityLog = () => {
    const now = new Date().toLocaleString()
    const rows = activityLogs.map(log => {
      const actor = log.actor_email || log.target_user_email || log.details?.email || '—'
      const detail = log.details ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'
      const ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'
      return `<tr>
        <td>${ts}</td>
        <td>${actor}</td>
        <td>${String(log.action).toUpperCase()}</td>
        <td>${detail}</td>
        <td>${String(log.result).toUpperCase()}</td>
      </tr>`
    }).join('')
    openPrintWindow(`${role} Activity Log`, `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${role} Activity Log — AITRMS</title><style>${sharedStyle}</style></head><body>
      <h1>AITRMS — ${role} Activity Log</h1>
      <div class="meta">Exported on ${now} &nbsp;·&nbsp; ${activityLogs.length} event(s)</div>
      <table><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Details</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <footer>IT Automated Risk Management System &nbsp;·&nbsp; Chinhoyi University of Technology</footer>
      </body></html>`)
  }

  const handleToggleUserStatus = async (userId, currentStatus, userName) => {
    const suspending = currentStatus === 'active'
    const newStatus = suspending ? 'suspended' : 'active'
    if (suspending) {
      const confirmed = window.confirm(`Suspend ${userName}?\n\nThis will immediately block their access to the system.`)
      if (!confirmed) return
    }
    try {
      await usersAPI.setStatus(userId, newStatus, 'Status changed from dashboard')
      // Update the table immediately without waiting for a server round-trip
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u))
      // Silently refresh in the background to sync any other changes
      fetchRoleData().catch(err => console.error('Background refresh failed:', err))
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

  const handleSaveSettings = async () => {
    if (!roleData) return
    try {
      const updates = {
        require_mfa: mfaEnabled,
        pam_sessions_enabled: pamEnabled,
        restrict_working_hours: restrictHours,
        geo_restriction_enabled: geoRestrict,
        allow_concurrent_sessions: concurrentSessions,
        email_alert_on_login: emailAlertLogin,
        alert_on_role_change: alertRoleChange,
        weekly_access_report: weeklyReport,
      }
      if (sessionTimeout) updates.session_timeout_minutes = parseInt(sessionTimeout)
      if (maxFailedAttempts) updates.max_failed_login_attempts = parseInt(maxFailedAttempts)

      await rolesAPI.updateSettings(roleData.id, updates)
      alert('Settings saved successfully!')
      await fetchRoleData()
    } catch (err) {
      console.error('Error saving settings:', err)
      alert('Failed to save settings: ' + err.message)
    }
  }

  const handleSavePermissions = async () => {
    if (!roleData) return
    try {
      // Convert permissions object to API format
      const permissionsArray = rolePermissions.map(perm => ({
        module_id: perm.module_id,
        can_read: perm.can_read,
        can_write: perm.can_write,
        can_delete: perm.can_delete,
        can_admin: perm.can_admin,
      }))

      await rolesAPI.updatePerms(roleData.id, { permissions: permissionsArray })
      alert('Permissions saved successfully!')
      await fetchRoleData()
    } catch (err) {
      console.error('Error saving permissions:', err)
      alert('Failed to save permissions: ' + err.message)
    }
  }

  const handleTogglePermission = (moduleId, permission) => {
    setRolePermissions(prev => prev.map(perm => {
      if (perm.module_id === moduleId) {
        return { ...perm, [`can_${permission}`]: !perm[`can_${permission}`] }
      }
      return perm
    }))
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
          {(activeTab === 'users' || activeTab === 'activity-log') && (
            <button
              onClick={activeTab === 'users' ? handleExportUsers : handleExportActivityLog}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', color: dm ? '#94a3b8' : '#374151', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export {activeTab === 'activity-log' ? 'Log' : 'Users'}
            </button>
          )}
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

            {/* User selector */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Select User</label>
              <select
                value={selectedPermUser?.id ?? ''}
                onChange={e => {
                  const uid = parseInt(e.target.value)
                  setSelectedPermUser(users.find(u => u.id === uid) || null)
                }}
                style={{ width: '100%', maxWidth: '400px', padding: '10px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', cursor: 'pointer' }}
              >
                <option value="">— Choose a user —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.surname} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {selectedPermUser ? (() => {
              const isSuspended = selectedPermUser.status === 'suspended'
              const handleRevokeAccess = async () => {
                if (!window.confirm(`Suspend ${selectedPermUser.first_name} ${selectedPermUser.surname}?\n\nThey will be blocked from logging in immediately.`)) return
                try {
                  await usersAPI.setStatus(selectedPermUser.id, 'suspended', 'Access revoked from Permissions tab')
                  setUsers(prev => prev.map(u => u.id === selectedPermUser.id ? { ...u, status: 'suspended' } : u))
                  setSelectedPermUser(prev => ({ ...prev, status: 'suspended' }))
                  alert(`${selectedPermUser.first_name} ${selectedPermUser.surname} suspended — login blocked.`)
                } catch (err) { alert('Failed: ' + err.message) }
              }
              const handleRestoreAccess = async () => {
                try {
                  await usersAPI.setStatus(selectedPermUser.id, 'active', 'Access restored from Permissions tab')
                  setUsers(prev => prev.map(u => u.id === selectedPermUser.id ? { ...u, status: 'active' } : u))
                  setSelectedPermUser(prev => ({ ...prev, status: 'active' }))
                  alert(`${selectedPermUser.first_name} ${selectedPermUser.surname} reactivated.`)
                } catch (err) { alert('Failed: ' + err.message) }
              }
              return (
                <>
                  {/* User card + access control */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: dm ? '#0f172a' : '#f8fafc', border: `1px solid ${isSuspended ? '#ef4444' : (dm ? '#334155' : '#e5e7eb')}`, borderRadius: '12px', padding: '14px 18px', marginBottom: '16px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: isSuspended ? '#ef4444' : 'linear-gradient(135deg,#0891b2,#0e7490)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'white' }}>
                        {`${selectedPermUser.first_name?.[0]||''}${selectedPermUser.surname?.[0]||''}`.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{selectedPermUser.first_name} {selectedPermUser.surname}</div>
                      <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#6b7280' }}>{selectedPermUser.email}</div>
                    </div>
                    <span style={{ padding: '3px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', background: isSuspended ? '#fee2e2' : '#d1fae5', color: isSuspended ? '#991b1b' : '#065f46', border: `1px solid ${isSuspended ? '#ef4444' : '#10b981'}`, marginRight: '8px' }}>
                      {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                    </span>
                    {isSuspended ? (
                      <button onClick={handleRestoreAccess} style={{ padding: '8px 18px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Restore Access
                      </button>
                    ) : (
                      <button onClick={handleRevokeAccess} style={{ padding: '8px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Revoke Access
                      </button>
                    )}
                  </div>

                  {/* Module permissions table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
                        {['Module', 'Read', 'Write', 'Delete', 'Admin'].map(col => (
                          <th key={col} style={{ padding: '10px 16px', textAlign: col === 'Module' ? 'left' : 'center', fontSize: '12px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.4px' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {userPermsLoading ? (
                        <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>Loading…</td></tr>
                      ) : userPermissions.length === 0 ? (
                        <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>No modules configured</td></tr>
                      ) : userPermissions.map((perm, i) => (
                        <tr key={perm.module_id} style={{ borderBottom: i < userPermissions.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                          <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: '#0891b2' }}>{perm.module_name}</td>
                          {['read', 'write', 'delete', 'admin'].map(pt => (
                            <td key={pt} style={{ padding: '16px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!perm[`can_${pt}`]}
                                onChange={() => handleToggleUserPermission(perm.module_id, pt)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0891b2' }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {userPermissions.length > 0 && (
                    <button onClick={handleSaveUserPermissions} style={{ padding: '10px 24px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '20px' }}>
                      Save Module Permissions
                    </button>
                  )}
                </>
              )
            })() : (
              <div style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af', fontSize: '14px', border: `1px dashed ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '12px', marginBottom: '20px' }}>
                Select a user above to manage their permissions.
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: dm ? 'rgba(245,158,11,0.08)' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fde68a'}`, borderRadius: '10px', padding: '14px 16px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ fontSize: '12px', color: dm ? '#fcd34d' : '#92400e', lineHeight: '1.6' }}>
                Use <strong>Revoke Access</strong> to immediately block a user from logging in. Module permissions control what they can do once logged in. All changes are logged per ISO 27001 A.9.
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
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
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
                    value={maxFailedAttempts}
                    onChange={(e) => setMaxFailedAttempts(e.target.value)}
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
              <button onClick={handleSaveSettings} style={{ padding: '12px 28px', background: 'transparent', color: '#0891b2', border: '2px solid #0891b2', borderRadius: '8px', fontSize: '13px', fontWeight: '700', letterSpacing: '1px', fontFamily: "'Inter', 'Segoe UI', sans-serif", cursor: 'pointer' }}>
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
                {activityLoading ? (
                  <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>Loading activity...</td></tr>
                ) : activityLogs.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>No activity recorded yet</td></tr>
                ) : activityLogs.map((log, i, arr) => {
                  const r = String(log.result).toUpperCase()
                  const resultColor = r === 'SUCCESS'  ? { background: '#d1fae5', color: '#065f46', border: '1px solid #10b981' }
                                    : r === 'FAILED'   ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444' }
                                    : r === 'PENDING'  ? { background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }
                                    : r === 'ENFORCED' ? { background: '#ffedd5', color: '#9a3412', border: '1px solid #f97316' }
                                    :                    { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }
                  const parts = []
                  if (log.target_user_email && log.target_user_email !== log.actor_email) {
                    parts.push(`user: ${log.target_user_email}`)
                  }
                  if (log.details) {
                    Object.entries(log.details).forEach(([k, v]) => parts.push(`${k}: ${v}`))
                  }
                  const detailStr = parts.length > 0 ? parts.join(' · ') : '—'
                  return (
                  <tr key={log.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                    <td style={{ padding: '14px 20px', fontSize: '12px', color: dm ? '#64748b' : '#9ca3af', whiteSpace: 'nowrap' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '13px', color: dm ? '#93c5fd' : '#0891b2', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.actor_email || log.target_user_email || log.details?.email || '—'}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', border: `1px solid ${dm ? '#0891b2' : '#67e8f9'}`, color: dm ? '#22d3ee' : '#0891b2', background: 'transparent' }}>
                        {String(log.action).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '12px', color: dm ? '#94a3b8' : '#6b7280', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detailStr}>
                      {detailStr}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', ...resultColor }}>
                        {String(log.result).toUpperCase()}
                      </span>
                    </td>
                  </tr>
                )})}
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
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '12px 14px 12px 42px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Users Table */}
          <div style={{ overflowX: 'auto', padding: '16px 0 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
                {['User', 'Email', 'Status', 'MFA', 'Last Login', 'Actions'].map((col) => (
                  <th key={col} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>Loading users...</td></tr>
              ) : error ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</td></tr>
              ) : (() => {
                const q = searchTerm.toLowerCase().trim()
                const filtered = q
                  ? users.filter(u =>
                      `${u.first_name} ${u.surname}`.toLowerCase().includes(q) ||
                      u.email.toLowerCase().includes(q)
                    )
                  : users
                if (filtered.length === 0) return (
                  <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>No users match "{searchTerm}"</td></tr>
                )
                return filtered.map((user, i, arr) => {
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
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      background: user.status === 'active' ? '#d1fae5' : user.status === 'suspended' ? '#fee2e2' : '#f3f4f6',
                      color: user.status === 'active' ? '#065f46' : user.status === 'suspended' ? '#991b1b' : '#6b7280',
                      border: `1px solid ${user.status === 'active' ? '#10b981' : user.status === 'suspended' ? '#ef4444' : '#e5e7eb'}`
                    }}>
                      {user.status === 'active' ? 'ACTIVE' : user.status === 'suspended' ? 'SUSPENDED' : (user.status?.toUpperCase() || 'UNKNOWN')}
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
                  {/* Actions */}
                  <td style={{ padding: '18px 20px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { setEditingUser(user); setShowEditUser(true) }} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: 'transparent', color: dm ? '#94a3b8' : '#374151', cursor: 'pointer' }}>Edit</button>
                      {user.status === 'active' ? (
                        <button onClick={() => handleToggleUserStatus(user.id, user.status, `${user.first_name} ${user.surname}`)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #f97316', background: 'transparent', color: '#f97316', cursor: 'pointer' }}>Suspend</button>
                      ) : (
                        <button onClick={() => handleToggleUserStatus(user.id, user.status, `${user.first_name} ${user.surname}`)} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #16a34a', background: 'transparent', color: '#16a34a', cursor: 'pointer' }}>Activate</button>
                      )}
                      <button onClick={() => { setRemovingUser(user); setShowRemoveUser(true) }} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </td>
                </tr>
              )})
              })()}
            </tbody>
          </table>
        </div>
        </>}
      </div>

      {/* ── Edit User Modal ── */}
      {showEditUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={() => setShowEditUser(false)}>
          <div style={{ background: dm ? '#1e293b' : 'white', borderRadius: '18px', padding: '32px 36px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, fontFamily: "'Inter','Segoe UI',sans-serif" }}
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
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'white' }}>
                  {editingUser ? `${editingUser.first_name?.[0] || ''}${editingUser.surname?.[0] || ''}`.toUpperCase() : '—'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', marginBottom: '3px' }}>
                  {editingUser ? `${editingUser.first_name || ''} ${editingUser.surname || ''}`.trim() : '—'}
                </div>
                <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>ID: {editingUser?.id || '—'} &bull; {role}</div>
              </div>
            </div>

            {/* First Name */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>First Name</label>
              <input type="text"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                placeholder="First name"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Surname */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Surname</label>
              <input type="text"
                value={editSurname}
                onChange={(e) => setEditSurname(e.target.value)}
                placeholder="Surname"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Email</label>
              <input type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@cut.ac.zw"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Status - Display only */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Status</label>
              <div style={{ padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#64748b' : '#9ca3af', background: dm ? '#0f172a' : '#f9fafb' }}>
                {editingUser?.status?.charAt(0).toUpperCase() + editingUser?.status?.slice(1) || 'Unknown'} (Use status toggle in table)
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: dm ? '#334155' : '#f3f4f6', margin: '4px 0 18px' }} />

            {/* Password Change Section */}
            <div style={{ marginBottom: '4px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', margin: '0 0 14px 0' }}>Change Password (optional)</p>

              {/* Current Password */}
              <div style={{ marginBottom: '6px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Current Password</label>
                <input type={showEditPasswords ? 'text' : 'password'}
                  value={editOldPassword}
                  onChange={(e) => { setEditOldPassword(e.target.value); setEditOldPasswordValid(null); setEditPwError('') }}
                  onBlur={async () => {
                    if (!editOldPassword || !editingUser) return
                    setEditOldPasswordChecking(true)
                    try {
                      const res = await usersAPI.verifyPassword(editingUser.id, editOldPassword)
                      setEditOldPasswordValid(res.valid)
                      if (!res.valid) { setEditNewPassword(''); setEditConfirmPassword('') }
                    } catch { setEditOldPasswordValid(false); setEditNewPassword(''); setEditConfirmPassword('') }
                    finally { setEditOldPasswordChecking(false) }
                  }}
                  placeholder="Enter current password"
                  autoComplete="new-password"
                  style={{ width: '100%', padding: '12px 14px', border: `1px solid ${editOldPasswordValid === false ? '#ef4444' : editOldPasswordValid === true ? '#16a34a' : (dm ? '#334155' : '#e5e7eb')}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ minHeight: '22px', marginBottom: '10px', fontSize: '12px' }}>
                {editOldPasswordChecking && <span style={{ color: dm ? '#94a3b8' : '#6b7280' }}>Verifying...</span>}
                {!editOldPasswordChecking && editOldPasswordValid === false && <span style={{ color: '#ef4444' }}>Current password is incorrect.</span>}
                {!editOldPasswordChecking && editOldPasswordValid === true && <span style={{ color: '#16a34a' }}>Password verified.</span>}
              </div>

              {/* New Password — disabled until old password is verified */}
              <div style={{ marginBottom: '14px', opacity: editOldPasswordValid === true ? 1 : 0.4, pointerEvents: editOldPasswordValid === true ? 'auto' : 'none' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>New Password</label>
                <input type={showEditPasswords ? 'text' : 'password'}
                  value={editNewPassword}
                  onChange={(e) => { setEditNewPassword(e.target.value); setEditPwError('') }}
                  placeholder="Enter new password"
                  disabled={editOldPasswordValid !== true}
                  autoComplete="new-password"
                  style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* Confirm New Password — disabled until new password is entered */}
              <div style={{ marginBottom: '10px', opacity: editNewPassword ? 1 : 0.4, pointerEvents: editNewPassword ? 'auto' : 'none' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Confirm New Password</label>
                <input type={showEditPasswords ? 'text' : 'password'}
                  value={editConfirmPassword}
                  onChange={(e) => { setEditConfirmPassword(e.target.value); setEditPwError('') }}
                  placeholder="Confirm new password"
                  disabled={!editNewPassword}
                  autoComplete="new-password"
                  style={{ width: '100%', padding: '12px 14px', border: `1px solid ${editPwError && editConfirmPassword && editConfirmPassword !== editNewPassword ? '#ef4444' : (dm ? '#334155' : '#e5e7eb')}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* Show passwords checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '14px', userSelect: 'none' }}>
                <input type="checkbox" checked={showEditPasswords} onChange={(e) => setShowEditPasswords(e.target.checked)}
                  style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#0891b2' }} />
                <span style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Show passwords</span>
              </label>

              {/* Password error */}
              {editPwError && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#dc2626', marginBottom: '14px' }}>
                  {editPwError}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: dm ? '#334155' : '#f3f4f6', marginBottom: '20px' }} />

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowEditUser(false)}
                style={{ padding: '10px 24px', background: 'transparent', color: dm ? '#94a3b8' : '#374151', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleUpdateUser}
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
                <span style={{ color: '#f97316' }}>
                  {removingUser ? `${removingUser.first_name || ''} ${removingUser.surname || ''}`.trim() : '—'}
                </span>
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
              <button onClick={async () => { await handleDeleteUser(removingUser?.id); setShowRemoveUser(false) }}
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
                value={newUserFirstName}
                onChange={(e) => setNewUserFirstName(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Surname */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Surname</label>
              <input type="text" placeholder="e.g. Moyo"
                value={newUserSurname}
                onChange={(e) => setNewUserSurname(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Institutional Email */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Institutional Email</label>
              <input type="email" placeholder="user@cut.ac.zw"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showNewUserPassword ? 'text' : 'password'} placeholder="Enter password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 44px 12px 14px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showNewUserPassword ? 'text' : 'password'} placeholder="Re-enter password"
                  value={newUserConfirmPassword}
                  onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', border: `1px solid ${newUserConfirmPassword && newUserPassword !== newUserConfirmPassword ? '#ef4444' : (dm ? '#334155' : '#e5e7eb')}`, borderRadius: '10px', fontSize: '14px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {newUserConfirmPassword && newUserPassword !== newUserConfirmPassword && (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#ef4444' }}>Passwords do not match</p>
              )}
            </div>

            {/* Show Password */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <input type="checkbox" id="showPwdToggle" checked={showNewUserPassword} onChange={(e) => setShowNewUserPassword(e.target.checked)}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#0891b2' }} />
              <label htmlFor="showPwdToggle" style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280', cursor: 'pointer', userSelect: 'none' }}>Show password</label>
            </div>

            {/* MFA Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: dm ? '#0f172a' : '#f9fafb', borderRadius: '10px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, marginBottom: '28px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', marginBottom: '3px' }}>Require MFA</div>
                <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>Mandatory for IT Admin &amp; Security Analyst</div>
              </div>
              <button onClick={() => setNewUserMFA(!newUserMFA)}
                style={{ width: '46px', height: '26px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: newUserMFA ? '#0891b2' : (dm ? '#334155' : '#d1d5db'), position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: '3px', left: newUserMFA ? '23px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
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
              <button onClick={handleAddUser}
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

export default function DashboardPage({ onLogout, currentUser }) {
  const [activePage, setActivePage] = useState('risk')
  const [darkMode, setDarkMode] = useState(false)
  const [riskData, setRiskData] = useState(null)
  const [incidentData, setIncidentData] = useState({ incidents: [], totals: { open: 0, critical: 0 } })
  const [managingRole, setManagingRole] = useState(null)
  const [rolesList, setRolesList] = useState([])
  const [rbacStats, setRbacStats] = useState(null)

  const fetchRolesList = async () => {
    try {
      const [roles, stats] = await Promise.all([rolesAPI.list(), dashboardAPI.rbacStats()])
      setRolesList(roles)
      setRbacStats(stats)
    } catch (err) {
      console.error('Failed to fetch access control data:', err)
    }
  }

  const fetchRiskData = () => {
    fetch('/api/v1/ui/admin/overview')
      .then(res => res.json())
      .then(data => setRiskData(data))
      .catch(err => console.error("Error fetching admin overview", err))
  }

  const fetchIncidentData = () => {
    fetch('/api/v1/ui/admin/incidents')
      .then(res => res.json())
      .then(data => setIncidentData(data))
      .catch(err => console.error("Error fetching admin incidents", err))
  }

  useEffect(() => {
    if (activePage === 'risk') fetchRiskData()
    if (activePage === 'incidents') fetchIncidentData()
    if (activePage === 'access' && !managingRole) fetchRolesList()
  }, [activePage, managingRole])

  const handleDeclareIncident = async () => {
    try {
      await fetch('/api/v1/risk/register_incident', {
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
            <div style={{ ...styles.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}>
              {currentUser
                ? `${(currentUser.first_name?.[0] || '').toUpperCase()}${(currentUser.surname?.[0] || '').toUpperCase()}`
                : 'AD'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...styles.profileName, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser ? `${(currentUser.first_name?.[0] || '').toUpperCase()}. ${currentUser.surname}` : 'Admin'}
              </div>
              <div style={{ ...styles.profileRole, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser?.email || 'System Manager'}
              </div>
            </div>
          </div>
          {onLogout && (
            <button onClick={onLogout} style={styles.logoutBtn}>
              <span>LOGOUT</span>
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
            {activePage === 'backup' && (
              <BackupManagementTab darkMode={darkMode} />
            )}
          </div>
        </div>

        {/* ── ROLE PROFILE PAGE ── */}
        {activePage === 'access' && managingRole && (
          <RoleProfileView role={managingRole} onBack={() => setManagingRole(null)} dm={dm} styles={styles} />
        )}

        {/* ── ACCESS CONTROL PAGE ── */}
        {activePage === 'access' && !managingRole && <>
          <div style={styles.cardGrid}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={styles.cardLabel}>TOTAL USERS</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#0891b2', lineHeight: '1' }}>
                {rbacStats ? rbacStats.active_users : '—'}
              </div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>Active accounts</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
              <span style={styles.cardLabel}>MFA ENABLED</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#f59e0b', lineHeight: '1' }}>
                {rbacStats ? rbacStats.mfa_enabled : '—'}
              </div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>
                {rbacStats ? `${rbacStats.mfa_adoption_rate}% adoption rate` : '—% adoption rate'}
              </div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={styles.cardLabel}>PENDING APPROVALS</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#f97316', lineHeight: '1' }}>
                {rbacStats ? rbacStats.pending_approvals : '—'}
              </div>
              <div style={{ ...styles.cardMeta, color: dm ? '#94a3b8' : '#6b7280' }}>Elevated permission requests</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
              <span style={styles.cardLabel}>PAM SESSIONS</span>
              <div style={{ fontSize: '34px', fontWeight: '800', color: '#7c3aed', lineHeight: '1' }}>
                {rbacStats ? rbacStats.pam_sessions : '—'}
              </div>
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
                ].map(({ role, access, mfa }) => {
                  const roleData = rolesList.find(r => r.name === role)
                  const activeCount = roleData ? roleData.active_user_count : '—'
                  return (
                  <tr key={role}>
                    <td style={{ ...styles.td, color: '#0891b2', fontWeight: '600' }}>{role}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{activeCount}</td>
                    <td style={styles.td}>{access}</td>
                    <td style={styles.td}>
                      {mfa === 'required' ? <span style={styles.mfaRequired}>Required</span> : <span style={styles.mfaOptional}>Optional</span>}
                    </td>
                    <td style={styles.td}><button onClick={() => setManagingRole(role)} style={styles.manageLink}>Manage &gt;</button></td>
                  </tr>
                )})}
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
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '10px',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 14px',
    borderRadius: '999px',
    border: `1.5px solid ${dm ? '#475569' : '#d1d5db'}`,
    background: dm ? 'transparent' : 'white',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.8px',
    color: dm ? '#94a3b8' : '#374151',
    boxSizing: 'border-box',
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
