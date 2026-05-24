/**
 * ITTechnicianPage.jsx  (full replacement)
 * =========================================
 * - Operational Status  →  service health grid (unchanged placeholder)
 * - Assigned Incidents  →  placeholder (unchanged)
 * - My Tasks            →  LIVE from /api/v1/tasks?assigned_to={email}
 *                          Technician can: Start · Mark Done · Block · Add notes
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

const TASKS_API = '/api/v1/tasks';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return '—'; }
};

const daysUntil = (iso) => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const d = Math.ceil(diff / 86400000);
  if (d < 0)  return { label: `${Math.abs(d)}d overdue`, overdue: true };
  if (d === 0) return { label: 'Due today',              overdue: true };
  return       { label: `Due in ${d}d`,                  overdue: false };
};

const STATUS_META = {
  pending:     { label: 'Pending',     bg: '#fef3c7', color: '#92400e', border: '#f59e0b', dot: '#f59e0b' },
  in_progress: { label: 'In Progress', bg: '#dbeafe', color: '#1e40af', border: '#3b82f6', dot: '#3b82f6' },
  completed:   { label: 'Completed',   bg: '#d1fae5', color: '#065f46', border: '#10b981', dot: '#10b981' },
  cancelled:   { label: 'Cancelled',   bg: '#f3f4f6', color: '#374151', border: '#9ca3af', dot: '#9ca3af' },
  blocked:     { label: 'Blocked',     bg: '#fee2e2', color: '#991b1b', border: '#ef4444', dot: '#ef4444' },
};

const PRI_COLOR = { P1: '#ef4444', P2: '#f97316', P3: '#f59e0b', P4: '#10b981' };

// ─── Tiny sub-components ────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: m.dot }} />
      {m.label}
    </span>
  );
}

function PriBadge({ priority }) {
  const c = PRI_COLOR[priority] || '#9ca3af';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '800', color: c }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c, boxShadow: `0 0 5px ${c}` }} />
      {priority}
    </span>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

function TaskCard({ task, onStatusChange, dm }) {
  const [expanded,    setExpanded]    = useState(false);
  const [noteText,    setNoteText]    = useState(task.technician_notes || '');
  const [savingNote,  setSavingNote]  = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const [toast,       setToast]       = useState('');
  const noteRef = useRef(null);

  const due = task.due_date ? daysUntil(task.due_date) : null;
  const isDone = task.status === 'completed' || task.status === 'cancelled';

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const changeStatus = async (newStatus) => {
    setSavingStatus(newStatus);
    try {
      const res = await fetch(`${TASKS_API}/${task.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, technician_notes: noteText || null }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      onStatusChange();
    } catch (err) {
      flash(`✕ ${err.message}`);
    } finally {
      setSavingStatus('');
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      const res = await fetch(`${TASKS_API}/${task.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: task.status, technician_notes: noteText }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      flash('✓ Note saved');
      onStatusChange();
    } catch (err) {
      flash(`✕ ${err.message}`);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div style={{
      background: dm ? '#1e293b' : 'white',
      border: `1px solid ${task.status === 'blocked' ? '#ef4444' : due?.overdue && !isDone ? '#f97316' : (dm ? '#334155' : '#e5e7eb')}`,
      borderRadius: '14px',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s',
    }}>
      {/* ── Card header (always visible) ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '18px 20px', cursor: 'pointer', display: 'flex', gap: '14px', alignItems: 'flex-start' }}
      >
        {/* Priority stripe */}
        <div style={{ width: '4px', borderRadius: '4px', background: PRI_COLOR[task.priority] || '#9ca3af', alignSelf: 'stretch', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: '700', color: dm ? '#93c5fd' : '#0891b2', background: dm ? 'rgba(147,197,253,0.1)' : '#ecfeff', padding: '1px 7px', borderRadius: '4px' }}>
              {task.id}
            </span>
            <PriBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            {task.tags?.slice(0, 3).map(tag => (
              <span key={tag} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', background: dm ? '#334155' : '#f3f4f6', color: dm ? '#94a3b8' : '#6b7280' }}>#{tag}</span>
            ))}
          </div>

          {/* Title */}
          <div style={{ fontSize: '15px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', lineHeight: '1.4', marginBottom: '6px' }}>
            {task.title}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: dm ? '#64748b' : '#9ca3af' }}>
            <span>📂 {task.category}</span>
            {task.assigned_by_name && <span>👤 Assigned by: <strong style={{ color: dm ? '#94a3b8' : '#374151' }}>{task.assigned_by_name}</strong></span>}
            {due && (
              <span style={{ color: due.overdue && !isDone ? '#ef4444' : 'inherit', fontWeight: due.overdue && !isDone ? '700' : '400' }}>
                {due.overdue && !isDone ? '⚠ ' : '📅 '}{due.label}
              </span>
            )}
            {task.status === 'completed' && task.completed_at && (
              <span style={{ color: '#10b981' }}>✓ Completed {fmtDate(task.completed_at)}</span>
            )}
          </div>
        </div>

        {/* Expand arrow */}
        <svg style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', color: dm ? '#64748b' : '#9ca3af', marginTop: '2px' }}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Description */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', marginBottom: '8px' }}>Task Description</div>
            <p style={{ margin: 0, fontSize: '14px', color: dm ? '#cbd5e1' : '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{task.description || '—'}</p>
          </div>

          {/* Admin notes */}
          {task.admin_notes && (
            <div style={{ background: dm ? '#082f49' : '#ecfeff', border: `1px solid ${dm ? '#164e63' : '#cffafe'}`, borderRadius: '10px', padding: '13px 15px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: '#0891b2', marginBottom: '7px' }}>📌 Admin Notes</div>
              <p style={{ margin: 0, fontSize: '13px', color: dm ? '#67e8f9' : '#155e75', lineHeight: '1.6' }}>{task.admin_notes}</p>
            </div>
          )}

          {/* Progress note input */}
          {!isDone && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af', marginBottom: '8px' }}>Your Progress Notes</div>
              <textarea
                ref={noteRef}
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Log what you've done, what's blocked, next steps…"
                rows={3}
                style={{ width: '100%', padding: '10px 13px', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '9px', fontSize: '13px', color: dm ? '#f1f5f9' : '#111827', background: dm ? '#0f172a' : '#f9fafb', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '7px' }}>
                <button onClick={saveNote} disabled={savingNote}
                  style={{ padding: '7px 18px', background: 'transparent', border: `1px solid ${dm ? '#334155' : '#d1d5db'}`, borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: dm ? '#94a3b8' : '#374151', cursor: 'pointer', opacity: savingNote ? 0.6 : 1 }}>
                  {savingNote ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
          )}

          {/* Existing tech notes (if done) */}
          {isDone && task.technician_notes && (
            <div style={{ background: dm ? '#0d2a0d' : '#f0fdf4', border: `1px solid ${dm ? '#065f46' : '#bbf7d0'}`, borderRadius: '10px', padding: '13px 15px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: '#16a34a', marginBottom: '7px' }}>Your Notes</div>
              <p style={{ margin: 0, fontSize: '13px', color: dm ? '#86efac' : '#166534', lineHeight: '1.6' }}>{task.technician_notes}</p>
            </div>
          )}

          {/* Action buttons */}
          {!isDone && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
              {task.status === 'pending' && (
                <button onClick={() => changeStatus('in_progress')} disabled={!!savingStatus}
                  style={{ padding: '9px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: savingStatus === 'in_progress' ? 0.7 : 1 }}>
                  {savingStatus === 'in_progress' ? 'Starting…' : '▶ Start Task'}
                </button>
              )}
              {task.status === 'in_progress' && (
                <>
                  <button onClick={() => changeStatus('completed')} disabled={!!savingStatus}
                    style={{ padding: '9px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: savingStatus === 'completed' ? 0.7 : 1 }}>
                    {savingStatus === 'completed' ? 'Completing…' : '✓ Mark as Done'}
                  </button>
                  <button onClick={() => changeStatus('blocked')} disabled={!!savingStatus}
                    style={{ padding: '9px 20px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                    🚧 Mark as Blocked
                  </button>
                </>
              )}
              {task.status === 'blocked' && (
                <button onClick={() => changeStatus('in_progress')} disabled={!!savingStatus}
                  style={{ padding: '9px 20px', background: '#f97316', color: 'white', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                  ↩ Resume Task
                </button>
              )}
              <button onClick={() => changeStatus('cancelled')} disabled={!!savingStatus}
                style={{ padding: '9px 20px', background: 'transparent', color: dm ? '#64748b' : '#9ca3af', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '9px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel Task
              </button>
            </div>
          )}

          {toast && (
            <div style={{ padding: '9px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', background: toast.startsWith('✕') ? '#fee2e2' : '#d1fae5', color: toast.startsWith('✕') ? '#991b1b' : '#065f46', border: `1px solid ${toast.startsWith('✕') ? '#fca5a5' : '#6ee7b7'}` }}>
              {toast}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NAV config ─────────────────────────────────────────────────────────────

const NAV_ITEMS_BASE = [
  { id: 'operational-status', label: 'Operational Status' },
  { id: 'assigned-incidents', label: 'Assigned Incidents' },
  { id: 'maintenance',        label: 'My Tasks' },
];

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ITTechnicianPage({ onLogout, currentUser }) {
  const [activePage, setActivePage] = useState('operational-status');
  const [darkMode,   setDarkMode]   = useState(false);
  const dm = darkMode;

  // ── Task state ──────────────────────────────────────────────────────────
  const [tasks,       setTasks]       = useState([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskError,   setTaskError]   = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchTasks = useCallback(async () => {
    if (!currentUser?.email) return;
    setTaskLoading(true); setTaskError('');
    try {
      const url = `${TASKS_API}?assigned_to=${encodeURIComponent(currentUser.email)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setTaskError(`Failed to load tasks: ${err.message}`);
    } finally {
      setTaskLoading(false);
    }
  }, [currentUser?.email]);

  // Auto-fetch when switching to My Tasks tab
  useEffect(() => {
    if (activePage === 'maintenance') fetchTasks();
  }, [activePage, fetchTasks]);

  // Poll every 30s while on that tab
  useEffect(() => {
    if (activePage !== 'maintenance') return;
    const id = setInterval(fetchTasks, 30000);
    return () => clearInterval(id);
  }, [activePage, fetchTasks]);

  // ── Derived task stats ──────────────────────────────────────────────────
  const openTasks     = tasks.filter(t => !['completed','cancelled'].includes(t.status));
  const pendingCount  = tasks.filter(t => t.status === 'pending').length;
  const inProgCount   = tasks.filter(t => t.status === 'in_progress').length;
  const blockedCount  = tasks.filter(t => t.status === 'blocked').length;
  const overdueCount  = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;
  const p1Count       = openTasks.filter(t => t.priority === 'P1').length;

  const filteredTasks = filterStatus === 'all'
    ? tasks
    : tasks.filter(t => t.status === filterStatus);

  // Badge count on nav item (open tasks only)
  const navItems = NAV_ITEMS_BASE.map(item =>
    item.id === 'maintenance' ? { ...item, badge: openTasks.length || null } : item
  );

  const styles = makeStyles(dm);

  return (
    <div style={styles.wrapper}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.brand}>
            <div style={styles.brandName}>IT Technician</div>
            <div style={styles.brandSub}>Service Health Monitoring</div>
          </div>

          <nav style={styles.nav}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                style={{ ...styles.navItem, ...(activePage === item.id ? styles.navItemActive : {}) }}
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <span style={{ marginLeft: 'auto', minWidth: '20px', height: '20px', borderRadius: '10px', background: activePage === item.id ? 'rgba(255,255,255,0.25)' : '#0891b2', color: 'white', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        {/* Profile */}
        <div style={styles.profile}>
          <div style={styles.profileInner}>
            <div style={styles.avatar}>
              <span style={styles.avatarText}>
                {currentUser
                  ? `${(currentUser.first_name?.[0] || '').toUpperCase()}${(currentUser.surname?.[0] || '').toUpperCase()}`
                  : 'IT'}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...styles.profileName, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser ? `${(currentUser.first_name?.[0] || '').toUpperCase()}. ${currentUser.surname}` : 'IT Technician'}
              </div>
              <div style={{ ...styles.profileRole, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser?.email || 'tech@secureops.io'}
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
        {/* Page Header */}
        <div style={{ ...styles.card, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
          <div>
            <h1 style={{ ...styles.pageTitle, margin: '0 0 4px 0' }}>
              {activePage === 'maintenance' ? 'My Tasks' : activePage === 'operational-status' ? 'Operational Status' : 'Assigned Incidents'}
            </h1>
            <p style={styles.pageSubtitle}>
              {activePage === 'maintenance'
                ? `Tasks assigned to you — ${currentUser?.email || ''}`
                : activePage === 'operational-status'
                ? 'Service Health Monitoring — Operational Insight'
                : 'Incident Response Support — Operational Scope'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activePage === 'maintenance' && (
              <button onClick={fetchTasks} disabled={taskLoading}
                style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`, borderRadius: '9px', fontSize: '12px', fontWeight: '600', color: dm ? '#94a3b8' : '#374151', cursor: 'pointer', opacity: taskLoading ? 0.6 : 1 }}>
                {taskLoading ? 'Refreshing…' : '↻ Refresh'}
              </button>
            )}
            <button onClick={() => setDarkMode(!dm)} style={styles.themeToggle} title="Toggle dark mode">
              {dm
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
          </div>
        </div>

        {/* ── Operational Status ── */}
        {activePage === 'operational-status' && (
          <>
            <div style={styles.cardGrid4}>
              {[
                { label: 'SERVICES ONLINE', value: '—', sub: '— scanning',      bg: dm ? '#064e3b' : '#f0fdf4', border: dm ? '#065f46' : '#dcfce3', color: '#10b981' },
                { label: 'ASSIGNED TICKETS', value: '—', sub: '— backup failure', bg: dm ? '#451a03' : '#fffbeb', border: dm ? '#78350f' : '#fef3c7', color: '#f59e0b' },
                { label: 'SYSTEM UPTIME',   value: '—', sub: '— average',        bg: dm ? '#064e3b' : '#f0fdf4', border: dm ? '#065f46' : '#dcfce3', color: '#10b981' },
                { label: 'PENDING TASKS',   value: pendingCount || '—', sub: pendingCount ? `${pendingCount} in queue` : '— queue', bg: dm ? '#083344' : '#ecfeff', border: dm ? '#164e63' : '#cffafe', color: '#06b6d4' },
              ].map(({ label, value, sub, bg, border, color }) => (
                <div key={label} style={{ ...styles.card, background: bg, border: `1px solid ${border}` }}>
                  <span style={{ ...styles.cardLabel, color: dm ? '#9ca3af' : '#4b5563' }}>{label}</span>
                  <div style={{ ...styles.cardValue, color }}>{value}</div>
                  <div style={{ fontSize: '13px', color: dm ? '#9ca3af' : '#6b7280' }}>{sub}</div>
                </div>
              ))}
            </div>

            <section style={styles.statusSection}>
              <div style={styles.sectionHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>Service Health Status</h2>
                  <p style={styles.sectionSubtitle}>Placeholder status grid for operational data simulation.</p>
                </div>
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Service','Status','Uptime (30d)','Latency'].map(h => <th key={h} style={styles.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {['Django API Gateway','PostgreSQL Primary','MongoDB Events','Redis Cache','ELK Stack','OpenVAS Scanner','Keycloak IAM','Apache Kafka'].map(service => (
                      <tr key={service} style={styles.tr}>
                        <td style={styles.td}>{service}</td>
                        <td style={styles.td}><span style={styles.statusBadge}>—</span></td>
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

        {/* ── Assigned Incidents ── */}
        {activePage === 'assigned-incidents' && (
          <section style={styles.statusSection}>
            <h2 style={{ ...styles.sectionTitle, margin: '0 0 16px 0' }}>My Tickets</h2>
            <div style={styles.card}>
              <p style={{ color: dm ? '#cbd5e1' : '#475569', margin: 0, fontSize: '15px' }}>
                No incident details are shown yet. Assigned incidents will appear here once tasks are assigned.
              </p>
            </div>
          </section>
        )}

        {/* ── My Tasks (live) ── */}
        {activePage === 'maintenance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* ── KPI strip ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
              {[
                { label: 'Open',       value: openTasks.length, color: '#0891b2' },
                { label: 'Pending',    value: pendingCount,     color: '#f59e0b' },
                { label: 'In Progress',value: inProgCount,      color: '#3b82f6' },
                { label: 'Blocked',    value: blockedCount,     color: '#ef4444' },
                { label: 'Overdue',    value: overdueCount,     color: '#f97316' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ ...styles.card, padding: '16px 18px', gap: '6px', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.7px', color: dm ? '#64748b' : '#9ca3af' }}>{label}</div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ── P1 alert banner ── */}
            {p1Count > 0 && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>🚨</span>
                <div>
                  <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '13px' }}>
                    You have {p1Count} open P1 {p1Count === 1 ? 'task' : 'tasks'} — Critical priority
                  </div>
                  <div style={{ fontSize: '12px', color: '#b91c1c' }}>These require immediate attention.</div>
                </div>
              </div>
            )}

            {/* ── Filter bar ── */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: dm ? '#64748b' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter:</span>
              {['all','pending','in_progress','blocked','completed','cancelled'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filterStatus === s ? '#0891b2' : (dm ? '#334155' : '#e5e7eb')}`, background: filterStatus === s ? '#0891b2' : 'transparent', color: filterStatus === s ? 'white' : (dm ? '#94a3b8' : '#374151'), fontSize: '12px', fontWeight: '600', cursor: 'pointer', textTransform: 'capitalize' }}>
                  {s === 'all' ? `All (${tasks.length})` : s.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* ── Error state ── */}
            {taskError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', color: '#dc2626', fontSize: '13px', fontWeight: '600' }}>
                {taskError}
                <button onClick={fetchTasks} style={{ marginLeft: '12px', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: '700' }}>Retry</button>
              </div>
            )}

            {/* ── Loading skeleton ── */}
            {taskLoading && tasks.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ height: '80px', borderRadius: '14px', background: dm ? '#1e293b' : '#f3f4f6', animation: 'pulse 1.5s infinite' }} />
                ))}
              </div>
            )}

            {/* ── Empty state ── */}
            {!taskLoading && !taskError && filteredTasks.length === 0 && (
              <div style={{ ...styles.card, alignItems: 'center', textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>📋</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', marginBottom: '6px' }}>
                  {filterStatus === 'all' ? 'No tasks assigned yet' : `No ${filterStatus.replace('_', ' ')} tasks`}
                </div>
                <div style={{ fontSize: '13px', color: dm ? '#64748b' : '#9ca3af' }}>
                  {filterStatus === 'all'
                    ? 'When an IT Administrator assigns you a task, it will appear here.'
                    : 'Try changing the filter to see other tasks.'}
                </div>
              </div>
            )}

            {/* ── Task cards ── */}
            {filteredTasks.map(task => (
              <TaskCard key={task.id} task={task} onStatusChange={fetchTasks} dm={dm} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (dm) => ({
  wrapper:    { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Inter', 'Segoe UI', sans-serif", background: dm ? '#0f172a' : '#f1f5f9' },
  sidebar:    { width: '260px', minWidth: '260px', height: '100vh', background: dm ? '#1e293b' : 'white', borderRight: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, display: 'flex', flexDirection: 'column', padding: '32px 0 20px', flexShrink: 0, boxSizing: 'border-box' },
  sidebarTop: { display: 'flex', flexDirection: 'column', gap: '40px', flex: 1 },
  brand:      { padding: '0 24px' },
  brandName:  { fontSize: '24px', fontWeight: '800', color: dm ? '#f1f5f9' : '#0f172a', lineHeight: '1.2', letterSpacing: '-0.5px' },
  brandSub:   { fontSize: '14px', color: dm ? '#94a3b8' : '#64748b', marginTop: '4px' },
  nav:        { display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 16px' },
  navItem:    { display: 'flex', alignItems: 'center', padding: '14px 20px', borderRadius: '12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '15px', fontWeight: '500', color: dm ? '#cbd5e1' : '#475569', textAlign: 'left', width: '100%' },
  navItemActive: { background: dm ? '#3b82f6' : '#0f172a', color: 'white', fontWeight: '600', boxShadow: dm ? '0 4px 12px rgba(59,130,246,0.3)' : '0 4px 12px rgba(15,23,42,0.15)' },
  profile:    { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '10px', padding: '14px 24px', borderTop: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, flexShrink: 0 },
  profileInner: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar:     { width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: '13px', fontWeight: '700', color: 'white', letterSpacing: '0.5px' },
  profileName: { fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#0f172a' },
  profileRole: { fontSize: '12px', color: dm ? '#94a3b8' : '#64748b' },
  logoutBtn:  { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '8px 14px', borderRadius: '999px', border: `1.5px solid ${dm ? '#475569' : '#d1d5db'}`, background: dm ? 'transparent' : 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '700', letterSpacing: '0.8px', color: dm ? '#94a3b8' : '#374151', boxSizing: 'border-box' },
  main:       { flex: 1, height: '100vh', padding: '40px 48px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' },
  pageTitle:  { fontSize: '20px', fontWeight: '800', color: dm ? '#f8fafc' : '#0f172a', letterSpacing: '-0.5px' },
  pageSubtitle: { fontSize: '15px', color: dm ? '#94a3b8' : '#64748b', margin: 0, fontWeight: '400' },
  themeToggle: { background: dm ? '#1e293b' : '#f8fafc', border: `1px solid ${dm ? '#334155' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', color: dm ? '#f59e0b' : '#64748b', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardGrid4:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' },
  statusSection: { marginTop: '8px', padding: '28px', background: dm ? '#111827' : '#ffffff', border: `1px solid ${dm ? '#374151' : '#e5e7eb'}`, borderRadius: '24px' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '16px' },
  sectionTitle: { fontSize: '20px', fontWeight: '700', color: dm ? '#f8fafc' : '#111827', margin: 0 },
  sectionSubtitle: { margin: '6px 0 0', color: dm ? '#94a3b8' : '#6b7280', fontSize: '14px', lineHeight: '1.5' },
  tableWrapper: { overflowX: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse', minWidth: '720px' },
  th:         { textAlign: 'left', padding: '14px 16px', fontSize: '12px', fontWeight: '700', color: dm ? '#94a3b8' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` },
  tr:         { transition: 'background 0.2s ease' },
  td:         { padding: '16px', color: dm ? '#e2e8f0' : '#111827', fontSize: '14px', borderBottom: `1px solid ${dm ? '#1f2937' : '#e5e7eb'}` },
  statusBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '60px', padding: '6px 10px', borderRadius: '999px', background: dm ? '#1f2937' : '#f3f4f6', color: dm ? '#cbd5e1' : '#475569', fontWeight: '600', fontSize: '13px' },
  card:       { background: dm ? '#1e293b' : '#ffffff', borderRadius: '20px', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '16px', border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`, boxShadow: dm ? 'none' : '0 1px 3px rgba(0,0,0,0.06)' },
  cardLabel:  { fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' },
  cardValue:  { fontSize: '35px', fontWeight: '800', lineHeight: '1', letterSpacing: '-1px', marginTop: '8px', marginBottom: '8px' },
});
