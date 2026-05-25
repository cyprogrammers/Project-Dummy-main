/**
 * TaskManagementPanel.jsx
 * ========================
 * Used inside DashboardPage.jsx (IT Administrator view).
 *
 * Integration — in DashboardPage.jsx:
 *   1. Add to NAV_ITEMS:
 *        { id: 'tasks', label: 'TASK MANAGEMENT', icon: <ClipboardIcon /> }
 *   2. Import component:
 *        import TaskManagementPanel from '../components/TaskManagementPanel'
 *   3. Add render block:
 *        {activePage === 'tasks' && <TaskManagementPanel darkMode={darkMode} currentUser={currentUser} />}
 *
 * API:
 *   GET  /api/v1/tasks                   - list all tasks (with filters)
 *   POST /api/v1/tasks                   - create task
 *   POST /api/v1/tasks/:id/assign        - (re)assign task
 *   POST /api/v1/tasks/:id/status        - update status
 *   DELETE /api/v1/tasks/:id             - delete task
 *   GET  /api/v1/tasks/overview          - summary counts
 *   GET  /api/v1/rbac/users?role_id=X    - list IT Technicians for assignment dropdown
 */

import { useState, useEffect, useCallback } from 'react'
import { roles as rolesAPI, users as usersAPI } from '../services/authService'

const API = '/api/v1/tasks'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false }) } catch { return '—' }
}

const isOverdue = (task) => {
  if (!task.due_date || ['completed','cancelled'].includes(task.status)) return false
  return new Date(task.due_date).getTime() < Date.now()
}

const daysUntil = (iso) => {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  const d = Math.ceil(diff / 86400000)
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d === 0) return 'Due today'
  return `In ${d}d`
}

const STATUS_STYLE = {
  pending:     { bg:'#fef3c7', color:'#92400e', border:'#f59e0b', label:'Pending'     },
  in_progress: { bg:'#dbeafe', color:'#1e40af', border:'#3b82f6', label:'In Progress' },
  completed:   { bg:'#d1fae5', color:'#065f46', border:'#10b981', label:'Completed'   },
  cancelled:   { bg:'#f3f4f6', color:'#374151', border:'#9ca3af', label:'Cancelled'   },
  blocked:     { bg:'#fee2e2', color:'#991b1b', border:'#ef4444', label:'Blocked'     },
}

const PRIORITY_COLOR = { P1:'#ef4444', P2:'#f97316', P3:'#f59e0b', P4:'#10b981' }

