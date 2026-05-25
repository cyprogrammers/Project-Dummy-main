import { useState, useEffect, useRef } from 'react'
import { activity as activityAPI, users as usersAPI } from '../services/authService'

const NAV_ITEMS = [
  {
    id: 'audit-trail',
    label: 'Audit Trail',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 6h8" />
        <path d="M8 12h8" />
        <path d="M8 18h4" />
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    ),
  },
  {
    id: 'control-effectiveness',
    label: 'Control Effectiveness',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'export-reports',
    label: 'Export Reports',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
]

const PAGE_HEADERS = {
  'audit-trail': {
    title: 'System Auditor',
    subtitle: 'Tamper-Evident Audit Trail · Read-Only View · 12-Month Retention',
    panelTitle: 'RECENT AUDIT EVENTS',
  },
  'control-effectiveness': {
    title: 'Control Effectiveness',
    subtitle: 'Policy Validation · Configuration Drift · Risk Policy Audit',
    panelTitle: 'CONTROL METRICS',
  },
  'export-reports': {
    title: 'Export Reports',
    subtitle: 'Regulatory Export · Compliance Snapshots · Evidence Logging',
    panelTitle: 'EXPORT STATUS',
  },
}

const PLACEHOLDER_ROWS = [1, 2, 3, 4]

const EXPORT_TYPES = [
  { id: 'audit-trail',           label: 'Audit Trail',           desc: 'All system events, logins & access changes' },
  { id: 'control-effectiveness', label: 'Control Effectiveness', desc: 'GDPR / POPIA / ISO 27001 live control scores' },
  { id: 'gdpr',                  label: 'GDPR Evaluation',       desc: 'Full GDPR compliance findings & recommendations' },
  { id: 'popia',                 label: 'POPIA Evaluation',      desc: 'Full POPIA compliance findings & recommendations' },
  { id: 'iso27001',              label: 'ISO 27001 Evaluation',  desc: 'ISO 27001 audit findings & observations' },
  { id: 'backup-status',         label: 'Backup Status',         desc: 'Backup jobs, integrity checks & storage utilization' },
  { id: 'task-report',           label: 'Task Report',           desc: 'IT tasks, assignments & completion status' },
  { id: 'user-access',           label: 'User Access Report',    desc: 'Users, roles, permissions & MFA status' },
]

