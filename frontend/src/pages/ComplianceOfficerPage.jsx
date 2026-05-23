import { useState, useCallback, useEffect } from 'react'

const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'COMPLIANCE OVERVIEW',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'gdpr',
    label: 'GDPR AI EVALUATION',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  {
    id: 'popia',
    label: 'POPIA AI EVALUATION',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'iso27001',
    label: 'ISO 27001 AI EVALUATION',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'findings',
    label: 'OPEN FINDINGS',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    id: 'policies',
    label: 'POLICY RULES',
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
]

const FRAMEWORKS = [
  { id: 'gdpr',     label: 'GDPR',      color: '#7c3aed', trackColor: '#ede9fe', hasCritical: true  },
  { id: 'popia',    label: 'POPIA',     color: '#16a34a', trackColor: '#dcfce7', hasCritical: false },
  { id: 'iso27001', label: 'ISO 27001', color: '#d97706', trackColor: '#fef3c7', hasCritical: true  },
]

const RISK_STYLE = {
  LOW:      { color: '#16a34a', bg: '#d1fae5', border: '#10b981' },
  MEDIUM:   { color: '#d97706', bg: '#fef3c7', border: '#f59e0b' },
  HIGH:     { color: '#dc2626', bg: '#fee2e2', border: '#ef4444' },
  CRITICAL: { color: '#7c3aed', bg: '#ede9fe', border: '#7c3aed' },
}

const WINDOW_OPTIONS = [
  { label: 'Today (current date)', value: 0   },
  { label: 'Last 24 hours',        value: 24  },
  { label: 'Last 48 hours',        value: 48  },
  { label: 'Last 7 days',          value: 168 },
]