const CATEGORIES = ['Backup','Security','Database','System','Network','Auth / IAM','Incident Response','Patching','Monitoring','Other']

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending
  return (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:'700', background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

function PriDot({ priority }) {
  const c = PRIORITY_COLOR[priority] || '#9ca3af'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'12px', fontWeight:'700', color:c }}>
      <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}` }} />
      {priority}
    </span>
  )
}

// ─── Create/Edit Task Modal ────────────────────────────────────────────────────

function TaskModal({ task = null, technicians = [], currentUser, onClose, onSaved, dm }) {
  const isEdit = !!task
  const [form, setForm] = useState({
    title:             task?.title             || '',
    description:       task?.description       || '',
    category:          task?.category          || 'System',
    priority:          task?.priority          || 'P3',
    assigned_to_email: task?.assigned_to_email || '',
    due_date:          task?.due_date ? task.due_date.slice(0,10) : '',
    admin_notes:       task?.admin_notes       || '',
    tags:              (task?.tags || []).join(', '),
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const selectedTech = technicians.find(t => t.email === form.assigned_to_email)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        title:             form.title.trim(),
        description:       form.description.trim(),
        category:          form.category,
        priority:          form.priority,
        assigned_to_email: form.assigned_to_email || null,
        assigned_to_name:  selectedTech ? `${selectedTech.first_name} ${selectedTech.surname}` : null,
        assigned_by_email: currentUser?.email || null,
        assigned_by_name:  currentUser ? `${currentUser.first_name} ${currentUser.surname}` : null,
        due_date:          form.due_date ? new Date(form.due_date).toISOString() : null,
        admin_notes:       form.admin_notes.trim() || null,
        tags:              form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }

      if (isEdit) {
        const res = await fetch(`${API}/${task.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Update failed')
      } else {
        const res = await fetch(API, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Create failed')
      }
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const inp = {
    width:'100%', padding:'10px 13px', border:`1px solid ${dm?'#334155':'#e5e7eb'}`,
    borderRadius:'9px', fontSize:'14px', color:dm?'#f1f5f9':'#111827',
    background:dm?'#0f172a':'#f9fafb', outline:'none', boxSizing:'border-box',
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' }}
      onClick={onClose}>
      <div style={{ background:dm?'#1e293b':'white', borderRadius:'18px', padding:'32px 36px', width:'100%', maxWidth:'560px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:`1px solid ${dm?'#334155':'#e5e7eb'}` }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
          <h3 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0891b2', letterSpacing:'0.3px' }}>
            {isEdit ? `Edit Task — ${task.id}` : 'Assign New Task'}
          </h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:dm?'#64748b':'#9ca3af', fontSize:'18px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          {/* Title */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Task Title *</label>
            <input type="text" placeholder="e.g. SSL certificate renewal for Keycloak" value={form.title} onChange={e => set('title', e.target.value)} style={inp} />
          </div>

          {/* Description */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Description</label>
            <textarea
              placeholder="Step-by-step instructions, context, acceptance criteria…"
              value={form.description} onChange={e => set('description', e.target.value)} rows={4}
              style={{ ...inp, resize:'vertical', fontFamily:'inherit', lineHeight:'1.6' }} />
          </div>

          {/* Category + Priority */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inp}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...inp, color:PRIORITY_COLOR[form.priority] || inp.color }}>
                {['P1 — Critical','P2 — High','P3 — Medium','P4 — Low'].map(p => (
                  <option key={p} value={p.slice(0,2)}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assign to technician */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Assign To</label>
            <select value={form.assigned_to_email} onChange={e => set('assigned_to_email', e.target.value)} style={inp}>
              <option value="">— Unassigned —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.email}>
                  {t.first_name} {t.surname} ({t.email})
                </option>
              ))}
            </select>
            {selectedTech && (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'8px', padding:'8px 12px', background:dm?'#0f172a':'#f0fdf4', borderRadius:'8px', border:`1px solid ${dm?'#065f46':'#bbf7d0'}` }}>
                <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'linear-gradient(135deg,#0891b2,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:'white', flexShrink:0 }}>
                  {`${selectedTech.first_name?.[0]||''}${selectedTech.surname?.[0]||''}`.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:'600', color:dm?'#f1f5f9':'#111827' }}>{selectedTech.first_name} {selectedTech.surname}</div>
                  <div style={{ fontSize:'11px', color:dm?'#64748b':'#9ca3af' }}>{selectedTech.roles?.[0]?.name || 'IT Technician'}</div>
                </div>
                <span style={{ marginLeft:'auto', padding:'2px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:'600', background:selectedTech.status==='active'?'#d1fae5':'#fee2e2', color:selectedTech.status==='active'?'#065f46':'#991b1b' }}>
                  {selectedTech.status?.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Due date */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Due Date</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={inp} />
          </div>

          {/* Admin notes */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Admin Notes (visible to technician)</label>
            <textarea
              placeholder="Priority context, escalation contacts, related ticket IDs…"
              value={form.admin_notes} onChange={e => set('admin_notes', e.target.value)} rows={2}
              style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
          </div>

          {/* Tags */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'7px' }}>Tags (comma-separated)</label>
            <input type="text" placeholder="backup, keycloak, ssl, urgent" value={form.tags} onChange={e => set('tags', e.target.value)} style={inp} />
          </div>

          {error && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px', padding:'10px 14px', fontSize:'13px', color:'#dc2626' }}>{error}</div>
          )}

          <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', marginTop:'4px' }}>
            <button type="button" onClick={onClose} style={{ padding:'10px 22px', background:'transparent', color:dm?'#94a3b8':'#374151', border:`1px solid ${dm?'#334155':'#e5e7eb'}`, borderRadius:'10px', fontSize:'14px', fontWeight:'600', cursor:'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ padding:'10px 26px', background:'#0891b2', color:'white', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:'700', cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reassign Modal ────────────────────────────────────────────────────────────

function ReassignModal({ task, technicians, currentUser, onClose, onSaved, dm }) {
  const [email, setEmail] = useState(task.assigned_to_email || '')
  const [saving, setSaving] = useState(false)

  const selectedTech = technicians.find(t => t.email === email)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/${task.id}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_to_email: email,
          assigned_to_name:  selectedTech ? `${selectedTech.first_name} ${selectedTech.surname}` : null,
          assigned_by_email: currentUser?.email,
          assigned_by_name:  currentUser ? `${currentUser.first_name} ${currentUser.surname}` : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).detail)
      onSaved()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:dm?'#1e293b':'white', borderRadius:'16px', padding:'28px 32px', width:'100%', maxWidth:'420px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:`1px solid ${dm?'#334155':'#e5e7eb'}` }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <h3 style={{ margin:0, fontSize:'15px', fontWeight:'700', color:'#0891b2' }}>Reassign Task</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:dm?'#64748b':'#9ca3af', fontSize:'18px' }}>✕</button>
        </div>
        <div style={{ marginBottom:'16px', padding:'10px 14px', background:dm?'#0f172a':'#f8fafc', borderRadius:'8px', border:`1px solid ${dm?'#334155':'#e5e7eb'}` }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:dm?'#f1f5f9':'#111827' }}>{task.title}</div>
          <div style={{ fontSize:'11px', color:dm?'#64748b':'#9ca3af', marginTop:'3px' }}>Currently: {task.assigned_to_name || task.assigned_to_email || 'Unassigned'}</div>
        </div>
        <label style={{ display:'block', fontSize:'11px', fontWeight:'700', letterSpacing:'0.7px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af', marginBottom:'8px' }}>Assign To</label>
        <select value={email} onChange={e => setEmail(e.target.value)}
          style={{ width:'100%', padding:'10px 13px', border:`1px solid ${dm?'#334155':'#e5e7eb'}`, borderRadius:'9px', fontSize:'14px', color:dm?'#f1f5f9':'#111827', background:dm?'#0f172a':'#f9fafb', outline:'none', boxSizing:'border-box', marginBottom:'16px' }}>
          <option value="">— Unassigned —</option>
          {technicians.map(t => (
            <option key={t.id} value={t.email}>{t.first_name} {t.surname} ({t.email})</option>
          ))}
        </select>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
          <button onClick={onClose} style={{ padding:'9px 20px', background:'transparent', color:dm?'#94a3b8':'#374151', border:`1px solid ${dm?'#334155':'#e5e7eb'}`, borderRadius:'9px', fontSize:'14px', fontWeight:'600', cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding:'9px 22px', background:'#0891b2', color:'white', border:'none', borderRadius:'9px', fontSize:'14px', fontWeight:'700', cursor:'pointer', opacity:saving?0.7:1 }}>
            {saving ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TaskManagementPanel({ darkMode: dm = false, currentUser = null }) {
  const [tasks,        setTasks]        = useState([])
  const [overview,     setOverview]     = useState(null)
  const [technicians,  setTechnicians]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPri,    setFilterPri]    = useState('all')
  const [filterAssign, setFilterAssign] = useState('all')
  const [search,       setSearch]       = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editTask,     setEditTask]     = useState(null)
  const [reassignTask, setReassignTask] = useState(null)
  const [expandedId,   setExpandedId]   = useState(null)
  const [toast,        setToast]        = useState('')

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // ── Fetch tasks + overview ────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [tasksRes, ovRes] = await Promise.all([
        fetch(API).then(r => r.json()),
        fetch(`${API}/overview`).then(r => r.json()),
      ])
      // API returns array directly, not wrapped in {tasks: [...]}
      setTasks(Array.isArray(tasksRes) ? tasksRes : (tasksRes.tasks || []))
      setOverview(ovRes)
    } catch (err) {
      console.error('Task fetch error', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch IT Technicians from RBAC ────────────────────────────────────────
  const fetchTechnicians = useCallback(async () => {
    try {
      const allRoles = await rolesAPI.list()
      const techRole = allRoles.find(r => r.frontend_key === 'it-technician')
      if (!techRole) return
      const usersRes = await usersAPI.list({ role_id: techRole.id, page_size: 100 })
      setTechnicians((usersRes.items || []).filter(u => u.status === 'active'))
    } catch (err) {
      console.error('Failed to load technicians:', err)
    }
  }, [])

  useEffect(() => { fetchAll(); fetchTechnicians() }, [fetchAll, fetchTechnicians])

  // ── Delete task ───────────────────────────────────────────────────────────
  const handleDelete = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?\n\nThis cannot be undone.`)) return
    try {
      const res = await fetch(`${API}/${task.id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      flash(`🗑 Deleted: ${task.title}`)
      fetchAll()
    } catch (err) { flash(`✕ ${err.message}`) }
  }

  // ── Quick status change ───────────────────────────────────────────────────
  const handleStatusChange = async (task, status) => {
    try {
      const res = await fetch(`${API}/${task.id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error((await res.json()).detail)
      flash(`✓ Status updated → ${status.replace('_',' ')}`)
      fetchAll()
    } catch (err) { flash(`✕ ${err.message}`) }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus)       return false
    if (filterPri    !== 'all' && t.priority !== filterPri)        return false
    if (filterAssign === 'mine'     && t.assigned_to_email !== currentUser?.email) return false
    if (filterAssign === 'unassigned' && t.assigned_to_email)       return false
    if (search) {
      const q = search.toLowerCase()
      return t.title.toLowerCase().includes(q) || t.id.includes(q) ||
             (t.assigned_to_name||'').toLowerCase().includes(q) ||
             (t.tags||[]).some(tag => tag.includes(q))
    }
    return true
  })

  const s = makeStyles(dm)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:'28px', right:'32px', zIndex:9999, background:toast.startsWith('✕')?'#fee2e2':'#d1fae5', border:`1px solid ${toast.startsWith('✕')?'#ef4444':'#10b981'}`, color:toast.startsWith('✕')?'#991b1b':'#065f46', borderRadius:'12px', padding:'12px 20px', fontSize:'13px', fontWeight:'600', boxShadow:'0 4px 20px rgba(0,0,0,0.12)', maxWidth:'380px' }}>
          {toast}
        </div>
      )}

      {/* ── Overview KPIs ─────────────────────────────────────────────────── */}
      {overview && (
        <div style={s.kpiRow}>
          {[
            { label:'Total Tasks',   value:overview.total,       color:'#0891b2'  },
            { label:'In Progress',   value:overview.in_progress, color:'#7c3aed'  },
            { label:'P1 Open',       value:overview.p1_open,     color:'#ef4444'  },
            { label:'Overdue',       value:overview.overdue,     color:'#f97316'  },
            { label:'Unassigned',    value:overview.unassigned,  color:'#f59e0b'  },
            { label:'Completed',     value:overview.completed,   color:'#10b981'  },
          ].map(({ label, value, color }) => (
            <div key={label} style={s.kpi}>
              <span style={s.kpiLabel}>{label}</span>
              <span style={{ fontSize:'30px', fontWeight:'800', color, lineHeight:1 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
        {/* Search */}
        <div style={{ position:'relative', flex:1, minWidth:'200px' }}>
          <svg style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search tasks, IDs, assignees, tags…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...s.inp, paddingLeft:'36px' }} />
        </div>

        {/* Status filter */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.sel}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="blocked">Blocked</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {/* Priority filter */}
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)} style={s.sel}>
          <option value="all">All Priorities</option>
          <option value="P1">P1 — Critical</option>
          <option value="P2">P2 — High</option>
          <option value="P3">P3 — Medium</option>
          <option value="P4">P4 — Low</option>
        </select>

        {/* Assignee filter */}
        <select value={filterAssign} onChange={e => setFilterAssign(e.target.value)} style={s.sel}>
          <option value="all">All Assignees</option>
          <option value="mine">Assigned by Me</option>
          <option value="unassigned">Unassigned</option>
        </select>

        <button onClick={fetchAll} style={s.outlineBtn}>↻ Refresh</button>
        <button onClick={() => setShowCreate(true)} style={s.primaryBtn}>
          + Assign New Task
        </button>
      </div>

      {/* ── Task Table ────────────────────────────────────────────────────── */}
      <div style={s.panel}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${dm?'#334155':'#e5e7eb'}` }}>
                {['ID','Title','Category','Priority','Assigned To','Due','Status','Actions'].map(col => (
                  <th key={col} style={s.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding:'40px', textAlign:'center', color:dm?'#64748b':'#9ca3af' }}>Loading tasks…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding:'40px', textAlign:'center', color:dm?'#64748b':'#9ca3af' }}>No tasks match the current filters</td></tr>
              ) : filtered.map((task, i, arr) => {
                const overdue   = isOverdue(task)
                const isExpanded = expandedId === task.id
                return (
                  <>
                    <tr key={task.id}
                      onClick={() => setExpandedId(isExpanded ? null : task.id)}
                      style={{ borderBottom: isExpanded ? 'none' : (i < arr.length - 1 ? `1px solid ${dm?'#1e293b':'#f3f4f6'}` : 'none'), cursor:'pointer', background: isExpanded ? (dm?'rgba(8,145,178,0.06)':'rgba(207,250,254,0.3)') : (overdue && task.status !== 'completed' ? (dm?'rgba(239,68,68,0.05)':'rgba(254,226,226,0.3)') : 'transparent') }}>
                      <td style={{ ...s.td, fontFamily:'monospace', fontSize:'11px', color:dm?'#93c5fd':'#0891b2', fontWeight:'700', whiteSpace:'nowrap' }}>
                        {task.id}
                      </td>
                      <td style={{ ...s.td, maxWidth:'220px' }}>
                        <div style={{ fontWeight:'600', color:dm?'#f1f5f9':'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</div>
                        {task.tags?.length > 0 && (
                          <div style={{ display:'flex', gap:'3px', marginTop:'3px', flexWrap:'wrap' }}>
                            {task.tags.slice(0,3).map(tag => (
                              <span key={tag} style={{ fontSize:'10px', padding:'1px 6px', borderRadius:'3px', background:dm?'#334155':'#f3f4f6', color:dm?'#94a3b8':'#6b7280' }}>#{tag}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'4px', background:dm?'#1e293b':'#f3f4f6', color:dm?'#94a3b8':'#374151', border:`1px solid ${dm?'#334155':'#e5e7eb'}`, whiteSpace:'nowrap' }}>
                          {task.category}
                        </span>
                      </td>
                      <td style={s.td}><PriDot priority={task.priority} /></td>
                      <td style={{ ...s.td, whiteSpace:'nowrap' }}>
                        {task.assigned_to_email ? (
                          <div>
                            <div style={{ fontSize:'13px', fontWeight:'600', color:dm?'#f1f5f9':'#111827' }}>{task.assigned_to_name || task.assigned_to_email}</div>
                            <div style={{ fontSize:'11px', color:dm?'#64748b':'#9ca3af' }}>{task.assigned_to_email}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize:'12px', color:'#f59e0b', fontWeight:'600', padding:'2px 8px', borderRadius:'4px', background:'#fef3c7', border:'1px solid #fde68a' }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ ...s.td, whiteSpace:'nowrap' }}>
                        {task.due_date ? (
                          <div>
                            <div style={{ fontSize:'12px', color: overdue && task.status !== 'completed' ? '#ef4444' : (dm?'#94a3b8':'#6b7280'), fontWeight: overdue?'700':'400' }}>
                              {daysUntil(task.due_date)}
                            </div>
                            <div style={{ fontSize:'11px', color:dm?'#64748b':'#9ca3af' }}>{fmtDate(task.due_date).slice(0,9)}</div>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={s.td}>
                        <div style={{ display:'flex', flexDirection:'column', gap:'4px', alignItems:'flex-start' }}>
                          <StatusBadge status={task.status} />
                          {task.completed_at && (
                            <span style={{ fontSize:'10px', color:dm?'#64748b':'#9ca3af' }}>{fmtDate(task.completed_at)}</span>
                          )}
                        </div>
                      </td>
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                          <button onClick={() => setEditTask(task)} style={{ ...s.actionBtn, color:'#0891b2', borderColor:'#0891b2' }}>Edit</button>
                          <button onClick={() => setReassignTask(task)} style={{ ...s.actionBtn, color:'#7c3aed', borderColor:'#7c3aed' }}>Reassign</button>
                          {task.status !== 'completed' && task.status !== 'cancelled' && (
                            <button onClick={() => handleStatusChange(task, 'completed')} style={{ ...s.actionBtn, color:'#10b981', borderColor:'#10b981' }}>✓ Done</button>
                          )}
                          <button onClick={() => handleDelete(task)} style={{ ...s.actionBtn, color:'#ef4444', borderColor:'#ef4444' }}>Delete</button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded detail row ── */}
                    {isExpanded && (
                      <tr key={`${task.id}-detail`} style={{ borderBottom:`1px solid ${dm?'#334155':'#e5e7eb'}` }}>
                        <td colSpan={8} style={{ padding:'0 14px 16px' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                            <div style={{ background:dm?'#0f172a':'#f8fafc', borderRadius:'10px', padding:'14px 16px', border:`1px solid ${dm?'#1e293b':'#e5e7eb'}` }}>
                              <div style={{ fontSize:'11px', fontWeight:'700', color:dm?'#64748b':'#9ca3af', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'8px' }}>Description</div>
                              <p style={{ fontSize:'13px', color:dm?'#94a3b8':'#374151', lineHeight:'1.7', margin:0 }}>{task.description || '—'}</p>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                              {task.admin_notes && (
                                <div style={{ background:dm?'#082f49':'#ecfeff', borderRadius:'10px', padding:'12px 14px', border:`1px solid ${dm?'#164e63':'#cffafe'}` }}>
                                  <div style={{ fontSize:'11px', fontWeight:'700', color:'#0891b2', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'6px' }}>Admin Notes</div>
                                  <p style={{ fontSize:'13px', color:dm?'#67e8f9':'#155e75', lineHeight:'1.6', margin:0 }}>{task.admin_notes}</p>
                                </div>
                              )}
                              {task.technician_notes && (
                                <div style={{ background:dm?'#0d2a0d':'#f0fdf4', borderRadius:'10px', padding:'12px 14px', border:`1px solid ${dm?'#065f46':'#bbf7d0'}` }}>
                                  <div style={{ fontSize:'11px', fontWeight:'700', color:'#16a34a', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'6px' }}>Technician Notes</div>
                                  <p style={{ fontSize:'13px', color:dm?'#86efac':'#166534', lineHeight:'1.6', margin:0 }}>{task.technician_notes}</p>
                                </div>
                              )}
                              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                                <span style={{ fontSize:'12px', color:dm?'#64748b':'#9ca3af' }}>Created: {fmtDate(task.created_at)}</span>
                                {task.assigned_by_name && (
                                  <span style={{ fontSize:'12px', color:dm?'#64748b':'#9ca3af' }}>· By: {task.assigned_by_name}</span>
                                )}
                              </div>
                              {/* Quick status actions */}
                              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                                {['pending','in_progress','blocked','completed','cancelled'].map(st => (
                                  <button key={st}
                                    onClick={() => handleStatusChange(task, st)}
                                    disabled={task.status === st}
                                    style={{ padding:'4px 12px', borderRadius:'6px', fontSize:'11px', fontWeight:'700', cursor:task.status===st?'default':'pointer', opacity:task.status===st?0.5:1, background:(STATUS_STYLE[st]?.bg||'#f3f4f6'), color:(STATUS_STYLE[st]?.color||'#374151'), border:`1px solid ${STATUS_STYLE[st]?.border||'#d1d5db'}` }}>
                                    → {STATUS_STYLE[st]?.label||st}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Technician workload summary */}
      {technicians.length > 0 && (
        <div style={s.panel}>
          <h3 style={{ fontSize:'14px', fontWeight:'700', color:dm?'#f1f5f9':'#111827', margin:'0 0 16px 0' }}>Technician Workload</h3>
          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
            {technicians.map(tech => {
              const myTasks   = tasks.filter(t => t.assigned_to_email === tech.email && t.status !== 'completed' && t.status !== 'cancelled')
              const p1Count   = myTasks.filter(t => t.priority === 'P1').length
              const blocked   = myTasks.filter(t => t.status === 'blocked').length
              const overdueCt = myTasks.filter(isOverdue).length
              return (
                <div key={tech.id} style={{ flex:'1', minWidth:'180px', padding:'16px', background:dm?'#0f172a':'#f8fafc', borderRadius:'12px', border:`1px solid ${dm?'#334155':'#e5e7eb'}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                    <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:'linear-gradient(135deg,#0891b2,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:'700', color:'white', flexShrink:0 }}>
                      {`${tech.first_name?.[0]||''}${tech.surname?.[0]||''}`.toUpperCase()}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:'13px', fontWeight:'700', color:dm?'#f1f5f9':'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tech.first_name} {tech.surname}</div>
                      <div style={{ fontSize:'11px', color:dm?'#64748b':'#9ca3af' }}>{tech.email}</div>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                    <div style={{ textAlign:'center', padding:'8px', background:dm?'#1e293b':'white', borderRadius:'8px', border:`1px solid ${dm?'#334155':'#e5e7eb'}` }}>
                      <div style={{ fontSize:'20px', fontWeight:'800', color:'#0891b2' }}>{myTasks.length}</div>
                      <div style={{ fontSize:'10px', color:dm?'#64748b':'#9ca3af', fontWeight:'600', textTransform:'uppercase' }}>Active</div>
                    </div>
                    <div style={{ textAlign:'center', padding:'8px', background:dm?'#1e293b':'white', borderRadius:'8px', border:`1px solid ${p1Count>0?'#ef4444':(dm?'#334155':'#e5e7eb')}` }}>
                      <div style={{ fontSize:'20px', fontWeight:'800', color:p1Count>0?'#ef4444':dm?'#64748b':'#9ca3af' }}>{p1Count}</div>
                      <div style={{ fontSize:'10px', color:dm?'#64748b':'#9ca3af', fontWeight:'600', textTransform:'uppercase' }}>P1</div>
                    </div>
                    {overdueCt > 0 && (
                      <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'5px', background:'#fee2e2', borderRadius:'6px', fontSize:'11px', color:'#ef4444', fontWeight:'700' }}>
                        ⚠ {overdueCt} overdue
                      </div>
                    )}
                    {blocked > 0 && (
                      <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'5px', background:'#fef3c7', borderRadius:'6px', fontSize:'11px', color:'#92400e', fontWeight:'700' }}>
                        🚧 {blocked} blocked
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <TaskModal technicians={technicians} currentUser={currentUser} dm={dm}
          onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); fetchAll(); flash('✓ Task created and assigned') }} />
      )}
      {editTask && (
        <TaskModal task={editTask} technicians={technicians} currentUser={currentUser} dm={dm}
          onClose={() => setEditTask(null)} onSaved={() => { setEditTask(null); fetchAll(); flash('✓ Task updated') }} />
      )}
      {reassignTask && (
        <ReassignModal task={reassignTask} technicians={technicians} currentUser={currentUser} dm={dm}
          onClose={() => setReassignTask(null)} onSaved={() => { setReassignTask(null); fetchAll(); flash('✓ Task reassigned') }} />
      )}
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(dm) {
  return {
    kpiRow:    { display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'14px' },
    kpi:       { background:dm?'#1e293b':'white', borderRadius:'14px', padding:'18px 20px', display:'flex', flexDirection:'column', gap:'8px', border:`1px solid ${dm?'#334155':'#f3f4f6'}`, boxShadow:dm?'none':'0 1px 3px rgba(0,0,0,0.06)' },
    kpiLabel:  { fontSize:'11px', fontWeight:'700', letterSpacing:'0.8px', textTransform:'uppercase', color:dm?'#64748b':'#9ca3af' },
    panel:     { background:dm?'#1e293b':'white', borderRadius:'14px', padding:'20px 24px', border:`1px solid ${dm?'#334155':'#f3f4f6'}`, boxShadow:dm?'none':'0 1px 3px rgba(0,0,0,0.06)' },
    th:        { textAlign:'left', padding:'10px 14px', fontSize:'11px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.7px', color:dm?'#64748b':'#9ca3af', whiteSpace:'nowrap' },
    td:        { padding:'13px 14px', fontSize:'13px', color:dm?'#94a3b8':'#6b7280', verticalAlign:'top' },
    inp:       { width:'100%', padding:'9px 13px', border:`1px solid ${dm?'#334155':'#e5e7eb'}`, borderRadius:'9px', fontSize:'14px', color:dm?'#f1f5f9':'#111827', background:dm?'#1e293b':'white', outline:'none', boxSizing:'border-box' },
    sel:       { padding:'9px 13px', border:`1px solid ${dm?'#334155':'#e5e7eb'}`, borderRadius:'9px', fontSize:'13px', color:dm?'#f1f5f9':'#374151', background:dm?'#1e293b':'white', outline:'none', cursor:'pointer' },
    primaryBtn:{ padding:'9px 20px', background:'#0891b2', color:'white', border:'none', borderRadius:'9px', fontSize:'13px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' },
    outlineBtn:{ padding:'9px 16px', background:'transparent', color:dm?'#94a3b8':'#374151', border:`1px solid ${dm?'#334155':'#e5e7eb'}`, borderRadius:'9px', fontSize:'13px', fontWeight:'600', cursor:'pointer', whiteSpace:'nowrap' },
    actionBtn: { padding:'4px 11px', borderRadius:'7px', border:'1px solid', background:'transparent', fontSize:'11px', fontWeight:'600', cursor:'pointer', whiteSpace:'nowrap' },
  }
}
