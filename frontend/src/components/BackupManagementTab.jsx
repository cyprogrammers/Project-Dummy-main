/**
 * BackupManagementTab.jsx
 * ========================
 * Drop-in replacement for the backup tab content in DashboardPage.jsx.
 *
 * Integration — in DashboardPage.jsx, replace the backup tab block with:
 *   import BackupManagementTab from '../components/BackupManagementTab'
 *   ...
 *   {activePage === 'backup' && <BackupManagementTab darkMode={darkMode} />}
 */

import { useState, useEffect, useCallback } from 'react'

const API = '/api/v1/backup'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = {
  date: (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      })
    } catch { return '—' }
  },
  gb: (n) => n === 0 ? '—' : `${Number(n).toFixed(1)} GB`,
  duration: (secs) => {
    if (!secs) return '—'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  },
}

const STATUS_STYLE = {
  completed: { bg: '#d1fae5', color: '#065f46', border: '#10b981', label: 'COMPLETED' },
  running:   { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6', label: 'RUNNING'   },
  failed:    { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', label: 'FAILED'    },
  scheduled: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b', label: 'SCHEDULED' },
  pending:   { bg: '#f3f4f6', color: '#374151', border: '#9ca3af', label: 'PENDING'   },
}

const TYPE_ICONS = {
  Full:         '💾',
  Incremental:  '⚡',
  Differential: '🔄',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, bg, border, dm }) {
  return (
    <div style={{
      background: bg || (dm ? '#1e293b' : 'white'),
      border: `1px solid ${border || (dm ? '#334155' : '#f3f4f6')}`,
      borderRadius: '20px',
      padding: '24px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      boxShadow: dm ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <span style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.8px', color: dm ? '#94a3b8' : '#6b7280', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ fontSize: '32px', fontWeight: '800', color: accent, lineHeight: '1', letterSpacing: '-1px' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>{sub}</div>}
    </div>
  )
}

function Badge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.5px',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  )
}

function PulsingDot({ color }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '8px', height: '8px',
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 6px ${color}`,
      flexShrink: 0,
    }} />
  )
}

function StorageBar({ item, dm }) {
  const danger = item.percent > 85
  const warn   = item.percent > 65
  const barColor = danger ? '#ef4444' : warn ? '#f59e0b' : item.bar_color
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827' }}>{item.destination}</span>
        <span style={{ fontSize: '13px', color: dm ? '#94a3b8' : '#6b7280' }}>
          {item.used_gb.toFixed(1)} / {item.total_gb.toFixed(0)} GB
          <span style={{ marginLeft: '8px', fontWeight: '700', color: danger ? '#ef4444' : barColor }}>
            ({item.percent}%)
          </span>
        </span>
      </div>
      <div style={{ height: '10px', background: dm ? '#334155' : '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${item.percent}%`,
          background: barColor,
          borderRadius: '999px',
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
      {danger && (
        <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
          ⚠ Critical — storage almost full
        </div>
      )}
    </div>
  )
}

// ─── New Job Modal ────────────────────────────────────────────────────────────

