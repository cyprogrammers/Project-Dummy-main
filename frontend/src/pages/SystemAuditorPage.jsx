import { useState, useEffect } from 'react'
import { activity as activityAPI } from '../services/authService'

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
        if (showSpinner) setAuditLoading(false)
      }
    }

    fetchLogs(true)
    const interval = setInterval(() => fetchLogs(false), 5000)
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

  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000
  const count24h = filterActive
    ? filteredLogs.length
    : auditLogs.filter(log => {
        if (!log.timestamp) return false
        return new Date(log.timestamp).getTime() >= cutoff24h
      }).length

  const blockedCount = (filterActive ? filteredLogs : auditLogs).filter(log => {
    const r = String(log.result).toUpperCase()
    return r === 'FAILED' || r === 'ENFORCED'
  }).length

  const applyFilter = () => setAppliedFrom(filterFrom) || setAppliedTo(filterTo)
  const clearFilter = () => { setFilterFrom(''); setFilterTo(''); setAppliedFrom(''); setAppliedTo('') }

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
            <div style={{ ...styles.cardValue, color: '#0ea5e9' }}>—</div>
            <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Role assignments</div>
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
                <span style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>Showing {filteredLogs.length} of {auditLogs.length} events</span>
              )}
            </div>
          )}

          {activePage === 'audit-trail' ? (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['TIMESTAMP', 'ACTOR', 'ACTION', 'TARGET', 'IP ADDRESS', 'RESULT'].map((col) => (
                      <th key={col} style={styles.th}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>Loading audit events…</td></tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: dm ? '#64748b' : '#9ca3af' }}>{auditLogs.length === 0 ? 'No audit events recorded yet' : 'No events match the selected date range'}</td></tr>
                  ) : filteredLogs.map((log, i, arr) => {
                    const r = String(log.result).toUpperCase()
                    const resultColor = r === 'SUCCESS'  ? { background: '#d1fae5', color: '#065f46', border: '1px solid #10b981' }
                                      : r === 'FAILED'   ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444' }
                                      : r === 'PENDING'  ? { background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }
                                      : r === 'ENFORCED' ? { background: '#ffedd5', color: '#9a3412', border: '1px solid #f97316' }
                                      : r === 'DENIED'   ? { background: '#ede9fe', color: '#5b21b6', border: '1px solid #7c3aed' }
                                      :                    { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }
                    return (
                      <tr key={log.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                        <td style={styles.tdTimestamp}>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                        <td style={{ ...styles.td, color: dm ? '#93c5fd' : '#0891b2', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.actor_email || '—'}
                        </td>
                        <td style={styles.td}>
                          <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', border: `1px solid ${dm ? '#0891b2' : '#67e8f9'}`, color: dm ? '#22d3ee' : '#0891b2', background: 'transparent' }}>
                            {String(log.action).toUpperCase()}
                          </span>
                        </td>
                        <td style={{ ...styles.td, color: dm ? '#94a3b8' : '#6b7280', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.target_user_email || log.role_name || '—'}
                        </td>
                        <td style={styles.td}>{log.ip_address || '—'}</td>
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
          ) : (
            <div style={styles.alertList}>
              {PLACEHOLDER_ROWS.map((item, index) => (
                <div key={item} style={{ ...styles.alertRow, borderBottom: index < PLACEHOLDER_ROWS.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                  <div style={styles.alertLeft}>
                    <span style={{ ...styles.alertDot, background: index % 2 === 0 ? '#ef4444' : '#0ea5e9' }} />
                    <div>
                      <div style={styles.alertTitle}>—</div>
                      <div style={styles.alertSource}>—</div>
                    </div>
                  </div>
                  <div style={styles.alertRight}>
                    <span style={styles.alertTime}>—</span>
                    <span style={styles.badgeNeutral}>—</span>
                  </div>
                </div>
              ))}
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
