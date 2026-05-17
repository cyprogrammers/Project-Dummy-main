import { useState } from 'react'

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
  { id: 'gdpr',    label: 'GDPR',     color: '#7c3aed', trackColor: '#ede9fe', hasCritical: true  },
  { id: 'popia',   label: 'POPIA',    color: '#16a34a', trackColor: '#dcfce7', hasCritical: false },
  { id: 'iso',     label: 'ISO 27001', color: '#d97706', trackColor: '#fef3c7', hasCritical: true  },
]

export default function ComplianceOfficerPage({ onLogout }) {
  const [activePage, setActivePage] = useState('overview')
  const [darkMode, setDarkMode] = useState(false)
  const dm = darkMode
  const styles = makeStyles(dm)

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
              <span style={styles.avatarText}>CO</span>
            </div>
            <div>
              <div style={styles.profileName}>Compliance Officer</div>
              <div style={styles.profileRole}>compliance@cut.ac.zw</div>
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
        {/* Header */}
        <div style={{ ...styles.card, background: dm ? '#1e293b' : 'white', border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <h1 style={{ ...styles.pageTitle, margin: '0 0 4px 0' }}>
              {activePage === 'overview' ? 'Compliance Overview'
                : activePage === 'findings' ? 'Open Compliance Findings'
                : 'Policy Rule Engine'}
            </h1>
            <p style={styles.pageSubtitle}>
              {activePage === 'overview'
                ? 'Monitor your compliance status across all frameworks'
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
            {FRAMEWORKS.map(({ id, label, color, trackColor, hasCritical }) => (
              <div key={id} style={styles.frameworkCard}>
                <span style={styles.frameworkLabel}>{label}</span>
                <div style={{ fontSize: '35px', fontWeight: '800', color, lineHeight: '1.1', margin: '8px 0' }}>—%</div>
                {/* Progress bar */}
                <div style={{ ...styles.progressTrack, background: dm ? '#334155' : trackColor }}>
                  <div style={{ ...styles.progressBar, background: color, width: '0%' }} />
                </div>
                <div style={styles.frameworkFooter}>
                  <span style={styles.findingsText}>— open findings</span>
                  {hasCritical && (
                    <span style={styles.criticalBadge}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span style={{ color: '#ef4444', fontWeight: '600', fontSize: '13px' }}>— critical</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
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
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: dm ? '#64748b' : '#9ca3af',
    padding: '6px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
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