export default function ComplianceOfficerPage({ onLogout, currentUser }) {
  const [activePage, setActivePage] = useState('overview')
  const [darkMode, setDarkMode] = useState(false)

  // GDPR evaluation state
  const [gdprReport, setGdprReport]         = useState(null)
  const [gdprLoading, setGdprLoading]       = useState(false)
  const [gdprError, setGdprError]           = useState('')
  const [gdprWindow, setGdprWindow]         = useState(0)
  const [gdprLlmStatus, setGdprLlmStatus]   = useState(null)
  const [gdprOverview, setGdprOverview]     = useState(null)
  const [gdprOverviewLoading, setGdprOverviewLoading] = useState(false)

  // POPIA evaluation state
  const [popiaReport, setPopiaReport]         = useState(null)
  const [popiaLoading, setPopiaLoading]       = useState(false)
  const [popiaError, setPopiaError]           = useState('')
  const [popiaWindow, setPopiaWindow]         = useState(0)
  const [popiaLlmStatus, setPopiaLlmStatus]   = useState(null)
  const [popiaOverview, setPopiaOverview]     = useState(null)
  const [popiaOverviewLoading, setPopiaOverviewLoading] = useState(false)

  // ISO 27001 evaluation state
  const [isoReport, setIsoReport]         = useState(null)
  const [isoLoading, setIsoLoading]       = useState(false)
  const [isoError, setIsoError]           = useState('')
  const [isoWindow, setIsoWindow]         = useState(0)
  const [isoLlmStatus, setIsoLlmStatus]   = useState(null)
  const [isoOverview, setIsoOverview]     = useState(null)
  const [isoOverviewLoading, setIsoOverviewLoading] = useState(false)

  const dm = darkMode
  const styles = makeStyles(dm)

  const todayHours = () => {
    const now = new Date()
    return Math.max(1, now.getHours() + Math.ceil(now.getMinutes() / 60))
  }

  // Returns the local ISO timestamp for the start of the selected window.
  // value 0 = "Today" → local midnight; otherwise → now minus N hours.
  // Sending the absolute timestamp means the backend never needs to guess timezone.
  const getSince = (windowValue) => {
    const now = new Date()
    if (windowValue === 0) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    }
    return new Date(now.getTime() - windowValue * 60 * 60 * 1000).toISOString()
  }

  const localMidnight = () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  }

  // Auto-fetch GDPR overview data for the current day on mount
  useEffect(() => {
    const fetchTodayGdpr = async () => {
      setGdprOverviewLoading(true)
      try {
        const res = await fetch(`/api/v1/gdpr/evaluate?since=${encodeURIComponent(localMidnight())}`, { method: 'POST' })
        if (res.ok) setGdprOverview(await res.json())
      } catch {}
      finally { setGdprOverviewLoading(false) }
    }
    fetchTodayGdpr()
  }, [])

  // Auto-fetch POPIA overview data for the current day on mount
  useEffect(() => {
    const fetchTodayPopia = async () => {
      setPopiaOverviewLoading(true)
      try {
        const res = await fetch(`/api/v1/popia/evaluate?since=${encodeURIComponent(localMidnight())}`, { method: 'POST' })
        if (res.ok) setPopiaOverview(await res.json())
      } catch {}
      finally { setPopiaOverviewLoading(false) }
    }
    fetchTodayPopia()
  }, [])

  const runGdprEvaluation = useCallback(async () => {
    setGdprLoading(true)
    setGdprError('')
    try {
      const res = await fetch(`/api/v1/gdpr/evaluate?since=${encodeURIComponent(getSince(gdprWindow))}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setGdprReport(data)
    } catch (err) {
      setGdprError(err.message || 'Evaluation failed')
    } finally {
      setGdprLoading(false)
    }
  }, [gdprWindow])

  const checkGdprStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/gdpr/status')
      if (res.ok) setGdprLlmStatus(await res.json())
    } catch {}
  }, [])

  const runPopiaEvaluation = useCallback(async () => {
    setPopiaLoading(true)
    setPopiaError('')
    try {
      const res = await fetch(`/api/v1/popia/evaluate?since=${encodeURIComponent(getSince(popiaWindow))}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setPopiaReport(data)
    } catch (err) {
      setPopiaError(err.message || 'Evaluation failed')
    } finally {
      setPopiaLoading(false)
    }
  }, [popiaWindow])

  const checkPopiaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/popia/status')
      if (res.ok) setPopiaLlmStatus(await res.json())
    } catch {}
  }, [])

  // Auto-fetch ISO 27001 overview data for the current day on mount
  useEffect(() => {
    const fetchTodayIso = async () => {
      setIsoOverviewLoading(true)
      try {
        const res = await fetch(`/api/v1/iso27001/evaluate?since=${encodeURIComponent(localMidnight())}`, { method: 'POST' })
        if (res.ok) setIsoOverview(await res.json())
      } catch {}
      finally { setIsoOverviewLoading(false) }
    }
    fetchTodayIso()
  }, [])

  const runIsoEvaluation = useCallback(async () => {
    setIsoLoading(true)
    setIsoError('')
    try {
      const res = await fetch(`/api/v1/iso27001/evaluate?since=${encodeURIComponent(getSince(isoWindow))}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setIsoReport(data)
    } catch (err) {
      setIsoError(err.message || 'Evaluation failed')
    } finally {
      setIsoLoading(false)
    }
  }, [isoWindow])

  const checkIsoStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/iso27001/status')
      if (res.ok) setIsoLlmStatus(await res.json())
    } catch {}
  }, [])

  return (
    <div style={styles.wrapper}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          {/* Brand */}
          <div style={styles.brandRow}>
            <div style={styles.brand}>
              <div style={styles.brandIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dm ? '#93c5fd' : '#1a237e'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span style={styles.brandName}>Compliance Hub</span>
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
                <span style={{ flex: 1 }}>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Profile */}
        <div style={styles.profile}>
          <div style={styles.profileInner}>
            <div style={styles.avatar}>
              <span style={styles.avatarText}>
                {currentUser ? `${(currentUser.first_name?.[0] || '').toUpperCase()}${(currentUser.surname?.[0] || '').toUpperCase()}` : 'CO'}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...styles.profileName, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser ? `${(currentUser.first_name?.[0] || '').toUpperCase()}. ${currentUser.surname}` : 'Compliance Officer'}
              </div>
              <div style={{ ...styles.profileRole, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser?.email || 'compliance@cut.ac.zw'}
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

      {/* ── Main ── */}
      <main style={styles.main}>
        {/* Header */}
        <div style={{ ...styles.card, background: dm ? '#1e293b' : 'white', border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <h1 style={{ ...styles.pageTitle, margin: '0 0 4px 0' }}>
              {activePage === 'overview'  ? 'Compliance Overview'
                : activePage === 'gdpr'      ? 'GDPR AI Evaluation'
                : activePage === 'popia'     ? 'POPIA AI Evaluation'
                : activePage === 'iso27001'  ? 'ISO 27001 AI Evaluation'
                : activePage === 'findings'  ? 'Open Compliance Findings'
                : 'Policy Rule Engine'}
            </h1>
            <p style={styles.pageSubtitle}>
              {activePage === 'overview'
                ? 'Monitor your compliance status across all frameworks'
                : activePage === 'gdpr'
                ? 'AI-powered GDPR compliance analysis of system activity logs using Ollama'
                : activePage === 'popia'
                ? 'AI-powered POPIA (Act 4 of 2013) compliance analysis of system activity logs using Ollama'
                : activePage === 'iso27001'
                ? 'AI-powered ISO/IEC 27001:2022 ISMS compliance analysis of system activity logs using Ollama'
                : activePage === 'findings'
                ? 'Remediation Tracker — Sorted by Due Date'
                : 'Machine-Executable Compliance Policies'}
            </p>
          </div>
          <div style={styles.headerRight}>
            <button onClick={() => setDarkMode(!dm)} style={styles.themeToggle} title={dm ? 'Light mode' : 'Dark mode'}>
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

        {/* ── COMPLIANCE OVERVIEW ── */}
        {activePage === 'overview' && <>
          {/* Framework Cards */}
          <div style={styles.frameworkGrid}>
            {FRAMEWORKS.map(({ id, label, color, trackColor, hasCritical }) => {
              const isGdpr    = id === 'gdpr'
              const isPopia   = id === 'popia'
              const isIso     = id === 'iso27001'
              const overviewData = isGdpr ? gdprOverview : isPopia ? popiaOverview : isIso ? isoOverview : null
              const loading = (isGdpr && gdprOverviewLoading) || (isPopia && popiaOverviewLoading) || (isIso && isoOverviewLoading)
              const score = overviewData ? overviewData.overall_score : null
              const findings = overviewData ? overviewData.findings ?? [] : null
              const openFindings = findings !== null ? findings.length : null
              const highCount = findings !== null ? findings.filter(f => f.risk_level === 'HIGH').length : null
              const criticalCount = findings !== null ? findings.filter(f => f.risk_level === 'CRITICAL').length : null

              return (
                <div key={id} style={styles.frameworkCard}>
                  <span style={styles.frameworkLabel}>{label}</span>
                  <div style={{ fontSize: '35px', fontWeight: '800', color, lineHeight: '1.1', margin: '8px 0' }}>
                    {loading ? '…' : score !== null ? `${score}%` : '—%'}
                  </div>
                  {/* Progress bar */}
                  <div style={{ ...styles.progressTrack, background: dm ? '#334155' : trackColor }}>
                    <div style={{ ...styles.progressBar, background: color, width: score !== null ? `${score}%` : '0%', transition: 'width 0.8s ease' }} />
                  </div>
                  <div style={styles.frameworkFooter}>
                    <span style={styles.findingsText}>
                      {loading ? '…' : openFindings !== null ? `${openFindings} open finding${openFindings !== 1 ? 's' : ''}` : '— open findings'}
                    </span>
                    {hasCritical && (
                      <span style={styles.criticalBadge}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span style={{ color: '#ef4444', fontWeight: '600', fontSize: '13px' }}>
                          {loading ? '…' : `${highCount} high, ${criticalCount} critical`}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Control Domain Adherence Radar */}
          <div style={styles.chartCard}>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', marginBottom: '4px' }}>
                Control Domain Adherence — All Frameworks
              </div>
              <div style={{ fontSize: '13px', color: dm ? '#64748b' : '#0891b2' }}>
                Comprehensive view of compliance across all control domains
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="100%" viewBox="0 0 620 500" style={{ maxWidth: '620px' }}>
                {/* Grid hexagons at 20%, 40%, 60%, 80%, 100% */}
                {[
                  { r: 30,  pts: '300,230 326,245 326,275 300,290 274,275 274,245' },
                  { r: 60,  pts: '300,200 352,230 352,290 300,320 248,290 248,230' },
                  { r: 90,  pts: '300,170 378,215 378,305 300,350 222,305 222,215' },
                  { r: 120, pts: '300,140 404,200 404,320 300,380 196,320 196,200' },
                  { r: 150, pts: '300,110 430,185 430,335 300,410 170,335 170,185' },
                ].map(({ r, pts }) => (
                  <polygon key={r} points={pts} fill={dm ? 'rgba(51,65,85,0.3)' : 'rgba(243,244,246,0.6)'}
                    stroke={dm ? '#334155' : '#d1d5db'} strokeWidth="1" />
                ))}

                {/* Axis lines */}
                {[
                  [300,260, 300,110],
                  [300,260, 430,185],
                  [300,260, 430,335],
                  [300,260, 300,410],
                  [300,260, 170,335],
                  [300,260, 170,185],
                ].map(([x1,y1,x2,y2], i) => (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={dm ? '#475569' : '#d1d5db'} strokeWidth="1" />
                ))}

                {/* Grid level labels */}
                {[
                  { v:20,  x:304, y:234 },
                  { v:40,  x:304, y:204 },
                  { v:60,  x:304, y:174 },
                  { v:80,  x:304, y:144 },
                  { v:100, x:304, y:114 },
                ].map(({ v, x, y }) => (
                  <text key={v} x={x} y={y} fontSize="10" fill={dm ? '#64748b' : '#9ca3af'} textAnchor="start">{v}</text>
                ))}

                {/* Data series — all zeros (dot at center) ready for real data */}
                {/* GDPR — purple */}
                <polygon points="300,260 300,260 300,260 300,260 300,260 300,260"
                  fill="rgba(124,58,237,0.15)" stroke="#7c3aed" strokeWidth="2" />
                {/* POPIA — green */}
                <polygon points="300,260 300,260 300,260 300,260 300,260 300,260"
                  fill="rgba(22,163,74,0.15)" stroke="#16a34a" strokeWidth="2" />
                {/* ISO 27001 — amber */}
                <polygon points="300,260 300,260 300,260 300,260 300,260 300,260"
                  fill="rgba(217,119,6,0.15)" stroke="#d97706" strokeWidth="2" />

                {/* Axis labels */}
                <text x="300" y="96"  fontSize="12" fill={dm ? '#94a3b8' : '#6b7280'} textAnchor="middle">Access Control</text>
                <text x="448" y="178" fontSize="12" fill={dm ? '#94a3b8' : '#6b7280'} textAnchor="start">Encryption</text>
                <text x="448" y="348" fontSize="12" fill={dm ? '#94a3b8' : '#6b7280'} textAnchor="start">Incident Response</text>
                <text x="300" y="430" fontSize="12" fill={dm ? '#94a3b8' : '#6b7280'} textAnchor="middle">Data Retention</text>
                <text x="152" y="348" fontSize="12" fill={dm ? '#94a3b8' : '#6b7280'} textAnchor="end">Audit Logging</text>
                <text x="152" y="178" fontSize="12" fill={dm ? '#94a3b8' : '#6b7280'} textAnchor="end">Risk Assessment</text>
              </svg>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '28px', marginTop: '4px', paddingTop: '12px', borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}` }}>
              {[{ color: '#7c3aed', label: 'GDPR' }, { color: '#16a34a', label: 'POPIA' }, { color: '#d97706', label: 'ISO 27001' }].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: dm ? '#94a3b8' : '#374151' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── GDPR AI EVALUATION ── */}
        {activePage === 'gdpr' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Controls bar */}
            <div style={{ ...styles.chartCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: dm ? '#94a3b8' : '#6b7280', letterSpacing: '0.5px' }}>WINDOW</span>
                  <select
                    value={gdprWindow}
                    onChange={e => setGdprWindow(Number(e.target.value))}
                    style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: dm ? '#0f172a' : '#f9fafb', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                  >
                    {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* LLM status chip */}
                {gdprLlmStatus && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: gdprLlmStatus.llm_available ? '#d1fae5' : '#fef3c7', color: gdprLlmStatus.llm_available ? '#065f46' : '#92400e', border: `1px solid ${gdprLlmStatus.llm_available ? '#10b981' : '#f59e0b'}` }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: gdprLlmStatus.llm_available ? '#16a34a' : '#f59e0b', display: 'inline-block' }} />
                    {gdprLlmStatus.llm_available ? `Ollama · ${gdprLlmStatus.model}` : 'Rule-based fallback'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={checkGdprStatus}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: 'transparent', color: dm ? '#94a3b8' : '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Check AI Status
                </button>
                <button
                  onClick={runGdprEvaluation}
                  disabled={gdprLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 22px', borderRadius: '8px', border: 'none', background: gdprLoading ? '#94a3b8' : '#7c3aed', color: 'white', fontSize: '13px', fontWeight: '700', cursor: gdprLoading ? 'not-allowed' : 'pointer' }}
                >
                  {gdprLoading ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Evaluating…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                      </svg>
                      Run GDPR Evaluation
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {gdprError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '16px 20px', fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>
                Evaluation failed: {gdprError}
              </div>
            )}

            {/* Loading placeholder */}
            {gdprLoading && (
              <div style={{ ...styles.chartCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px 24px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.2s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <div style={{ fontSize: '15px', fontWeight: '600', color: dm ? '#94a3b8' : '#6b7280' }}>AI is analysing system logs against GDPR…</div>
                <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>This may take 15–60 seconds depending on the Ollama model</div>
              </div>
            )}

            {/* Report */}
            {gdprReport && !gdprLoading && (() => {
              const rs = RISK_STYLE[gdprReport.risk_level] || RISK_STYLE.MEDIUM
              const scoreColor = gdprReport.overall_score >= 80 ? '#16a34a' : gdprReport.overall_score >= 60 ? '#d97706' : '#dc2626'
              return (
                <>
                  {/* Score + summary card */}
                  <div style={{ ...styles.chartCard, display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Circular score */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke={dm ? '#334155' : '#f3f4f6'} strokeWidth="10" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke={scoreColor} strokeWidth="10"
                          strokeDasharray={`${(gdprReport.overall_score / 100) * 314} 314`}
                          strokeLinecap="round"
                          transform="rotate(-90 60 60)"
                          style={{ transition: 'stroke-dasharray 0.8s ease' }}
                        />
                        <text x="60" y="56" textAnchor="middle" fontSize="26" fontWeight="800" fill={scoreColor}>{gdprReport.overall_score}</text>
                        <text x="60" y="74" textAnchor="middle" fontSize="11" fill={dm ? '#94a3b8' : '#6b7280'}>/ 100</text>
                      </svg>
                      <span style={{ padding: '4px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>
                        {gdprReport.risk_level} RISK
                      </span>
                    </div>

                    {/* Summary info */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '8px' }}>EXECUTIVE SUMMARY</div>
                      <p style={{ fontSize: '14px', color: dm ? '#cbd5e1' : '#374151', lineHeight: '1.7', margin: '0 0 16px' }}>{gdprReport.summary}</p>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Events Analysed', value: gdprReport.events_analyzed },
                          { label: 'Window', value: `${gdprReport.log_window_hours}h` },
                          { label: 'Findings', value: gdprReport.findings?.length ?? 0 },
                          { label: 'Model', value: gdprReport.model_used },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div style={{ fontSize: '11px', color: dm ? '#64748b' : '#9ca3af', fontWeight: '600', letterSpacing: '0.4px', marginBottom: '2px' }}>{label}</div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '12px', fontSize: '11px', color: dm ? '#475569' : '#9ca3af' }}>
                        Evaluated: {new Date(gdprReport.evaluated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Findings list */}
                  {gdprReport.findings && gdprReport.findings.length > 0 && (
                    <div style={styles.chartCard}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '16px' }}>
                        GDPR FINDINGS — {gdprReport.findings.length} ARTICLE(S) ASSESSED
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {gdprReport.findings.map((f, i) => {
                          const fs = RISK_STYLE[f.risk_level] || RISK_STYLE.MEDIUM
                          return (
                            <div key={i} style={{ background: dm ? '#0f172a' : '#f8fafc', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderLeft: `4px solid ${fs.border}`, borderRadius: '10px', padding: '16px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800', background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd', letterSpacing: '0.4px' }}>
                                  {f.article}
                                </span>
                                <span style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{f.title}</span>
                                <span style={{ marginLeft: 'auto', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: fs.bg, color: fs.color, border: `1px solid ${fs.border}` }}>
                                  {f.risk_level}
                                </span>
                              </div>
                              <p style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#4b5563', margin: '0 0 8px', lineHeight: '1.6' }}>
                                <strong style={{ color: dm ? '#cbd5e1' : '#111827' }}>Observation: </strong>{f.observation}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: dm ? '#1e293b' : '#fff', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '8px', padding: '10px 14px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                                  <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                                <p style={{ fontSize: '13px', color: dm ? '#a78bfa' : '#5b21b6', margin: 0, lineHeight: '1.6' }}>
                                  <strong>Recommendation: </strong>{f.recommendation}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Empty state */}
            {!gdprReport && !gdprLoading && !gdprError && (
              <div style={{ ...styles.chartCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '60px 24px', textAlign: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={dm ? '#475569' : '#d1d5db'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                </svg>
                <div style={{ fontSize: '16px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af' }}>No evaluation run yet</div>
                <div style={{ fontSize: '13px', color: dm ? '#475569' : '#d1d5db', maxWidth: '380px' }}>
                  Click <strong>Run GDPR Evaluation</strong> to analyse your system activity logs against GDPR Articles 5, 17, 25, 32, and 33 using the Ollama AI model.
                </div>
              </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── POPIA AI EVALUATION ── */}
        {activePage === 'popia' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Controls bar */}
            <div style={{ ...styles.chartCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: dm ? '#94a3b8' : '#6b7280', letterSpacing: '0.5px' }}>WINDOW</span>
                  <select
                    value={popiaWindow}
                    onChange={e => setPopiaWindow(Number(e.target.value))}
                    style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: dm ? '#0f172a' : '#f9fafb', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                  >
                    {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* LLM status chip */}
                {popiaLlmStatus && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: popiaLlmStatus.llm_available ? '#d1fae5' : '#fef3c7', color: popiaLlmStatus.llm_available ? '#065f46' : '#92400e', border: `1px solid ${popiaLlmStatus.llm_available ? '#10b981' : '#f59e0b'}` }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: popiaLlmStatus.llm_available ? '#16a34a' : '#f59e0b', display: 'inline-block' }} />
                    {popiaLlmStatus.llm_available ? `Ollama · ${popiaLlmStatus.model}` : 'Rule-based fallback'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={checkPopiaStatus}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: 'transparent', color: dm ? '#94a3b8' : '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Check AI Status
                </button>
                <button
                  onClick={runPopiaEvaluation}
                  disabled={popiaLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 22px', borderRadius: '8px', border: 'none', background: popiaLoading ? '#94a3b8' : '#16a34a', color: 'white', fontSize: '13px', fontWeight: '700', cursor: popiaLoading ? 'not-allowed' : 'pointer' }}
                >
                  {popiaLoading ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Evaluating…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      Run POPIA Evaluation
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {popiaError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '16px 20px', fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>
                Evaluation failed: {popiaError}
              </div>
            )}

            {/* Loading placeholder */}
            {popiaLoading && (
              <div style={{ ...styles.chartCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px 24px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.2s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <div style={{ fontSize: '15px', fontWeight: '600', color: dm ? '#94a3b8' : '#6b7280' }}>AI is analysing system logs against POPIA…</div>
                <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>This may take 15–60 seconds depending on the Ollama model</div>
              </div>
            )}

            {/* Report */}
            {popiaReport && !popiaLoading && (() => {
              const rs = RISK_STYLE[popiaReport.risk_level] || RISK_STYLE.MEDIUM
              const scoreColor = popiaReport.overall_score >= 80 ? '#16a34a' : popiaReport.overall_score >= 60 ? '#d97706' : '#dc2626'
              return (
                <>
                  {/* Score + summary card */}
                  <div style={{ ...styles.chartCard, display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Circular score */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke={dm ? '#334155' : '#f3f4f6'} strokeWidth="10" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke={scoreColor} strokeWidth="10"
                          strokeDasharray={`${(popiaReport.overall_score / 100) * 314} 314`}
                          strokeLinecap="round"
                          transform="rotate(-90 60 60)"
                          style={{ transition: 'stroke-dasharray 0.8s ease' }}
                        />
                        <text x="60" y="56" textAnchor="middle" fontSize="26" fontWeight="800" fill={scoreColor}>{popiaReport.overall_score}</text>
                        <text x="60" y="74" textAnchor="middle" fontSize="11" fill={dm ? '#94a3b8' : '#6b7280'}>/ 100</text>
                      </svg>
                      <span style={{ padding: '4px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>
                        {popiaReport.risk_level} RISK
                      </span>
                    </div>

                    {/* Summary info */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '8px' }}>EXECUTIVE SUMMARY</div>
                      <p style={{ fontSize: '14px', color: dm ? '#cbd5e1' : '#374151', lineHeight: '1.7', margin: '0 0 16px' }}>{popiaReport.summary}</p>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Events Analysed', value: popiaReport.events_analyzed },
                          { label: 'Window', value: `${popiaReport.log_window_hours}h` },
                          { label: 'Findings', value: popiaReport.findings?.length ?? 0 },
                          { label: 'Model', value: popiaReport.model_used },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div style={{ fontSize: '11px', color: dm ? '#64748b' : '#9ca3af', fontWeight: '600', letterSpacing: '0.4px', marginBottom: '2px' }}>{label}</div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '12px', fontSize: '11px', color: dm ? '#475569' : '#9ca3af' }}>
                        Evaluated: {new Date(popiaReport.evaluated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Findings list */}
                  {popiaReport.findings && popiaReport.findings.length > 0 && (
                    <div style={styles.chartCard}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '16px' }}>
                        POPIA FINDINGS — {popiaReport.findings.length} CONDITION(S) ASSESSED
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {popiaReport.findings.map((f, i) => {
                          const fs = RISK_STYLE[f.risk_level] || RISK_STYLE.MEDIUM
                          return (
                            <div key={i} style={{ background: dm ? '#0f172a' : '#f8fafc', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderLeft: `4px solid ${fs.border}`, borderRadius: '10px', padding: '16px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800', background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0', letterSpacing: '0.4px' }}>
                                  {f.condition}
                                </span>
                                <span style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{f.title}</span>
                                <span style={{ marginLeft: 'auto', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: fs.bg, color: fs.color, border: `1px solid ${fs.border}` }}>
                                  {f.risk_level}
                                </span>
                              </div>
                              <p style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#4b5563', margin: '0 0 8px', lineHeight: '1.6' }}>
                                <strong style={{ color: dm ? '#cbd5e1' : '#111827' }}>Observation: </strong>{f.observation}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: dm ? '#1e293b' : '#fff', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '8px', padding: '10px 14px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                                  <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                                <p style={{ fontSize: '13px', color: dm ? '#4ade80' : '#166534', margin: 0, lineHeight: '1.6' }}>
                                  <strong>Recommendation: </strong>{f.recommendation}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Empty state */}
            {!popiaReport && !popiaLoading && !popiaError && (
              <div style={{ ...styles.chartCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '60px 24px', textAlign: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={dm ? '#475569' : '#d1d5db'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <div style={{ fontSize: '16px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af' }}>No evaluation run yet</div>
                <div style={{ fontSize: '13px', color: dm ? '#475569' : '#d1d5db', maxWidth: '400px' }}>
                  Click <strong>Run POPIA Evaluation</strong> to analyse your system activity logs against POPIA Act 4 of 2013 — Conditions 1, 2, 3, 7, and 8 — using the Ollama AI model.
                </div>
              </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── ISO 27001 AI EVALUATION ── */}
        {activePage === 'iso27001' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Controls bar */}
            <div style={{ ...styles.chartCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: dm ? '#94a3b8' : '#6b7280', letterSpacing: '0.5px' }}>WINDOW</span>
                  <select
                    value={isoWindow}
                    onChange={e => setIsoWindow(Number(e.target.value))}
                    style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: dm ? '#0f172a' : '#f9fafb', color: dm ? '#f1f5f9' : '#111827', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                  >
                    {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* LLM status chip */}
                {isoLlmStatus && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: isoLlmStatus.llm_available ? '#d1fae5' : '#fef3c7', color: isoLlmStatus.llm_available ? '#065f46' : '#92400e', border: `1px solid ${isoLlmStatus.llm_available ? '#10b981' : '#f59e0b'}` }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isoLlmStatus.llm_available ? '#16a34a' : '#f59e0b', display: 'inline-block' }} />
                    {isoLlmStatus.llm_available ? `Ollama · ${isoLlmStatus.model}` : 'Rule-based fallback'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={checkIsoStatus}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, background: 'transparent', color: dm ? '#94a3b8' : '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Check AI Status
                </button>
                <button
                  onClick={runIsoEvaluation}
                  disabled={isoLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 22px', borderRadius: '8px', border: 'none', background: isoLoading ? '#94a3b8' : '#d97706', color: 'white', fontSize: '13px', fontWeight: '700', cursor: isoLoading ? 'not-allowed' : 'pointer' }}
                >
                  {isoLoading ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Evaluating…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      Run ISO 27001 Evaluation
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {isoError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '16px 20px', fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>
                Evaluation failed: {isoError}
              </div>
            )}

            {/* Loading placeholder */}
            {isoLoading && (
              <div style={{ ...styles.chartCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px 24px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.2s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <div style={{ fontSize: '15px', fontWeight: '600', color: dm ? '#94a3b8' : '#6b7280' }}>AI is analysing system logs against ISO 27001 Annex A…</div>
                <div style={{ fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>This may take 15–60 seconds depending on the Ollama model</div>
              </div>
            )}

            {/* Report */}
            {isoReport && !isoLoading && (() => {
              const rs = RISK_STYLE[isoReport.risk_level] || RISK_STYLE.MEDIUM
              const scoreColor = isoReport.overall_score >= 80 ? '#16a34a' : isoReport.overall_score >= 60 ? '#d97706' : '#dc2626'
              return (
                <>
                  {/* Score + summary card */}
                  <div style={{ ...styles.chartCard, display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Circular score */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke={dm ? '#334155' : '#f3f4f6'} strokeWidth="10" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke={scoreColor} strokeWidth="10"
                          strokeDasharray={`${(isoReport.overall_score / 100) * 314} 314`}
                          strokeLinecap="round"
                          transform="rotate(-90 60 60)"
                          style={{ transition: 'stroke-dasharray 0.8s ease' }}
                        />
                        <text x="60" y="56" textAnchor="middle" fontSize="26" fontWeight="800" fill={scoreColor}>{isoReport.overall_score}</text>
                        <text x="60" y="74" textAnchor="middle" fontSize="11" fill={dm ? '#94a3b8' : '#6b7280'}>/ 100</text>
                      </svg>
                      <span style={{ padding: '4px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>
                        {isoReport.risk_level} RISK
                      </span>
                    </div>

                    {/* Summary info */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '8px' }}>EXECUTIVE SUMMARY</div>
                      <p style={{ fontSize: '14px', color: dm ? '#cbd5e1' : '#374151', lineHeight: '1.7', margin: '0 0 16px' }}>{isoReport.summary}</p>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        {[
                          { label: 'Events Analysed', value: isoReport.events_analyzed },
                          { label: 'Window', value: `${isoReport.log_window_hours}h` },
                          { label: 'Findings', value: isoReport.findings?.length ?? 0 },
                          { label: 'Model', value: isoReport.model_used },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div style={{ fontSize: '11px', color: dm ? '#64748b' : '#9ca3af', fontWeight: '600', letterSpacing: '0.4px', marginBottom: '2px' }}>{label}</div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '12px', fontSize: '11px', color: dm ? '#475569' : '#9ca3af' }}>
                        Evaluated: {new Date(isoReport.evaluated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Findings list */}
                  {isoReport.findings && isoReport.findings.length > 0 && (
                    <div style={styles.chartCard}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '16px' }}>
                        ISO 27001 FINDINGS — {isoReport.findings.length} CONTROL(S) ASSESSED
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {isoReport.findings.map((f, i) => {
                          const fs = RISK_STYLE[f.risk_level] || RISK_STYLE.MEDIUM
                          return (
                            <div key={i} style={{ background: dm ? '#0f172a' : '#f8fafc', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderLeft: `4px solid ${fs.border}`, borderRadius: '10px', padding: '16px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '800', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a', letterSpacing: '0.4px' }}>
                                  {f.control}
                                </span>
                                <span style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827' }}>{f.title}</span>
                                <span style={{ marginLeft: 'auto', padding: '3px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: fs.bg, color: fs.color, border: `1px solid ${fs.border}` }}>
                                  {f.risk_level}
                                </span>
                              </div>
                              <p style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#4b5563', margin: '0 0 8px', lineHeight: '1.6' }}>
                                <strong style={{ color: dm ? '#cbd5e1' : '#111827' }}>Observation: </strong>{f.observation}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: dm ? '#1e293b' : '#fff', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '8px', padding: '10px 14px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                                  <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                                <p style={{ fontSize: '13px', color: dm ? '#fbbf24' : '#92400e', margin: 0, lineHeight: '1.6' }}>
                                  <strong>Recommendation: </strong>{f.recommendation}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Empty state */}
            {!isoReport && !isoLoading && !isoError && (
              <div style={{ ...styles.chartCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '60px 24px', textAlign: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={dm ? '#475569' : '#d1d5db'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <div style={{ fontSize: '16px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af' }}>No evaluation run yet</div>
                <div style={{ fontSize: '13px', color: dm ? '#475569' : '#d1d5db', maxWidth: '420px' }}>
                  Click <strong>Run ISO 27001 Evaluation</strong> to analyse your system activity logs against ISO/IEC 27001:2022 Annex A controls — A.9 Access Control, A.12.4 Logging, A.16 Incident Management, and more — using the Ollama AI model.
                </div>
              </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── OPEN FINDINGS ── */}
        {activePage === 'findings' && (
          <div style={styles.chartCard}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '4px' }}>
              — ACTIVE FINDINGS
            </div>
            <div style={{ padding: '24px 0', color: dm ? '#94a3b8' : '#6b7280', fontSize: '14px' }}>
              No findings to display. Finding data will appear here once the system is operational.
            </div>
          </div>
        )}

        {/* ── POLICY RULES ── */}
        {activePage === 'policies' && (
          <div style={styles.chartCard}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: dm ? '#64748b' : '#9ca3af', letterSpacing: '0.8px', marginBottom: '16px' }}>
              ACTIVE POLICY RULES
            </div>
            <div style={{ padding: '24px 0', color: dm ? '#94a3b8' : '#6b7280', fontSize: '14px' }}>
              No policy rules to display. Policy data will appear here once the system is operational.
            </div>
          </div>
        )}

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
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  brandIcon: {
    width: '36px',
    height: '36px',
    background: dm ? '#1e3a5f' : '#eff6ff',
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
  },
  menuBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: dm ? '#64748b' : '#9ca3af',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
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
    background: 'linear-gradient(135deg, #1a237e, #7c3aed)',
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
  frameworkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px',
  },
  frameworkCard: {
    background: dm ? '#1e293b' : 'white',
    borderRadius: '20px',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    boxShadow: dm ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
    border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
  },
  frameworkLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: dm ? '#94a3b8' : '#6b7280',
    letterSpacing: '0.3px',
  },
  progressTrack: {
    height: '8px',
    borderRadius: '999px',
    overflow: 'hidden',
    margin: '12px 0 16px',
  },
  progressBar: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 0.4s ease',
  },
  frameworkFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  findingsText: {
    fontSize: '13px',
    color: dm ? '#94a3b8' : '#6b7280',
  },
  criticalBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    background: dm ? '#2d1a1a' : '#fff5f5',
    border: '1px solid #fecaca',
    borderRadius: '999px',
    padding: '3px 10px',
  },
  cardGrid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
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
  cardLabel: {
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  chartCard: {
    background: dm ? '#1e293b' : 'white',
    borderRadius: '16px',
    padding: '20px 24px 16px',
    boxShadow: dm ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.05)',
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
    borderBottom: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
  },
  scoreNeutral: {
    display: 'inline-block', padding: '3px 12px', borderRadius: '999px',
    fontSize: '13px', fontWeight: '600',
    border: `1px solid ${dm ? '#475569' : '#e5e7eb'}`,
    color: dm ? '#94a3b8' : '#374151', background: 'transparent',
  },
  badgeCritical: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fca5a5', color: '#ef4444', background: 'transparent' },
  badgeHigh:     { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fcd34d', color: '#d97706', background: 'transparent' },
  badgeMedium:   { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #fde68a', color: '#d97706', background: 'transparent' },
  badgePassing:  { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid #6ee7b7', color: '#059669', background: 'transparent' },
  badgeNeutral:  { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: `1px solid ${dm ? '#475569' : '#e5e7eb'}`, color: dm ? '#94a3b8' : '#6b7280', background: 'transparent' },
  findingCritical: { display: 'inline-block', padding: '4px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: '1px solid #fca5a5', color: '#ef4444', background: dm ? 'transparent' : '#fff5f5' },
  findingHigh:     { display: 'inline-block', padding: '4px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: '1px solid #fcd34d', color: '#d97706', background: dm ? 'transparent' : '#fffbeb' },
  findingMedium:   { display: 'inline-block', padding: '4px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: '1px solid #fde68a', color: '#b45309', background: dm ? 'transparent' : '#fefce8' },
  fwGdpr:       { display: 'inline-block', padding: '3px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', background: dm ? '#2e1065' : '#f3e8ff', color: '#7c3aed', border: '1px solid #e9d5ff' },
  fwPopia:      { display: 'inline-block', padding: '3px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', background: dm ? '#052e16' : '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' },
  fwIso:        { display: 'inline-block', padding: '3px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', background: dm ? '#451a03' : '#fef3c7', color: '#d97706', border: '1px solid #fde68a' },
  policyActive: { display: 'inline-block', padding: '4px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500', background: dm ? '#052e16' : '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' },
  policyReview: { display: 'inline-block', padding: '4px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '500', background: dm ? '#2d1a1a' : '#fff5f5', color: '#ef4444', border: '1px solid #fecaca' },
})