function NewJobModal({ onClose, onCreated, dm }) {
  const [form, setForm] = useState({
    name: '',
    type: 'Full',
    destination: 'On-Prem NAS',
    retention_days: 30,
    copies: 3,
    schedule_cron: '0 2 * * *',
    tags: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Job name is required.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          retention_days: Number(form.retention_days),
          copies: Number(form.copies),
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      })
      if (!res.ok) {
        const e2 = await res.json()
        throw new Error(e2.detail || 'Failed to create job')
      }
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const s = makeStyles(dm)

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>Schedule New Backup Job</span>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={s.field}>
            <label style={s.label}>Job Name *</label>
            <input
              type="text" placeholder="e.g. PostgreSQL Replica"
              value={form.name} onChange={e => set('name', e.target.value)}
              style={s.input}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={s.field}>
              <label style={s.label}>Backup Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={s.input}>
                <option>Full</option>
                <option>Incremental</option>
                <option>Differential</option>
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Destination</label>
              <select value={form.destination} onChange={e => set('destination', e.target.value)} style={s.input}>
                <option>On-Prem NAS</option>
                <option>S3 Cloud</option>
                <option>Off-site Tape</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={s.field}>
              <label style={s.label}>Retention (days)</label>
              <input
                type="number" min="1" max="3650"
                value={form.retention_days} onChange={e => set('retention_days', e.target.value)}
                style={s.input}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Copies</label>
              <input
                type="number" min="1" max="10"
                value={form.copies} onChange={e => set('copies', e.target.value)}
                style={s.input}
              />
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>CRON Schedule</label>
            <input
              type="text" placeholder="0 2 * * *"
              value={form.schedule_cron} onChange={e => set('schedule_cron', e.target.value)}
              style={{ ...s.input, fontFamily: 'monospace' }}
            />
            <span style={{ fontSize: '11px', color: dm ? '#64748b' : '#9ca3af', marginTop: '4px' }}>
              Standard cron syntax — e.g. <code style={{ fontFamily: 'monospace' }}>0 2 * * *</code> = 2 AM daily
            </span>
          </div>

          <div style={s.field}>
            <label style={s.label}>Tags (comma-separated)</label>
            <input
              type="text" placeholder="database, critical"
              value={form.tags} onChange={e => set('tags', e.target.value)}
              style={s.input}
            />
          </div>

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...s.primaryBtn, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Scheduling…' : 'Schedule Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BackupManagementTab({ darkMode: dm = false }) {
  const [overview, setOverview]     = useState(null)
  const [jobs, setJobs]             = useState([])
  const [storage, setStorage]       = useState([])
  const [retention, setRetention]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showNewJob, setShowNewJob] = useState(false)
  const [actionMsg, setActionMsg]   = useState('')
  const [runningIds, setRunningIds] = useState(new Set())
  const [pollingActive, setPollingActive] = useState(false)

  const s = makeStyles(dm)

  // ── Fetch all data ─────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      const [ov, jRes, st, ret] = await Promise.all([
        fetch(`${API}/overview`).then(r => r.json()),
        fetch(`${API}/jobs`).then(r => r.json()),
        fetch(`${API}/storage`).then(r => r.json()),
        fetch(`${API}/retention`).then(r => r.json()),
      ])
      setOverview(ov)
      setJobs(jRes.jobs || [])
      setStorage(st.storage || [])
      setRetention(ret.policies || [])
      setError('')
    } catch {
      setError('Cannot reach backup service. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Poll while jobs are running ────────────────────────────────────────────

  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'running')
    if (hasRunning && !pollingActive) {
      setPollingActive(true)
      const timer = setInterval(fetchAll, 4000)
      return () => { clearInterval(timer); setPollingActive(false) }
    }
  }, [jobs, pollingActive, fetchAll])

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleRun = async (job) => {
    setRunningIds(prev => new Set([...prev, job.id]))
    try {
      const res = await fetch(`${API}/jobs/${job.id}/run`, { method: 'POST' })
      if (!res.ok) {
        const e2 = await res.json()
        throw new Error(e2.detail || 'Failed to start job')
      }
      flash(`▶ Backup started: ${job.name}`)
      await fetchAll()
    } catch (err) {
      flash(`✕ ${err.message}`, true)
    } finally {
      setRunningIds(prev => { const n = new Set(prev); n.delete(job.id); return n })
    }
  }

  const handleVerify = async (job) => {
    try {
      const res = await fetch(`${API}/jobs/${job.id}/verify`, { method: 'POST' })
      const data = await res.json()
      flash(data.verified ? `✓ Integrity verified: ${job.name}` : `⚠ No hash: ${job.name}`, !data.verified)
      await fetchAll()
    } catch {
      flash('Verification request failed', true)
    }
  }

  const handleDelete = async (job) => {
    if (!window.confirm(`Delete backup job "${job.name}"?\n\nThis cannot be undone.`)) return
    try {
      const res = await fetch(`${API}/jobs/${job.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const e2 = await res.json()
        throw new Error(e2.detail || 'Delete failed')
      }
      flash(`🗑 Deleted: ${job.name}`)
      await fetchAll()
    } catch (err) {
      flash(`✕ ${err.message}`, true)
    }
  }

  const flash = (msg, isErr = false) => {
    setActionMsg(isErr ? `❌ ${msg}` : msg)
    setTimeout(() => setActionMsg(''), 4000)
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: dm ? '#64748b' : '#9ca3af', fontSize: '14px' }}>
        Loading backup engine…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '24px', fontSize: '14px', color: '#dc2626', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <strong>Backup Engine Unavailable</strong>
        <p style={{ margin: 0, color: '#7f1d1d' }}>{error}</p>
        <button onClick={fetchAll} style={{ alignSelf: 'flex-start', padding: '8px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          Retry
        </button>
      </div>
    )
  }

  const ov = overview

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {actionMsg && (
        <div style={{
          position: 'fixed', bottom: '28px', right: '32px', zIndex: 9999,
          background: actionMsg.startsWith('❌') ? '#fee2e2' : '#d1fae5',
          border: `1px solid ${actionMsg.startsWith('❌') ? '#fca5a5' : '#10b981'}`,
          color: actionMsg.startsWith('❌') ? '#991b1b' : '#065f46',
          borderRadius: '12px', padding: '12px 20px', fontSize: '13px', fontWeight: '600',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxWidth: '380px',
          animation: 'fadeIn 0.2s ease',
        }}>
          {actionMsg}
        </div>
      )}

      {/* ── Overview Cards ─────────────────────────────────────────────────── */}
      <div style={s.cardGrid}>
        <StatCard
          label="Jobs Verified"
          value={ov ? `${ov.jobs_verified} / ${ov.jobs_total}` : '—'}
          sub={`${ov?.jobs_requiring_attention ?? 0} requiring attention`}
          accent="#16a34a"
          bg={dm ? '#064e3b' : '#f0fdf4'}
          border={dm ? '#065f46' : '#dcfce7'}
          dm={dm}
        />
        <StatCard
          label="Failed Jobs"
          value={ov?.failed_jobs ?? '—'}
          sub={`Last failure: ${ov?.last_failure_ago ?? '—'}`}
          accent="#ef4444"
          bg={dm ? '#451a03' : '#fff5f5'}
          border={dm ? '#78350f' : '#fecaca'}
          dm={dm}
        />
        <StatCard
          label="Total Backup Size"
          value={ov ? fmt.gb(ov.total_backup_size_gb) : '—'}
          sub="Across all destinations"
          accent="#0891b2"
          bg={dm ? '#064e3b' : '#f0fdf4'}
          border={dm ? '#065f46' : '#dcfce3'}
          dm={dm}
        />
        <StatCard
          label="Next Full Backup"
          value={ov?.time_until_next ?? '—'}
          sub={ov?.next_full_backup_iso ? fmt.date(ov.next_full_backup_iso) : 'Not scheduled'}
          accent="#f59e0b"
          bg={dm ? '#083344' : '#ecfeff'}
          border={dm ? '#164e63' : '#cffafe'}
          dm={dm}
        />
      </div>

      {/* ── Job Table ─────────────────────────────────────────────────────── */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {jobs.some(j => j.status === 'running') && <PulsingDot color="#3b82f6" />}
            <h2 style={s.panelTitle}>
              Backup Job Schedule
              {pollingActive && (
                <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: '500', color: '#3b82f6' }}>
                  live
                </span>
              )}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={fetchAll} style={s.outlineBtn}>↻ Refresh</button>
            <button onClick={() => setShowNewJob(true)} style={s.primaryBtn}>+ New Job</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${dm ? '#334155' : '#e5e7eb'}` }}>
                {['Job Name', 'Type', 'Destination', 'Last Run', 'Next Run', 'Size', 'Integrity', 'Status', 'Actions'].map(col => (
                  <th key={col} style={s.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ ...s.td, textAlign: 'center', padding: '40px', color: dm ? '#64748b' : '#9ca3af' }}>
                    No backup jobs scheduled. Click "New Job" to add one.
                  </td>
                </tr>
              )}
              {jobs.map((job, i, arr) => {
                const isLast    = i === arr.length - 1
                const isRunning = runningIds.has(job.id) || job.status === 'running'
                return (
                  <tr key={job.id} style={{
                    borderBottom: isLast ? 'none' : `1px solid ${dm ? '#1e293b' : '#f3f4f6'}`,
                    background: isRunning ? (dm ? 'rgba(59,130,246,0.06)' : 'rgba(219,234,254,0.4)') : 'transparent',
                  }}>
                    {/* Name */}
                    <td style={{ ...s.td, fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {job.name}
                        {job.error_message && (
                          <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: '400' }} title={job.error_message}>
                            ⚠ {job.error_message.slice(0, 48)}{job.error_message.length > 48 ? '…' : ''}
                          </span>
                        )}
                        {job.tags?.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {job.tags.slice(0, 3).map(t => (
                              <span key={t} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: dm ? '#334155' : '#f3f4f6', color: dm ? '#94a3b8' : '#6b7280' }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Type */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <span title={job.type}>{TYPE_ICONS[job.type]} {job.type}</span>
                    </td>
                    {/* Destination */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap', color: dm ? '#94a3b8' : '#374151' }}>{job.destination}</td>
                    {/* Last Run */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px', color: dm ? '#94a3b8' : '#6b7280' }}>
                      {fmt.date(job.last_run)}
                      {job.duration_seconds && (
                        <div style={{ fontSize: '11px', color: dm ? '#64748b' : '#9ca3af', marginTop: '2px' }}>
                          {fmt.duration(job.duration_seconds)}
                        </div>
                      )}
                    </td>
                    {/* Next Run */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '12px', color: dm ? '#94a3b8' : '#6b7280' }}>
                      {fmt.date(job.next_run)}
                    </td>
                    {/* Size */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap', fontWeight: '600', color: dm ? '#f1f5f9' : '#111827' }}>
                      {fmt.gb(job.size_gb)}
                    </td>
                    {/* Integrity */}
                    <td style={s.td}>
                      {job.integrity_verified ? (
                        <span title={job.integrity_hash || ''} style={{ color: '#16a34a', fontWeight: '700', fontSize: '13px', cursor: 'help' }}>
                          ✓ <span style={{ fontFamily: 'monospace', fontWeight: '400', fontSize: '11px', color: dm ? '#64748b' : '#9ca3af' }}>
                            {job.integrity_hash?.slice(0, 8)}…
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: '#ef4444', fontSize: '13px' }}>✗ Unverified</span>
                      )}
                    </td>
                    {/* Status */}
                    <td style={s.td}><Badge status={isRunning ? 'running' : job.status} /></td>
                    {/* Actions */}
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleRun(job)}
                          disabled={isRunning}
                          title="Run now"
                          style={{ ...s.actionBtn, color: '#0891b2', borderColor: '#0891b2', opacity: isRunning ? 0.5 : 1 }}
                        >
                          {isRunning ? '…' : '▶'}
                        </button>
                        {job.status === 'completed' && (
                          <button
                            onClick={() => handleVerify(job)}
                            title="Verify integrity"
                            style={{ ...s.actionBtn, color: '#16a34a', borderColor: '#16a34a' }}
                          >
                            ✓
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(job)}
                          disabled={isRunning}
                          title="Delete job"
                          style={{ ...s.actionBtn, color: '#ef4444', borderColor: '#ef4444', opacity: isRunning ? 0.5 : 1 }}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Storage Utilization ────────────────────────────────────────────── */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h2 style={s.panelTitle}>Storage Utilization</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>
          {storage.map(item => (
            <StorageBar key={item.destination} item={item} dm={dm} />
          ))}
          {storage.length === 0 && (
            <p style={{ color: dm ? '#64748b' : '#9ca3af', fontSize: '14px' }}>No storage data available.</p>
          )}
        </div>
      </div>

      {/* ── Retention Schedule ─────────────────────────────────────────────── */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h2 style={s.panelTitle}>Retention Schedule</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {retention.map((policy, i) => (
            <div
              key={policy.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '18px 0',
                borderBottom: i < retention.length - 1 ? `1px solid ${dm ? '#334155' : '#f3f4f6'}` : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: dm ? '#f1f5f9' : '#111827', marginBottom: '4px' }}>
                  {policy.label}
                </div>
                <div style={{ fontSize: '13px', color: dm ? '#64748b' : '#9ca3af' }}>Kept for {policy.period}</div>
              </div>
              <div style={{
                border: '2px solid #06b6d4',
                borderRadius: '12px',
                padding: '10px 24px',
                textAlign: 'center',
                minWidth: '96px',
              }}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#0891b2', lineHeight: '1' }}>{policy.copies}</div>
                <div style={{ fontSize: '12px', color: '#0891b2', fontWeight: '500', marginTop: '3px' }}>copies</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Success Rate ──────────────────────────────────────────────────── */}
      {ov && (
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h2 style={s.panelTitle}>Backup Health</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
            {/* Radial gauge */}
            <div style={{ flexShrink: 0 }}>
              <svg width="130" height="130" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="52" fill="none" stroke={dm ? '#334155' : '#f3f4f6'} strokeWidth="16" />
                <circle
                  cx="70" cy="70" r="52"
                  fill="none"
                  stroke={ov.success_rate_percent >= 90 ? '#16a34a' : ov.success_rate_percent >= 70 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="16"
                  strokeDasharray={`${(ov.success_rate_percent / 100) * 326.7} 326.7`}
                  strokeLinecap="round"
                  transform="rotate(-90 70 70)"
                />
                <text x="70" y="68" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="800" fill={dm ? '#f1f5f9' : '#111827'}>
                  {ov.success_rate_percent}%
                </text>
                <text x="70" y="86" textAnchor="middle" fontSize="11" fill={dm ? '#64748b' : '#9ca3af'}>
                  success
                </text>
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              {[
                { label: 'Completed Jobs', value: jobs.filter(j => j.status === 'completed').length, color: '#16a34a' },
                { label: 'Failed Jobs',    value: jobs.filter(j => j.status === 'failed').length,    color: '#ef4444' },
                { label: 'Scheduled',      value: jobs.filter(j => j.status === 'scheduled').length, color: '#f59e0b' },
                { label: 'Running Now',    value: jobs.filter(j => j.status === 'running').length,   color: '#3b82f6' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: dm ? '#94a3b8' : '#374151', flex: 1 }}>{label}</span>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: dm ? '#f1f5f9' : '#111827' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── New Job Modal ─────────────────────────────────────────────────── */}
      {showNewJob && (
        <NewJobModal
          onClose={() => setShowNewJob(false)}
          onCreated={() => { fetchAll(); flash('✓ Backup job scheduled!') }}
          dm={dm}
        />
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(dm) {
  return {
    cardGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '20px',
    },
    panel: {
      background: dm ? '#1e293b' : 'white',
      borderRadius: '16px',
      padding: '20px 24px 24px',
      border: `1px solid ${dm ? '#334155' : '#f3f4f6'}`,
      boxShadow: dm ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
    },
    panelHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '20px',
    },
    panelTitle: {
      fontSize: '16px',
      fontWeight: '700',
      color: dm ? '#f1f5f9' : '#111827',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '14px',
    },
    th: {
      textAlign: 'left',
      padding: '12px 14px',
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.7px',
      color: dm ? '#64748b' : '#9ca3af',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '14px',
      fontSize: '13px',
      color: dm ? '#94a3b8' : '#6b7280',
      verticalAlign: 'top',
    },
    primaryBtn: {
      padding: '9px 20px',
      background: '#0891b2',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: '700',
      cursor: 'pointer',
    },
    outlineBtn: {
      padding: '9px 16px',
      background: 'transparent',
      color: dm ? '#94a3b8' : '#374151',
      border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
    },
    actionBtn: {
      padding: '5px 10px',
      background: 'transparent',
      borderRadius: '6px',
      fontSize: '13px',
      cursor: 'pointer',
      border: '1px solid',
      lineHeight: '1',
    },
    cancelBtn: {
      padding: '9px 20px',
      background: 'transparent',
      color: dm ? '#94a3b8' : '#374151',
      border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
    },
    // Modal
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      background: dm ? '#1e293b' : 'white',
      borderRadius: '18px',
      padding: '32px 36px',
      width: '100%',
      maxWidth: '520px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
      maxHeight: '90vh',
      overflowY: 'auto',
    },
    modalHeader: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '24px',
    },
    modalTitle: {
      fontSize: '16px', fontWeight: '700', letterSpacing: '0.3px',
      color: '#0891b2',
    },
    closeBtn: {
      background: 'none', border: 'none', cursor: 'pointer',
      color: dm ? '#64748b' : '#9ca3af', fontSize: '18px', lineHeight: '1',
    },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: {
      fontSize: '11px', fontWeight: '700', letterSpacing: '0.6px',
      textTransform: 'uppercase',
      color: dm ? '#64748b' : '#9ca3af',
    },
    input: {
      width: '100%',
      padding: '11px 13px',
      border: `1px solid ${dm ? '#334155' : '#e5e7eb'}`,
      borderRadius: '10px',
      fontSize: '14px',
      color: dm ? '#f1f5f9' : '#111827',
      background: dm ? '#0f172a' : '#f9fafb',
      outline: 'none',
      boxSizing: 'border-box',
    },
  }
}
