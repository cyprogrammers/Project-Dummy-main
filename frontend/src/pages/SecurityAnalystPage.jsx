import { useEffect, useState } from 'react'

const API_BASE = 'http://localhost:8000'

const NAV_ITEMS = [
  {
    id: 'events',
    label: 'SECURITY EVENTS',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'file-access',
    label: 'FILE ACCESS ALERTS',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'login-monitor',
    label: 'LOGIN MONITOR',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
    ),
  },
  {
    id: 'threat-intel',
    label: 'THREAT INTELLIGENCE',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    id: 'attack-storyline',
    label: 'ATTACK STORYLINE',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 15l3-3 3 2 5-6" />
      </svg>
    ),
  },
]

const PAGE_HEADERS = {
  events:        { title: 'Security Analyst',       subtitle: 'Security Events',        link: 'Real-Time Threat Monitoring' },
  'file-access': { title: 'FILE ACCESS ALERTS', subtitle: 'UNAUTHORISED FILE ACCESS DETECTOR', link: 'CHAIN-OF-CUSTODY LOG' },
  'login-monitor': { title: 'Login Monitor',         subtitle: 'Authentication Events', link: 'Brute-Force & Anomaly Detection' },
  'threat-intel':  { title: 'Threat Intelligence',   subtitle: 'Threat Feed',           link: 'CVE & IOC Correlation Engine' },
  'attack-storyline': { title: 'Attack Storyline Replay', subtitle: 'Incident Chain Reconstruction', link: 'Anomaly to Containment Timeline' },
}

// Placeholder alert rows (no data)
const ALERT_PLACEHOLDERS = [1, 2, 3, 4]