export default function SystemAuditorPage({ onLogout, currentUser }) {
  const [activePage, setActivePage] = useState('audit-trail')
  const [darkMode, setDarkMode] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [showFilter, setShowFilter] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo] = useState('')

  const [controlsData, setControlsData] = useState(null)
  const [controlsLoading, setControlsLoading] = useState(false)
  const [controlsError, setControlsError] = useState('')

  const [exportHistory, setExportHistory] = useState([])
  const [exportBusy, setExportBusy] = useState(false)
  const [exportType, setExportType] = useState('audit-trail')
  const [exportFormat, setExportFormat] = useState('csv')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')

  const isFetchingRef = useRef(false)

  useEffect(() => {
    let active = true

    const fetchAllLogs = async () => {
      const PAGE = 200
      let page = 1
      let all = []
      while (true) {
        const batch = await activityAPI.list({ page_size: PAGE, page })
        if (!Array.isArray(batch) || batch.length === 0) break
        all = [...all, ...batch]
        if (batch.length < PAGE) break
        page++
      }
      return all
    }

    const fetchLogs = async (showSpinner = false) => {
      if (isFetchingRef.current) return
      isFetchingRef.current = true
      if (showSpinner) setAuditLoading(true)
      try {
        const logs = await fetchAllLogs()
        if (active) {
          setAuditLogs(logs)
          setLastRefreshed(new Date())
        }
      } catch (err) {
        console.error('Failed to fetch audit logs:', err)
      } finally {
        isFetchingRef.current = false
        if (showSpinner) setAuditLoading(false)
      }
    }

    fetchLogs(true)
    const interval = setInterval(() => fetchLogs(false), 5000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  useEffect(() => {
    let active = true

    const fetchControls = async (showSpinner = false) => {
      if (showSpinner) setControlsLoading(true)
      try {
        const res = await fetch('/api/v1/controls/effectiveness')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (active) { setControlsData(data); setControlsError('') }
      } catch (err) {
        if (active) setControlsError(err.message || 'Failed to load control metrics')
      } finally {
        if (active) setControlsLoading(false)
      }
    }

    fetchControls(true)
    const interval = setInterval(() => fetchControls(false), 30000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  const dm = darkMode
  const styles = makeStyles(dm)
  const header = PAGE_HEADERS[activePage]

  const toMs = (ts) => {
    if (!ts) return null
    return new Date(ts).getTime()
  }

  const filterActive = !!(appliedFrom || appliedTo)

  const filteredLogs = auditLogs.filter(log => {
    if (!filterActive) return true
    const ms = toMs(log.timestamp)
    if (ms === null) return false
    if (appliedFrom && ms < new Date(appliedFrom).getTime()) return false
    if (appliedTo && ms > new Date(appliedTo + 'T23:59:59.999Z').getTime()) return false
    return true
  })

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const todayEnd = todayStart + 24 * 60 * 60 * 1000

  const isTodayLocal = (ts) => {
    if (!ts) return false
    const t = new Date(ts).getTime()
    return t >= todayStart && t < todayEnd
  }

  const baseLogs = filterActive ? filteredLogs : auditLogs.filter(log => isTodayLocal(log.timestamp))

  const count24h = baseLogs.length

  const ACCESS_CHANGE_ACTIONS = new Set([
    'ROLE_ASSIGN', 'ROLE_REMOVE',
    'PERM_REQUEST', 'PERM_UPDATE',
    'STATUS_CHANGE',
    'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
    'MFA_TOGGLE', 'PASSWORD_CHANGE',
  ])

  const blockedCount = baseLogs.filter(log => {
    const r = String(log.result).toUpperCase()
    return r === 'FAILED' || r === 'ENFORCED'
  }).length

  const accessChangesCount = baseLogs.filter(log =>
    ACCESS_CHANGE_ACTIONS.has(String(log.action).toUpperCase())
  ).length

  const applyFilter = () => setAppliedFrom(filterFrom) || setAppliedTo(filterTo)
  const clearFilter = () => { setFilterFrom(''); setFilterTo(''); setAppliedFrom(''); setAppliedTo('') }

  // ── Export helpers ────────────────────────────────────────────────────────
  const buildExportHTML = (title, headerRow, dataRows, from, to, summaryLines = []) => {
    const period = (from || to) ? `${from || 'start'} → ${to || 'now'}` : 'Full dataset'
    const thead = headerRow.map(h => `<th>${h}</th>`).join('')
    const tbody = dataRows.map(r =>
      `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`
    ).join('\n')
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;margin:40px;color:#111;font-size:12px}
  h1{font-size:20px;margin-bottom:4px}
  .meta{color:#6b7280;font-size:11px;margin-bottom:14px}
  .summary{background:#f3f4f6;border-radius:6px;padding:10px 14px;margin-bottom:14px;line-height:1.7}
  table{width:100%;border-collapse:collapse}
  th{background:#1d4ed8;color:white;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#f9fafb}
  @media print{body{margin:20px}}
</style></head><body>
<h1>${title}</h1>
<div class="meta">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Period: ${period} &nbsp;|&nbsp; System: AITRMS Audit Console</div>
${summaryLines.length ? `<div class="summary">${summaryLines.map(l => `<div>${l}</div>`).join('')}</div>` : ''}
<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
</body></html>`
  }

  const triggerDownload = (entry) => {
    if (!entry.blobUrl) return
    const a = document.createElement('a')
    a.href = entry.blobUrl
    a.download = entry.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleGenerateExport = async () => {
    if (exportBusy) return
    setExportBusy(true)

    const eid = `exp-${Date.now()}`
    const typeDef = EXPORT_TYPES.find(t => t.id === exportType)
    const newEntry = {
      id: eid,
      name: typeDef.label,
      format: exportFormat === 'csv' ? 'CSV' : 'HTML',
      requestedBy: currentUser?.email || 'auditor',
      generatedAt: new Date().toISOString(),
      status: 'generating',
      records: 0,
      blobUrl: null,
      filename: '',
      error: '',
    }
    setExportHistory(h => [newEntry, ...h])

    try {
      const token = sessionStorage.getItem('rbac_access')
      const authFetch = async (url, opts = {}) => {
        const method = (opts.method || 'GET').toUpperCase()
        const headers = { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
        if (method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json'
        const r = await fetch(url, { ...opts, headers })
        if (!r.ok) {
          let detail = `HTTP ${r.status}`
          try { const body = await r.json(); detail = body.detail || JSON.stringify(body) } catch (_) {}
          throw new Error(`${detail} (${url})`)
        }
        return r.json()
      }

      const fromMs = exportFrom ? new Date(exportFrom).getTime() : null
      const toMs   = exportTo   ? new Date(exportTo + 'T23:59:59.999Z').getTime() : null
      const inRange = (ts) => {
        if (!ts) return true
        const t = new Date(ts).getTime()
        if (fromMs && t < fromMs) return false
        if (toMs   && t > toMs)   return false
        return true
      }
      const byDate = (rows, field) => (fromMs || toMs) ? rows.filter(r => inRange(r[field])) : rows

      const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v)
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
          ? `"${s.replace(/"/g, '""')}"` : s
      }
      const toCSV = (headers, rows) =>
        [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')

      let csvContent = ''
      let htmlContent = ''
      let recordCount = 0

      if (exportType === 'audit-trail') {
        const PAGE = 200
        let page = 1; let all = []
        while (true) {
          const batch = await authFetch(`/api/v1/rbac/activity?page_size=${PAGE}&page=${page}`)
          if (!Array.isArray(batch) || batch.length === 0) break
          all = [...all, ...batch]
          if (batch.length < PAGE) break
          page++
        }
        const rows = byDate(all, 'timestamp')
        recordCount = rows.length
        const headers = ['Timestamp', 'Actor', 'Action', 'Target', 'IP Address', 'Result', 'Details']
        const data = rows.map(r => [
          r.timestamp ? new Date(r.timestamp).toISOString() : '',
          r.actor_email || '', r.action || '',
          r.target_user_email || r.role_name || '',
          r.ip_address || '', r.result || '',
          r.details ? JSON.stringify(r.details) : '',
        ])
        csvContent = toCSV(headers, data)
        htmlContent = buildExportHTML('Audit Trail Export', headers.slice(0, -1),
          rows.map(r => [
            r.timestamp ? new Date(r.timestamp).toLocaleString() : '—',
            r.actor_email || '—', r.action || '—',
            r.target_user_email || r.role_name || '—',
            r.ip_address || '—', r.result || '—',
          ]), exportFrom, exportTo)

      } else if (exportType === 'control-effectiveness') {
        const data = await authFetch('/api/v1/controls/effectiveness')
        const metrics = data.controls || []
        recordCount = metrics.length
        const summaryCSV = [
          `GDPR Score,${data.gdpr_score}/100`,
          `POPIA Score,${data.popia_score}/100`,
          `ISO 27001 Score,${data.iso_score}/100`,
          `Assessed At,${data.assessed_at}`,
          `Window (hours),${data.window_hours}`,
          '',
        ].join('\n')
        csvContent = summaryCSV + toCSV(
          ['Control ID', 'Control Name', 'Domain', 'Framework', 'Effectiveness (%)', 'Status', 'Last Assessed'],
          metrics.map(c => [c.id, c.name, c.domain, c.framework, c.effectiveness, c.status, c.last_assessed])
        )
        htmlContent = buildExportHTML('Control Effectiveness Report',
          ['Control ID', 'Name', 'Domain', 'Framework', 'Effectiveness', 'Status', 'Last Assessed'],
          metrics.map(c => [c.id, c.name, c.domain, c.framework, `${c.effectiveness}%`, c.status, c.last_assessed]),
          exportFrom, exportTo,
          [`GDPR: ${data.gdpr_score}/100  |  POPIA: ${data.popia_score}/100  |  ISO 27001: ${data.iso_score}/100  |  Assessed: ${new Date(data.assessed_at).toLocaleString()}`]
        )

      } else if (exportType === 'gdpr' || exportType === 'popia' || exportType === 'iso27001') {
        const urlMap  = { gdpr: '/api/v1/gdpr/evaluate?hours=24', popia: '/api/v1/popia/evaluate?hours=24', iso27001: '/api/v1/iso27001/evaluate?hours=24' }
        const nameMap = { gdpr: 'GDPR', popia: 'POPIA', iso27001: 'ISO 27001' }
        const data = await authFetch(urlMap[exportType], { method: 'POST' })
        const findings = data.findings || []
        recordCount = findings.length
        const summaryLines = [
          `Overall Score: ${data.overall_score ?? '—'}`,
          `Risk Level: ${data.risk_level ?? '—'}`,
          `Events Analysed: ${data.events_analyzed ?? '—'}`,
          `Log Window: ${data.log_window_hours ?? '—'}h`,
          `Evaluated: ${data.evaluated_at ? new Date(data.evaluated_at).toLocaleString() : '—'}`,
          data.summary ? `Summary: ${data.summary}` : '',
        ].filter(Boolean)
        csvContent = [
          ...summaryLines.map(l => esc(l)),
          '',
          toCSV(
            ['Article / Section', 'Title', 'Risk Level', 'Observation', 'Recommendation'],
            findings.map(f => [f.article || '', f.title || '', f.risk_level || '', f.observation || '', f.recommendation || ''])
          ),
        ].join('\n')
        htmlContent = buildExportHTML(`${nameMap[exportType]} Compliance Report`,
          ['Article', 'Title', 'Risk Level', 'Observation', 'Recommendation'],
          findings.map(f => [f.article, f.title, f.risk_level, f.observation, f.recommendation]),
          exportFrom, exportTo, summaryLines
        )

      } else if (exportType === 'backup-status') {
        const [jobs, overview] = await Promise.all([
          authFetch('/api/v1/backup/jobs'),
          authFetch('/api/v1/backup/overview'),
        ])
        const jobList = Array.isArray(jobs) ? jobs : []
        recordCount = jobList.length
        csvContent = [
          `Success Rate,${overview.success_rate_percent}%`,
          `Total Backup Size,${overview.total_backup_size_gb} GB`,
          `Failed Jobs,${overview.failed_jobs}`,
          `Verified Jobs,${overview.jobs_verified}`,
          '',
          toCSV(
            ['Name', 'Type', 'Destination', 'Status', 'Last Run', 'Next Run', 'Size (GB)', 'Retention (days)', 'Copies', 'Integrity Verified', 'Duration (s)', 'Error'],
            jobList.map(j => [
              j.name, j.type, j.destination, j.status,
              j.last_run ? new Date(j.last_run).toISOString() : '',
              j.next_run ? new Date(j.next_run).toISOString() : '',
              j.size_gb || 0, j.retention_days, j.copies,
              j.integrity_verified ? 'Yes' : 'No',
              j.duration_seconds || '', j.error_message || '',
            ])
          ),
        ].join('\n')
        htmlContent = buildExportHTML('Backup Status Report',
          ['Name', 'Type', 'Destination', 'Status', 'Last Run', 'Size (GB)', 'Integrity', 'Retention'],
          jobList.map(j => [
            j.name, j.type, j.destination, j.status,
            j.last_run ? new Date(j.last_run).toLocaleString() : '—',
            `${j.size_gb || 0} GB`,
            j.integrity_verified ? 'Verified' : 'Unverified',
            `${j.retention_days}d × ${j.copies} copies`,
          ]),
          exportFrom, exportTo,
          [`Success Rate: ${overview.success_rate_percent}%  |  Total: ${overview.total_backup_size_gb} GB  |  Failed: ${overview.failed_jobs}  |  Verified: ${overview.jobs_verified}`]
        )

      } else if (exportType === 'task-report') {
        const [tasks, overview] = await Promise.all([
          authFetch('/api/v1/tasks/'),
          authFetch('/api/v1/tasks/overview'),
        ])
        const taskList = byDate(Array.isArray(tasks) ? tasks : (tasks?.items || tasks?.tasks || []), 'created_at')
        recordCount = taskList.length
        csvContent = toCSV(
          ['ID', 'Title', 'Category', 'Priority', 'Status', 'Assigned To', 'Assigned By', 'Due Date', 'Created At', 'Completed At', 'Tags'],
          taskList.map(t => [
            t.id, t.title, t.category, t.priority, t.status,
            t.assigned_to_email || '', t.assigned_by_email || '',
            t.due_date || '', t.created_at || '', t.completed_at || '',
            (t.tags || []).join('; '),
          ])
        )
        htmlContent = buildExportHTML('Task Report',
          ['Title', 'Category', 'Priority', 'Status', 'Assigned To', 'Due Date', 'Created'],
          taskList.map(t => [
            t.title, t.category, t.priority, t.status,
            t.assigned_to_email || '—',
            t.due_date || '—',
            t.created_at ? new Date(t.created_at).toLocaleDateString() : '—',
          ]),
          exportFrom, exportTo,
          [`Total: ${overview.total}  |  Pending: ${overview.pending}  |  In Progress: ${overview.in_progress}  |  Completed: ${overview.completed}  |  Overdue: ${overview.overdue}`]
        )

      } else if (exportType === 'user-access') {
        // Use the service layer (handles auth + token refresh) and paginate fully
        let allUsers = []
        let page = 1
        while (true) {
          const raw = await usersAPI.list({ page_size: 200, page })
          const batch = Array.isArray(raw) ? raw : (raw.items || [])
          if (!batch.length) break
          allUsers = [...allUsers, ...batch]
          const totalPages = raw.total_pages ?? 1
          if (page >= totalPages) break
          page++
        }
        recordCount = allUsers.length
        csvContent = toCSV(
          ['Email', 'First Name', 'Surname', 'Status', 'MFA Enabled', 'Roles', 'Last Login', 'Created At'],
          allUsers.map(u => [
            u.email, u.first_name, u.surname, u.status,
            u.mfa_enabled ? 'Yes' : 'No',
            (u.roles || []).map(r => r.name).join('; '),
            u.last_login ? new Date(u.last_login).toISOString() : '',
            u.created_at ? new Date(u.created_at).toISOString() : '',
          ])
        )
        htmlContent = buildExportHTML('User Access Report',
          ['Email', 'Status', 'MFA', 'Roles', 'Last Login'],
          allUsers.map(u => [
            u.email, u.status,
            u.mfa_enabled ? 'Yes' : 'No',
            (u.roles || []).map(r => r.name).join(', ') || '—',
            u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
          ]),
          exportFrom, exportTo
        )
      }

      const dateStamp = new Date().toISOString().split('T')[0]
      const baseName  = `${exportType}-${dateStamp}`
      const isCSV     = exportFormat === 'csv'
      const content   = isCSV ? csvContent : htmlContent
      const mime      = isCSV ? 'text/csv;charset=utf-8;' : 'text/html;charset=utf-8;'
      const filename  = `${baseName}.${isCSV ? 'csv' : 'html'}`
      const blob      = new Blob([content], { type: mime })
      const blobUrl   = URL.createObjectURL(blob)

      setExportHistory(h => h.map(e =>
        e.id === eid ? { ...e, status: 'completed', records: recordCount, blobUrl, filename } : e
      ))
    } catch (err) {
      setExportHistory(h => h.map(e =>
        e.id === eid ? { ...e, status: 'failed', error: err.message } : e
      ))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.brand}>
            <div style={styles.brandIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div style={styles.brandName}>SYSTEM AUDITOR</div>
              <div style={styles.brandSub}>Senior Audit Console</div>
            </div>
          </div>

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
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
                  {item.label}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div style={styles.profile}>
          <div style={styles.profileInner}>
            <div style={styles.avatar}>
              <span style={styles.avatarText}>
                {currentUser ? `${(currentUser.first_name?.[0] || '').toUpperCase()}${(currentUser.surname?.[0] || '').toUpperCase()}` : 'SA'}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...styles.profileName, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser ? `${(currentUser.first_name?.[0] || '').toUpperCase()}. ${currentUser.surname}` : 'System Auditor'}
              </div>
              <div style={{ ...styles.profileRole, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser?.email || 'auditor@secureops.io'}
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

      <main style={styles.main}>
        <div style={{ ...styles.card, background: dm ? '#1e293b' : 'white', border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <h1 style={{ ...styles.pageTitle, margin: '0 0 4px 0' }}>{header.title}</h1>
            <p style={styles.pageSubtitle}>{header.subtitle}</p>
          </div>
          <div style={styles.headerRight}>
            <button
              onClick={() => setDarkMode(!dm)}
              style={styles.themeToggle}
              title={dm ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dm ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div style={styles.cardGrid4}>
          <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce7'}` }}>
            <span style={{ ...styles.cardLabel, color: dm ? '#94a3b8' : '#6b7280' }}>EVENTS (24H)</span>
            <div style={{ ...styles.cardValue, color: '#16a34a' }}>{auditLoading ? '…' : count24h}</div>
            <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>
              {lastRefreshed ? `Updated ${lastRefreshed.toLocaleTimeString()}` : 'Loading…'}
            </div>
          </div>
          <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
            <span style={{ ...styles.cardLabel, color: dm ? '#94a3b8' : '#6b7280' }}>ACCESS CHANGES</span>
            <div style={{ ...styles.cardValue, color: '#0ea5e9' }}>{auditLoading ? '…' : accessChangesCount}</div>
            <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Role, account & auth changes</div>
          </div>
          <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
            <span style={{ ...styles.cardLabel, color: dm ? '#94a3b8' : '#6b7280' }}>BLOCKED EVENTS</span>
            <div style={{ ...styles.cardValue, color: '#ef4444' }}>{auditLoading ? '…' : blockedCount}</div>
            <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Brute-force + scans</div>
          </div>
          <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
            <span style={{ ...styles.cardLabel, color: dm ? '#94a3b8' : '#6b7280' }}>LOG INTEGRITY</span>
            <div style={{ ...styles.cardValue, color: '#16a34a' }}>OK</div>
            <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>No tampering detected</div>
          </div>
        </div>

        <div style={styles.chartCard}>
          <div style={styles.alertsHeader}>
            <div style={styles.alertsTitleRow}>
              <span style={styles.alertsTitle}>{header.panelTitle}</span>
            </div>
            {activePage === 'audit-trail' && (
              <button
                onClick={() => setShowFilter(f => !f)}
                style={{ ...styles.viewAllBtn, display: 'flex', alignItems: 'center', gap: '6px', background: showFilter ? (dm ? '#1e40af' : '#eff6ff') : undefined, borderColor: showFilter ? '#3b82f6' : undefined, color: showFilter ? '#3b82f6' : undefined }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filter by Date
              </button>
            )}
          </div>

          {activePage === 'audit-trail' && showFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0 16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: dm ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap' }}>FROM</label>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: dm ? '#0f172a' : '#f9fafb', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: dm ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap' }}>TO</label>
                <input
                  type="date"
                  value={filterTo}
                  onChange={e => setFilterTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: dm ? '#0f172a' : '#f9fafb', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none' }}
                />
              </div>
              <button onClick={applyFilter} style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Apply</button>
              {(appliedFrom || appliedTo) && (
                <button onClick={clearFilter} style={{ padding: '6px 16px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: 'transparent', color: dm ? '#94a3b8' : '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Clear</button>
              )}
              {(appliedFrom || appliedTo) && (
                <span style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>Showing {baseLogs.length} of {auditLogs.length} events</span>
              )}
            </div>
          )}

          {activePage === 'audit-trail' ? (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['TIMESTAMP', 'ACTOR', 'ACTION', 'TARGET', 'RESULT'].map((col) => (
                      <th key={col} style={styles.th}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>Loading audit events…</td></tr>
                  ) : baseLogs.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>{auditLogs.length === 0 ? 'No audit events recorded yet' : filterActive ? 'No events match the selected date range' : 'No audit events recorded today'}</td></tr>
                  ) : baseLogs.map((log, i, arr) => {
                    const r = String(log.result).toUpperCase()
                    const resultColor = r === 'SUCCESS'  ? { background: '#d1fae5', color: '#065f46', border: '1px solid #10b981' }
                                      : r === 'FAILED'   ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444' }
                                      : r === 'PENDING'  ? { background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }
                                      : r === 'ENFORCED' ? { background: '#ffedd5', color: '#9a3412', border: '1px solid #f97316' }
                                      : r === 'DENIED'   ? { background: '#ede9fe', color: '#5b21b6', border: '1px solid #7c3aed' }
                                      :                    { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }

                    const action = String(log.action).toUpperCase()
                    const d = log.details || {}

                    // USER_DELETE logs details.email because target_user is already deleted before log_activity is called
                    const targetEmail = log.target_user_email || d.email || log.role_name || null

                    let targetLabel = null
                    if (action === 'MFA_TOGGLE') {
                      targetLabel = d.enabled === true  ? { text: 'MFA Enabled',  color: '#16a34a', bg: '#d1fae5' }
                                  : d.enabled === false ? { text: 'MFA Disabled', color: '#b45309', bg: '#fef3c7' }
                                  : null
                    } else if (action === 'STATUS_CHANGE') {
                      const to = String(d.to || '').toLowerCase()
                      targetLabel = to === 'suspended' ? { text: 'Suspended',  color: '#991b1b', bg: '#fee2e2' }
                                  : to === 'active'    ? { text: 'Activated',  color: '#065f46', bg: '#d1fae5' }
                                  : to                 ? { text: to.charAt(0).toUpperCase() + to.slice(1), color: '#374151', bg: '#f3f4f6' }
                                  : null
                    } else if (action === 'USER_DELETE') {
                      targetLabel = { text: 'User Deleted', color: '#991b1b', bg: '#fee2e2' }
                    } else if (action === 'USER_CREATE') {
                      targetLabel = { text: 'User Created', color: '#065f46', bg: '#d1fae5' }
                    } else if (action === 'USER_UPDATE') {
                      const fields = Object.keys(d)
                      const fieldText = fields.length > 0
                        ? fields.map(f => f.replace(/_/g, ' ')).join(', ')
                        : 'profile'
                      targetLabel = { text: fieldText.charAt(0).toUpperCase() + fieldText.slice(1) + ' updated', color: '#1d4ed8', bg: '#dbeafe' }
                    } else if (action === 'PASSWORD_CHANGE') {
                      targetLabel = { text: 'Password Changed', color: '#1d4ed8', bg: '#dbeafe' }
                    } else if (action === 'ROLE_ASSIGN') {
                      targetLabel = log.role_name ? { text: `Assigned: ${log.role_name}`, color: '#7c3aed', bg: '#ede9fe' } : null
                    } else if (action === 'ROLE_REMOVE') {
                      targetLabel = log.role_name ? { text: `Removed: ${log.role_name}`, color: '#9a3412', bg: '#ffedd5' } : null
                    } else if (action === 'PERM_UPDATE') {
                      targetLabel = { text: 'Permissions Updated', color: '#7c3aed', bg: '#ede9fe' }
                    } else if (action === 'PERM_REQUEST') {
                      targetLabel = { text: 'Permission Requested', color: '#d97706', bg: '#fef3c7' }
                    } else if (action === 'SESSION_KILL') {
                      targetLabel = { text: 'Session Terminated', color: '#9a3412', bg: '#ffedd5' }
                    }

                    return (
                      <tr key={log.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                        <td style={styles.tdTimestamp}>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                        <td style={{ ...styles.td, color: dm ? '#93c5fd' : '#0891b2', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.actor_email || '—'}
                        </td>
                        <td style={styles.td}>
                          <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', border: `1px solid ${dm ? '#0891b2' : '#67e8f9'}`, color: dm ? '#22d3ee' : '#0891b2', background: 'transparent' }}>
                            {action}
                          </span>
                        </td>
                        <td style={{ ...styles.td, maxWidth: '220px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: dm ? '#94a3b8' : '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {targetEmail || '—'}
                            </span>
                            {targetLabel && (
                              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.3px', background: targetLabel.bg, color: targetLabel.color, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                                {targetLabel.text}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={{ display: 'inline-block', padding: '3px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', ...resultColor }}>
                            {r === 'FAILED' ? 'BLOCKED' : r}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : activePage === 'control-effectiveness' ? (() => {
            const metrics = controlsData?.controls ?? []
            const passingCount  = metrics.filter(c => c.status === 'Passing').length
            const degradedCount = metrics.filter(c => c.status === 'Degraded').length
            const failingCount  = metrics.filter(c => c.status === 'Failing').length
            const avgEff = metrics.length > 0
              ? Math.round(metrics.reduce((s, c) => s + c.effectiveness, 0) / metrics.length)
              : 0

            const statusSty = (s) =>
              s === 'Passing'  ? { bg: '#d1fae5', color: '#065f46', border: '#10b981' } :
              s === 'Degraded' ? { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' } :
                                 { bg: '#fee2e2', color: '#991b1b', border: '#ef4444' }

            const effColor = (pct) => pct >= 85 ? '#16a34a' : pct >= 65 ? '#d97706' : '#dc2626'

            if (controlsLoading && !controlsData) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '60px 0', textAlign: 'center' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.2s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#94a3b8' : '#6b7280' }}>Loading live control metrics…</div>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
              )
            }

            if (controlsError && !controlsData) {
              return (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '16px 20px', fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>
                  Failed to load control metrics: {controlsError}
                </div>
              )
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>


                {/* Summary strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'TOTAL CONTROLS', value: metrics.length || 12, color: dm ? '#f1f5f9' : '#111827' },
                    { label: 'PASSING',         value: passingCount,         color: '#16a34a' },
                    { label: 'DEGRADED',        value: degradedCount,        color: '#d97706' },
                    { label: 'FAILING',         value: failingCount,         color: '#dc2626' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: dm ? '#0f172a' : '#f8fafc', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '12px', padding: '14px 18px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '6px' }}>{label}</div>
                      <div style={{ fontSize: '28px', fontWeight: '800', color, lineHeight: '1' }}>{controlsLoading ? '…' : value}</div>
                    </div>
                  ))}
                </div>

                {/* Avg effectiveness bar */}
                <div style={{ background: dm ? '#0f172a' : '#f8fafc', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>AVG EFFECTIVENESS</span>
                  <div style={{ flex: 1, height: '10px', borderRadius: '999px', background: dm ? '#1e293b' : '#e5e7eb', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${avgEff}%`, borderRadius: '999px', background: effColor(avgEff), transition: 'width 0.6s ease' }} />
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: effColor(avgEff), minWidth: '44px', textAlign: 'right' }}>
                    {controlsLoading ? '…' : `${avgEff}%`}
                  </span>
                  {controlsData && (
                    <span style={{ fontSize: '11px', color: dm ? '#475569' : '#9ca3af', whiteSpace: 'nowrap' }}>
                      Updated {new Date(controlsData.assessed_at).toLocaleTimeString()} · {controlsData.window_hours}h window
                    </span>
                  )}
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {['Control ID', 'Control Name', 'Domain', 'Framework', 'Effectiveness', 'Status', 'Last Assessed'].map(h => (
                          <th key={h} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((c, i, arr) => {
                        const ss = statusSty(c.status)
                        const ec = effColor(c.effectiveness)
                        return (
                          <tr key={c.id}
                            style={{ borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = dm ? '#0f172a' : '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: '700', color: dm ? '#94a3b8' : '#374151', fontSize: '13px', whiteSpace: 'nowrap' }}>
                              {c.id}
                            </td>
                            <td style={{ ...styles.td, fontWeight: '600', color: dm ? '#f1f5f9' : '#111827', whiteSpace: 'nowrap' }}>
                              {c.name}
                            </td>
                            <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: dm ? '#1e3a5f' : '#eff6ff', color: dm ? '#93c5fd' : '#1d4ed8', border: `1px solid ${dm ? '#1d4ed8' : '#bfdbfe'}` }}>
                                {c.domain}
                              </span>
                            </td>
                            <td style={{ ...styles.td, fontSize: '12px', color: dm ? '#64748b' : '#9ca3af', whiteSpace: 'nowrap' }}>
                              {c.framework}
                            </td>
                            <td style={{ ...styles.td, minWidth: '140px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: 1, height: '7px', borderRadius: '999px', background: dm ? '#334155' : '#e5e7eb', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${c.effectiveness}%`, borderRadius: '999px', background: ec, transition: 'width 0.6s ease' }} />
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: ec, minWidth: '36px', textAlign: 'right' }}>{c.effectiveness}%</span>
                              </div>
                            </td>
                            <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                                {c.status}
                              </span>
                            </td>
                            <td style={{ ...styles.tdTimestamp, whiteSpace: 'nowrap' }}>
                              {c.last_assessed}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )
          })() : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* ── Report generator ── */}
              <div style={{ background: dm ? '#0f172a' : '#f8fafc', borderRadius: '12px', padding: '20px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '16px' }}>
                  GENERATE NEW REPORT
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 140px 140px auto', gap: '12px', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.6px', marginBottom: '6px' }}>REPORT TYPE</label>
                    <select
                      value={exportType}
                      onChange={e => setExportType(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: dm ? '#1e293b' : 'white', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                    >
                      {EXPORT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.6px', marginBottom: '6px' }}>FORMAT</label>
                    <select
                      value={exportFormat}
                      onChange={e => setExportFormat(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: dm ? '#1e293b' : 'white', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="csv">CSV</option>
                      <option value="html">HTML / PDF</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.6px', marginBottom: '6px' }}>FROM DATE</label>
                    <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: dm ? '#1e293b' : 'white', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.6px', marginBottom: '6px' }}>TO DATE</label>
                    <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: dm ? '#1e293b' : 'white', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <button
                    onClick={handleGenerateExport}
                    disabled={exportBusy}
                    style={{ padding: '8px 22px', borderRadius: '8px', border: 'none', background: exportBusy ? (dm ? '#334155' : '#e5e7eb') : '#1d4ed8', color: exportBusy ? (dm ? '#64748b' : '#9ca3af') : 'white', fontSize: '13px', fontWeight: '700', cursor: exportBusy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', height: '38px' }}
                  >
                    {exportBusy ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Generate
                      </>
                    )}
                  </button>
                </div>
                <div style={{ marginTop: '10px', fontSize: '12px', color: dm ? '#475569' : '#9ca3af' }}>
                  {EXPORT_TYPES.find(t => t.id === exportType)?.desc}
                  {(exportFrom || exportTo)
                    ? ` · Date filter: ${exportFrom || 'start'} to ${exportTo || 'now'}`
                    : ' · No date filter — full dataset'}
                </div>
              </div>

              {/* ── Export status table ── */}
              {exportHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: dm ? '#475569' : '#9ca3af', fontSize: '14px' }}>
                  No exports generated yet. Use the panel above to create your first report.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {['Report Name', 'Format', 'Requested By', 'Generated At', 'Records', 'Status', 'Download'].map(col => (
                          <th key={col} style={styles.th}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {exportHistory.map((entry, i, arr) => {
                        const ss =
                          entry.status === 'completed'  ? { bg: '#d1fae5', color: '#065f46', border: '#10b981', label: 'COMPLETED' } :
                          entry.status === 'generating' ? { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd', label: 'GENERATING' } :
                                                          { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'FAILED' }
                        const fmtStyle = entry.format === 'CSV'
                          ? { bg: dm ? '#1e3a5f' : '#eff6ff', color: dm ? '#93c5fd' : '#1d4ed8', border: dm ? '#1d4ed8' : '#bfdbfe' }
                          : { bg: dm ? '#2e1065' : '#f5f3ff', color: dm ? '#c4b5fd' : '#7c3aed', border: dm ? '#7c3aed' : '#ddd6fe' }
                        return (
                          <tr key={entry.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                            <td style={{ ...styles.td, fontWeight: '600', color: dm ? '#f1f5f9' : '#111827' }}>{entry.name}</td>
                            <td style={styles.td}>
                              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', background: fmtStyle.bg, color: fmtStyle.color, border: `1px solid ${fmtStyle.border}` }}>
                                {entry.format}
                              </span>
                            </td>
                            <td style={{ ...styles.td, color: dm ? '#93c5fd' : '#0891b2' }}>{entry.requestedBy}</td>
                            <td style={styles.tdTimestamp}>{new Date(entry.generatedAt).toLocaleString()}</td>
                            <td style={{ ...styles.td, color: dm ? '#94a3b8' : '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                              {entry.status === 'generating' ? '...' : (entry.records ?? 0).toLocaleString()}
                            </td>
                            <td style={styles.td}>
                              <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.4px', background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                                {ss.label}
                              </span>
                            </td>
                            <td style={styles.td}>
                              {entry.status === 'completed' && entry.blobUrl ? (
                                <button
                                  onClick={() => triggerDownload(entry)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 14px', borderRadius: '7px', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, background: 'transparent', color: dm ? '#94a3b8' : '#374151', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Download
                                </button>
                              ) : entry.status === 'failed' ? (
                                <span style={{ fontSize: '12px', color: '#ef4444', maxWidth: '220px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.error}>{entry.error || 'Failed'}</span>
                              ) : (
                                <span style={{ fontSize: '12px', color: dm ? '#475569' : '#d1d5db' }}>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
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
    width: '240px',
    minWidth: '240px',
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
    padding: '0 20px',
  },
  brandIcon: {
    width: '42px',
    height: '42px',
    background: '#1d4ed8',
    borderRadius: '10px',
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
    padding: '0 10px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 20px',
    borderRadius: '12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '500',
    color: dm ? '#94a3b8' : '#6b7280',
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
    padding: '14px 18px',
    borderTop: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
    flexShrink: 0,
  },
  profileInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  avatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed, #db2777)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'white',
    letterSpacing: '0.5px',
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
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: '800',
    color: dm ? '#f1f5f9' : '#111827',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  pageSubtitle: {
    fontSize: '16px',
    fontWeight: '400',
    color: dm ? '#94a3b8' : '#6b7280',
    margin: '6px 0 0 0',
    lineHeight: '1.5',
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
  },
  cardGrid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  card: {
    background: dm ? '#1e293b' : '#ffffff',
    borderRadius: '20px',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: dm ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardLabel: {
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.7px',
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: '35px',
    fontWeight: '800',
    lineHeight: '1',
    letterSpacing: '-1px',
  },
  chartCard: {
    background: dm ? '#1e293b' : 'white',
    borderRadius: '16px',
    padding: '20px 24px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
  },
  alertsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  alertsTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  liveDotPulse: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 8px #22c55e',
    flexShrink: 0,
  },
  alertsTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: dm ? '#f1f5f9' : '#111827',
  },
  viewAllBtn: {
    background: 'none',
    border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
    borderRadius: '8px',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: '500',
    color: dm ? '#94a3b8' : '#6b7280',
    cursor: 'pointer',
  },
  alertList: {
    display: 'flex',
    flexDirection: 'column',
  },
  alertRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 0',
    gap: '16px',
  },
  alertLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  alertDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  alertTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: dm ? '#f1f5f9' : '#111827',
    marginBottom: '3px',
  },
  alertSource: {
    fontSize: '12px',
    color: dm ? '#64748b' : '#9ca3af',
  },
  alertRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  },
  alertTime: {
    fontSize: '13px',
    color: dm ? '#94a3b8' : '#9ca3af',
    fontWeight: '500',
  },
  badgeNeutral: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    border: `1px solid ${dm ? '#475569' : '#e5e7eb'}`,
    color: dm ? '#94a3b8' : '#6b7280',
    background: 'transparent',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: dm ? '#64748b' : '#9ca3af',
    borderBottom: `2px solid ${dm ? '#334155' : '#e5e7eb'}`,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '16px',
    color: dm ? '#cbd5e1' : '#374151',
    borderBottom: `1px solid ${dm ? '#1e293b' : '#f3f4f6'}`,
    whiteSpace: 'nowrap',
  },
  tdTimestamp: {
    padding: '14px 16px',
    color: dm ? '#94a3b8' : '#6b7280',
    borderBottom: `1px solid ${dm ? '#1e293b' : '#f3f4f6'}`,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
})
