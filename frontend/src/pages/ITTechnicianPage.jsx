import React, { useState } from 'react';

const NAV_ITEMS = [
  { id: 'operational-status', label: 'Operational Status' },
  { id: 'assigned-incidents', label: 'Assigned Incidents' },
  { id: 'maintenance', label: 'Maintenance' },
];

const PAGE_HEADERS = {
  'operational-status': {
    title: 'Operational Status',
    subtitle: 'Service Health Monitoring — Operational Insight',
  },
  'assigned-incidents': {
    title: 'Assigned Incidents',
    subtitle: 'Incident Response Support — Operational Scope',
  },
  maintenance: {
    title: 'Maintenance',
    subtitle: 'Scheduled Maintenance Tasks',
  },
};

export default function ITTechnicianPage({ onLogout }) {
  const [activePage, setActivePage] = useState('operational-status');
  const [darkMode, setDarkMode] = useState(false);
  const dm = darkMode;
  const styles = makeStyles(dm);

  return (
    <div style={styles.wrapper}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.brand}>
            <div>
              <div style={styles.brandName}>IT Technician</div>
              <div style={styles.brandSub}>Service Health Monitoring</div>
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
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Profile */}
        <div style={styles.profile}>
          <div style={styles.profileInner}>
            <div style={styles.avatar}>
              <span style={styles.avatarText}>IT</span>
            </div>
            <div>
              <div style={styles.profileName}>IT Technician</div>
              <div style={styles.profileRole}>tech@secureops.io</div>
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
            <h1 style={{ ...styles.pageTitle, margin: '0 0 4px 0' }}>{PAGE_HEADERS[activePage].title}</h1>
            <p style={styles.pageSubtitle}>{PAGE_HEADERS[activePage].subtitle}</p>
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

        {activePage === 'operational-status' && (
          <>
            <div style={styles.cardGrid4}>
              {/* Services Online Card */}
              <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
                <span style={{ ...styles.cardLabel, color: dm ? '#9ca3af' : '#4b5563' }}>SERVICES ONLINE</span>
                <div style={{ ...styles.cardValue, color: '#10b981' }}>—</div>
                <div style={{ fontSize: '13px', color: dm ? '#9ca3af' : '#6b7280' }}>— scanning</div>
              </div>

              {/* Assigned Tickets Card */}
              <div style={{ ...styles.card, background: dm ? '#451a03' : '#fffbeb', border: `1px solid ${dm ? '#78350f' : '#fef3c7'}` }}>
                <span style={{ ...styles.cardLabel, color: dm ? '#9ca3af' : '#4b5563' }}>ASSIGNED TICKETS</span>
                <div style={{ ...styles.cardValue, color: '#f59e0b' }}>—</div>
                <div style={{ fontSize: '13px', color: dm ? '#9ca3af' : '#6b7280' }}>— backup failure</div>
              </div>

              {/* System Uptime Card */}
              <div style={{ ...styles.card, background: dm ? '#064e3b' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#dcfce3'}` }}>
                <span style={{ ...styles.cardLabel, color: dm ? '#9ca3af' : '#4b5563' }}>SYSTEM UPTIME</span>
                <div style={{ ...styles.cardValue, color: '#10b981' }}>—</div>
                <div style={{ fontSize: '13px', color: dm ? '#9ca3af' : '#6b7280' }}>— average</div>
              </div>

              {/* Pending Tasks Card */}
              <div style={{ ...styles.card, background: dm ? '#083344' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}` }}>
                <span style={{ ...styles.cardLabel, color: dm ? '#9ca3af' : '#4b5563' }}>PENDING TASKS</span>
                <div style={{ ...styles.cardValue, color: '#06b6d4' }}>—</div>
                <div style={{ fontSize: '13px', color: dm ? '#9ca3af' : '#6b7280' }}>— queue</div>
              </div>
            </div>

            <section style={styles.statusSection}>
              <div style={styles.sectionHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>Service Health Status</h2>
                  <p style={styles.sectionSubtitle}>
                    Placeholder status grid for operational data simulation.
                  </p>
                </div>
              </div>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Service</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Uptime (30d)</th>
                      <th style={styles.th}>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      'Django API Gateway',
                      'PostgreSQL Primary',
                      'MongoDB Events',
                      'Redis Cache',
                      'ELK Stack',
                      'OpenVAS Scanner',
                      'Keycloak IAM',
                      'Apache Kafka',
                    ].map((service) => (
                      <tr key={service} style={styles.tr}>
                        <td style={styles.td}>{service}</td>
                        <td style={styles.td}>
                          <span style={styles.statusBadge}>—</span>
                        </td>
                        <td style={styles.td}>—</td>
                        <td style={styles.td}>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activePage === 'assigned-incidents' && (
          <section style={styles.statusSection}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>My Tickets</h2>
              </div>
            </div>

            <div style={styles.card}>
              <p style={{ color: dm ? '#cbd5e1' : '#475569', margin: 0, fontSize: '15px' }}>
                No incident details are shown yet. Assigned incidents will appear here once tasks are assigned.
              </p>
            </div>
          </section>
        )}

        {activePage === 'maintenance' && (
          <section style={styles.statusSection}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Pending Tasks</h2>
              </div>
            </div>

            <div style={styles.card}>
              <p style={{ color: dm ? '#cbd5e1' : '#475569', margin: 0, fontSize: '15px' }}>
                No maintenance tasks are available yet. This page will display scheduled assignments once they are created.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
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
    padding: '0 24px',
  },
  brandName: {
    fontSize: '24px',
    fontWeight: '800',
    color: dm ? '#f1f5f9' : '#0f172a',
    lineHeight: '1.2',
    letterSpacing: '-0.5px',
  },
  brandSub: {
    fontSize: '14px',
    color: dm ? '#94a3b8' : '#64748b',
    marginTop: '4px',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0 16px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 20px',
    borderRadius: '12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '500',
    color: dm ? '#cbd5e1' : '#475569',
    textAlign: 'left',
    width: '100%',
    transition: 'all 0.2s',
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
    padding: '14px 24px',
    borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
    flexShrink: 0,
  },
  profileInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)',
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
    color: dm ? '#f1f5f9' : '#0f172a',
  },
  profileRole: {
    fontSize: '12px',
    color: dm ? '#94a3b8' : '#64748b',
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: dm ? '#94a3b8' : '#64748b',
    padding: '6px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    height: '100vh',
    padding: '40px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    overflowY: 'auto',
  },
  headerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: '800',
    color: dm ? '#f8fafc' : '#0f172a',
    margin: '0 0 8px 0',
    letterSpacing: '-0.5px',
  },
  pageSubtitle: {
    fontSize: '16px',
    color: dm ? '#94a3b8' : '#64748b',
    margin: 0,
    fontWeight: '400',
  },
  themeToggle: {
    background: dm ? '#1e293b' : '#f8fafc',
    border: `1px solid ${dm ? '#334155' : '#e2e8f0'}`,
    borderRadius: '10px',
    cursor: 'pointer',
    color: dm ? '#f59e0b' : '#64748b',
    padding: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  cardGrid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '24px',
  },
  statusSection: {
    marginTop: '32px',
    padding: '28px',
    background: dm ? '#111827' : '#ffffff',
    border: `1px solid ${dm ? '#374151' : '#e5e7eb'}`,
    borderRadius: '24px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    gap: '16px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: dm ? '#f8fafc' : '#111827',
    margin: 0,
  },
  sectionSubtitle: {
    margin: '6px 0 0',
    color: dm ? '#94a3b8' : '#6b7280',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '720px',
  },
  th: {
    textAlign: 'left',
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: '700',
    color: dm ? '#94a3b8' : '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
  },
  tr: {
    transition: 'background 0.2s ease',
  },
  td: {
    padding: '16px',
    color: dm ? '#e2e8f0' : '#111827',
    fontSize: '14px',
    borderBottom: `1px solid ${dm ? '#1f2937' : '#e5e7eb'}`,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '60px',
    padding: '6px 10px',
    borderRadius: '999px',
    background: dm ? '#1f2937' : '#f3f4f6',
    color: dm ? '#cbd5e1' : '#475569',
    fontWeight: '600',
    fontSize: '13px',
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
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: '35px',
    fontWeight: '800',
    lineHeight: '1',
    letterSpacing: '-1px',
    marginTop: '8px',
    marginBottom: '8px',
  },
});