export default function SecurityAnalystPage({ onLogout }) {
  const [activePage, setActivePage] = useState('events')
  const [darkMode, setDarkMode] = useState(false)
  const [storylineData, setStorylineData] = useState({ storylines: [], totals: { open: 0, critical: 0, blocked_ips: 0, avg_confidence: 0 } })
  const [isSimulating, setIsSimulating] = useState(false)
  const [storylineError, setStorylineError] = useState('')
  const styles = makeStyles(darkMode)
  const dm = darkMode
  const header = PAGE_HEADERS[activePage]

  const loadStorylines = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/ui/analyst/storylines`)
      const data = await response.json()
      setStorylineData(data)
      setStorylineError('')
    } catch (error) {
      setStorylineError('Storyline service unavailable.')
    }
  }

  const handleSimulateStoryline = async () => {
    setIsSimulating(true)
    setStorylineError('')
    try {
      const response = await fetch(`${API_BASE}/api/v1/ui/analyst/storylines/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : (data.message || JSON.stringify(data.detail || data))
        if (response.status === 503) {
          setStorylineError(`Ollama LLM required for reconstruction: ${detail}`)
        } else if (response.status === 502) {
          setStorylineError(`Elasticsearch correlation failed: ${detail}`)
        } else {
          setStorylineError(`Simulation failed (${response.status}): ${detail}`)
        }
        return
      }
      if (data.status === 'no_sessions') {
        setStorylineError(data.message || 'No correlated sessions in Elasticsearch for this window.')
      } else {
        setStorylineError('')
      }
      await loadStorylines()
    } catch (error) {
      setStorylineError('Simulation failed. Ensure backend, Elasticsearch, and Ollama are running.')
    } finally {
      setIsSimulating(false)
    }
  }

  useEffect(() => {
    if (activePage === 'attack-storyline') {
      loadStorylines()
    }
  }, [activePage])

  return (
    <div style={styles.wrapper}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          {/* Brand */}
          <div style={styles.brand}>
            <div style={styles.brandIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div style={styles.brandName}>SecureOps</div>
              <div style={styles.brandSub}>Security Platform</div>
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
                <span style={{ color: activePage === item.id ? 'white' : (dm ? '#94a3b8' : '#6b7280') }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Profile */}
        <div style={styles.profile}>
          <div style={styles.profileInner}>
            <div style={styles.avatar}>
              <span style={styles.avatarText}>SA</span>
            </div>
            <div>
              <div style={styles.profileName}>Security Analyst</div>
              <div style={styles.profileRole}>admin@secureops.io</div>
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

      {/* ── Main ── */}
      <main style={styles.main}>
        {/* Page Header */}
        <div style={{ ...styles.card, background: dm ? '#1e293b' : 'white', border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <h1 style={{ ...styles.pageTitle, margin: '0 0 4px 0' }}>{header.title}</h1>
            <p style={styles.pageSubtitle}>
              <span style={styles.liveDot} />
              {header.subtitle} &mdash;{' '}
              <span style={styles.subtitleLink}>{header.link}</span>
            </p>
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

        {/* ── SECURITY EVENTS PAGE ── */}
        {activePage === 'events' && <>
          {/* 4 Stat Cards */}
          <div style={styles.cardGrid4}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce7'}` }}>
              <div style={styles.cardHeader}>
                <span style={{ ...styles.cardLabel, color: dm ? '#fca5a5' : '#9b1c1c' }}>CRITICAL ALERTS</span>
                <div style={{ ...styles.iconBadge, background: dm ? '#450a0a' : '#fee2e2' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              </div>
              <div style={{ ...styles.cardValue, color: '#ef4444' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#fca5a5' : '#9b1c1c' }}>Require immediate action</div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#2d1f0a' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fde68a'}` }}>
              <div style={styles.cardHeader}>
                <span style={{ ...styles.cardLabel, color: dm ? '#fcd34d' : '#92400e' }}>BRUTE-FORCE DETECTED</span>
                <div style={{ ...styles.iconBadge, background: dm ? '#451a03' : '#fef3c7' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
              </div>
              <div style={{ ...styles.cardValue, color: '#f97316' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#fcd34d' : '#92400e' }}>From external IPs</div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <div style={styles.cardHeader}>
                <span style={{ ...styles.cardLabel, color: dm ? '#c4b5fd' : '#5b21b6' }}>FILES QUARANTINED</span>
                <div style={{ ...styles.iconBadge, background: dm ? '#2e1065' : '#f3e8ff' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              </div>
              <div style={{ ...styles.cardValue, color: '#7c3aed' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#c4b5fd' : '#5b21b6' }}>Awaiting review</div>
            </div>

            <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
              <div style={styles.cardHeader}>
                <span style={{ ...styles.cardLabel, color: dm ? '#67e8f9' : '#155e75' }}>EVENTS (24H)</span>
                <div style={{ ...styles.iconBadge, background: dm ? '#082f49' : '#cffafe' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <div style={{ ...styles.cardValue, color: '#06b6d4' }}>—</div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#06b6d4' }}>↑ —%</span>
              </div>
              <div style={{ fontSize: '13px', color: dm ? '#67e8f9' : '#155e75' }}>—% above baseline</div>
            </div>
          </div>

          {/* Live Security Alerts */}
          <div style={styles.chartCard}>
            <div style={styles.alertsHeader}>
              <div style={styles.alertsTitleRow}>
                <span style={styles.liveDotPulse} />
                <span style={styles.alertsTitle}>Live Security Alerts</span>
              </div>
              <button style={styles.viewAllBtn}>View All</button>
            </div>

            <div style={styles.alertList}>
              {ALERT_PLACEHOLDERS.map((_, i, arr) => (
                <div
                  key={i}
                  style={{
                    ...styles.alertRow,
                    borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none',
                  }}
                >
                  <div style={styles.alertLeft}>
                    <span style={{ ...styles.alertDot, background: i % 2 === 0 ? '#ef4444' : '#f97316' }} />
                    <div style={styles.alertLeft}>
                      <div>
                        <div style={styles.alertTitle}>— — — — — —</div>
                        <div style={styles.alertSource}>Source: —</div>
                      </div>
                    </div>
                  </div>
                  <div style={styles.alertRight}>
                    <span style={styles.alertTime}>—:—</span>
                    <span style={i % 2 === 0 ? styles.badgeCritical : styles.badgeHigh}>
                      {i % 2 === 0 ? 'critical' : 'high'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── FILE ACCESS ALERTS PAGE ── */}
        {activePage === 'file-access' && <>
          {/* 3 Stat Cards */}
          <div style={styles.cardGrid3}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={{ ...styles.cardLabel, color: dm ? '#64748b' : '#9ca3af' }}>FILES QUARANTINED</span>
              <div style={{ ...styles.cardValue, color: '#ef4444' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Today</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#2d1f0a' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fde68a'}` }}>
              <span style={{ ...styles.cardLabel, color: dm ? '#64748b' : '#9ca3af' }}>FLAGGED EVENTS</span>
              <div style={{ ...styles.cardValue, color: '#f97316' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Pending analyst review</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce7'}` }}>
              <span style={{ ...styles.cardLabel, color: dm ? '#64748b' : '#9ca3af' }}>CLAMAV SCANS</span>
              <div style={{ ...styles.cardValue, color: '#16a34a' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Today, — positive</div>
            </div>
          </div>

          {/* File Access Events Table */}
          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>FILE ACCESS EVENTS</span></div>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['TIME', 'FILE PATH', 'USER', 'ACTION', 'SEVERITY', 'STATUS'].map((col) => (
                    <th key={col} style={{ ...styles.th, fontWeight: '700', letterSpacing: '0.5px' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { action: 'READ',  statusStyle: 'badgeQuarantined', statusLabel: 'quarantined' },
                  { action: 'READ',  statusStyle: 'badgeFlagged',     statusLabel: 'flagged'     },
                  { action: 'COPY',  statusStyle: 'badgeFlagged',     statusLabel: 'flagged'     },
                  { action: 'READ',  statusStyle: 'badgeReviewed',    statusLabel: 'reviewed'    },
                  { action: 'LIST',  statusStyle: 'badgeAllowed',     statusLabel: 'allowed'     },
                ].map(({ action, statusStyle, statusLabel }, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td, fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>—:—:—</td>
                    <td style={{ ...styles.td, fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: '13px', color: dm ? '#f1f5f9' : '#111827' }}>—</td>
                    <td style={{ ...styles.td, color: dm ? '#94a3b8' : '#6b7280' }}>—</td>
                    <td style={styles.td}><span style={styles.badgeAction}>{action}</span></td>
                    <td style={{ ...styles.td, color: dm ? '#94a3b8' : '#6b7280' }}>—</td>
                    <td style={styles.td}><span style={styles[statusStyle]}>{statusLabel}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {/* ── LOGIN MONITOR PAGE ── */}
        {activePage === 'login-monitor' && <>
          <div style={styles.cardGrid4}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce7'}` }}>
              <span style={{ ...styles.cardLabel, color: '#0891b2' }}>LOGINS (24H)</span>
              <div style={{ ...styles.cardValue, color: '#16a34a' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Successful</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
              <span style={{ ...styles.cardLabel, color: '#0891b2' }}>FAILURES (24H)</span>
              <div style={{ ...styles.cardValue, color: '#ef4444' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>—% failure rate</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={{ ...styles.cardLabel, color: '#0891b2' }}>LOCKOUTS</span>
              <div style={{ ...styles.cardValue, color: '#f97316' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Accounts locked today</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
              <span style={{ ...styles.cardLabel, color: '#0891b2' }}>GEO ANOMALIES</span>
              <div style={{ ...styles.cardValue, color: '#f97316' }}>—</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Login from unusual regions</div>
            </div>
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>HOURLY LOGIN EVENTS</span></div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '28px', minWidth: '36px' }}>
                {[20, 15, 10, 5, 0].map((v) => (
                  <span key={v} style={{ fontSize: '12px', color: dm ? '#64748b' : '#0891b2' }}>{v}</span>
                ))}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, position: 'relative', height: '200px' }}>
                  <svg width="100%" height="100%" viewBox="0 0 800 200" preserveAspectRatio="none" style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}>
                    {[0, 50, 100, 150, 200].map((y) => (
                      <line key={y} x1="0" y1={y} x2="800" y2={y} stroke={dm ? '#334155' : '#e2e8f0'} strokeWidth="1" strokeDasharray="4,4" />
                    ))}
                    {[0,1,2,3,4,5,6,7,8,9,10,11].map((i) => (
                      <line key={i} x1={i * (800/11)} y1="0" x2={i * (800/11)} y2="200" stroke={dm ? '#334155' : '#e2e8f0'} strokeWidth="1" strokeDasharray="4,4" />
                    ))}
                  </svg>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', gap: '2px', padding: '0 4px' }}>
                    {['00','02','04','06','08','10','12','14','16','18','20','22'].map((h) => (
                      <div key={h} style={{ flex: 1, display: 'flex', gap: '2px', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{ width: '40%', background: '#ef4444', borderRadius: '2px 2px 0 0', height: '0px', minHeight: '0px' }} />
                        <div style={{ width: '40%', background: '#10b981', borderRadius: '2px 2px 0 0', height: '0px', minHeight: '0px' }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', paddingTop: '8px' }}>
                  {['00','02','04','06','08','10','12','14','16','18','20','22'].map((h) => (
                    <div key={h} style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: dm ? '#64748b' : '#6b7280' }}>{h}</div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '28px', marginTop: '16px' }}>
              {[{ color: '#ef4444', label: 'Failed' }, { color: '#10b981', label: 'Successful' }].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                  <span style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── THREAT INTELLIGENCE PAGE ── */}
        {activePage === 'threat-intel' && <>
          <div style={styles.cardGrid4}>
            {[
              { label: 'ACTIVE IOCs',       color: '#ef4444', tint: dm ? '#064e3b' : '#f0fdf4', border: dm ? '#065f46' : '#dcfce7', sub: 'Indicators of compromise' },
              { label: 'NEW CVEs (7D)',      color: '#f97316', tint: dm ? '#451a03' : '#fffbeb', border: dm ? '#78350f' : '#fef3c7', sub: 'Matching our stack' },
              { label: 'THREAT FEEDS',      color: '#06b6d4', tint: dm ? '#064e3b' : '#f0fdf4', border: dm ? '#065f46' : '#dcfce3', sub: 'Active integrations' },
              { label: 'BLOCKED IPs',       color: '#7c3aed', tint: dm ? '#083344' : '#ecfeff', border: dm ? '#164e63' : '#cffafe', sub: 'Auto-blocked today' },
            ].map(({ label, color, tint, border, sub }) => (
              <div key={label} style={{ ...styles.card, background: tint, border: `1px solid ${border}` }}>
                <span style={{ ...styles.cardLabel, color }}>{label}</span>
                <div style={{ ...styles.cardValue, color }}>—</div>
                <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={styles.chartCard}>
            <div style={styles.chartHeader}><span style={styles.chartTitle}>THREAT FEED — IOC LIST</span></div>
            <table style={styles.table}>
              <thead>
                <tr>{['Indicator', 'Type', 'Source', 'Confidence', 'Status'].map((col) => (
                  <th key={col} style={styles.th}>{col}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td, fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: '13px', color: dm ? '#f1f5f9' : '#111827' }}>—</td>
                    <td style={styles.td}>—</td>
                    <td style={styles.td}>—</td>
                    <td style={styles.td}>
                      <div style={{ ...styles.confBar }}>
                        <div style={{ ...styles.confFill, width: '0%', background: '#ef4444' }} />
                      </div>
                    </td>
                    <td style={styles.td}><span style={styles.badgeNeutral}>—</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {/* ── ATTACK STORYLINE PAGE ── */}
        {activePage === 'attack-storyline' && <>
          <div style={styles.cardGrid4}>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce7'}` }}>
              <span style={{ ...styles.cardLabel, color: '#0891b2' }}>OPEN STORYLINES</span>
              <div style={{ ...styles.cardValue, color: '#06b6d4' }}>{storylineData.totals?.open ?? 0}</div>
              <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>Active replay investigations</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
              <span style={{ ...styles.cardLabel, color: dm ? '#fca5a5' : '#9b1c1c' }}>CRITICAL CHAINS</span>
              <div style={{ ...styles.cardValue, color: '#ef4444' }}>{storylineData.totals?.critical ?? 0}</div>
              <div style={{ fontSize: '13px', color: dm ? '#fca5a5' : '#9b1c1c' }}>High-priority incident narratives</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
              <span style={{ ...styles.cardLabel, color: dm ? '#67e8f9' : '#155e75' }}>AUTO CONTAINMENT</span>
              <div style={{ ...styles.cardValue, color: '#06b6d4' }}>{storylineData.totals?.blocked_ips ?? 0}</div>
              <div style={{ fontSize: '13px', color: dm ? '#67e8f9' : '#155e75' }}>Firewall actions suggested</div>
            </div>
            <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
              <span style={{ ...styles.cardLabel, color: dm ? '#c4b5fd' : '#5b21b6' }}>AVG CONFIDENCE</span>
              <div style={{ ...styles.cardValue, color: '#7c3aed' }}>{Math.round((storylineData.totals?.avg_confidence ?? 0) * 100)}%</div>
              <div style={{ fontSize: '13px', color: dm ? '#c4b5fd' : '#5b21b6' }}>Agent confidence score</div>
            </div>
          </div>

          <div style={styles.chartCard}>
            <div style={styles.alertsHeader}>
              <div style={styles.alertsTitleRow}>
                <span style={styles.liveDotPulse} />
                <span style={styles.alertsTitle}>Attack Storyline Feed</span>
              </div>
              <button onClick={handleSimulateStoryline} style={styles.viewAllBtn} disabled={isSimulating}>
                {isSimulating ? 'Generating...' : 'Simulate Attack Storyline'}
              </button>
            </div>

            {storylineError && (
              <div style={{ marginBottom: '12px', background: dm ? '#3f0d18' : '#fff1f2', border: `1px solid ${dm ? '#7f1d1d' : '#fecdd3'}`, color: dm ? '#fecdd3' : '#be123c', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: '600' }}>
                {storylineError}
              </div>
            )}

            <div style={styles.alertList}>
              {(storylineData.storylines || []).map((item, i, arr) => (
                <div key={item.storyline_id} style={{ ...styles.alertRow, borderBottom: i < arr.length - 1 ? `1px solid ${dm ? '#1e293b' : '#f3f4f6'}` : 'none' }}>
                  <div style={styles.alertLeft}>
                    <span style={{ ...styles.alertDot, background: item.severity === 'critical' ? '#ef4444' : item.severity === 'high' ? '#f97316' : '#eab308' }} />
                    <div>
                      <div style={styles.alertTitle}>{item.title}</div>
                      <div style={styles.alertSource}>{item.storyline_id} • {item.mitre_tactic} • Source: {item.source_ip || 'unknown'}</div>
                    </div>
                  </div>
                  <div style={styles.alertRight}>
                    <span style={styles.alertTime}>{item.risk_delta ? `+${item.risk_delta} risk` : 'pending'}</span>
                    <span style={item.severity === 'critical' ? styles.badgeCritical : item.severity === 'high' ? styles.badgeHigh : styles.badgeNeutral}>
                      {item.severity}
                    </span>
                  </div>
                </div>
              ))}
              {(!storylineData.storylines || storylineData.storylines.length === 0) && (
                <div style={{ padding: '12px 0', color: dm ? '#94a3b8' : '#6b7280', fontSize: '13px' }}>
                  No storyline events yet. Simulate an attack to populate replay history.
                </div>
              )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: '800',
    color: dm ? '#f1f5f9' : '#111827',
    margin: '0 0 6px 0',
    letterSpacing: '-0.5px',
  },
  pageSubtitle: {
    fontSize: '16px',
    fontWeight: '400',
    color: dm ? '#94a3b8' : '#6b7280',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  liveDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#22c55e',
    flexShrink: 0,
    boxShadow: '0 0 6px #22c55e',
  },
  subtitleLink: {
    color: dm ? '#93c5fd' : '#1a237e',
    fontWeight: '500',
  },
  themeToggle: {
    background: dm ? '#1e293b' : '#f1f5f9',
    border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: dm ? '#f59e0b' : '#6b7280',
    padding: '6px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGrid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
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
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.7px',
    textTransform: 'uppercase',
  },
  iconBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  chartHeader: { marginBottom: '16px' },
  chartTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: dm ? '#64748b' : '#9ca3af',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
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
  alertList: { display: 'flex', flexDirection: 'column' },
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
  table: { width: '100%', borderCollapse: 'collapse' },
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
    borderBottom: `1px solid ${dm ? '#1e293b' : '#f3f4f6'}`,
  },
  confBar: {
    height: '6px',
    background: dm ? '#334155' : '#f3f4f6',
    borderRadius: '999px',
    overflow: 'hidden',
    width: '100px',
  },
  confFill: { height: '100%', borderRadius: '999px' },
  badgeCritical:    { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fca5a5', color: '#ef4444', background: 'transparent' },
  badgeHigh:        { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fcd34d', color: '#d97706', background: 'transparent' },
  badgeNeutral:     { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: `1px solid ${dm ? '#475569' : '#e5e7eb'}`, color: dm ? '#94a3b8' : '#6b7280', background: 'transparent' },
  badgeAction:      { display: 'inline-block', padding: '3px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #67e8f9', color: '#0891b2', background: 'transparent' },
  badgeQuarantined: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fca5a5', color: '#ef4444', background: 'transparent' },
  badgeFlagged:     { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fcd34d', color: '#d97706', background: 'transparent' },
  badgeReviewed:    { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fde68a', color: '#b45309', background: 'transparent' },
  badgeAllowed:     { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #6ee7b7', color: '#059669', background: 'transparent' },
})
