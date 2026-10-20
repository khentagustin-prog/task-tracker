import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import BoardModal, { BOARD_COLORS } from './BoardModal.jsx'
import TaskModal from './TaskModal.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import DuplicateModal from './DuplicateModal.jsx'
import { shiftDate } from './dates.js'
import AccessGate from './AccessGate.jsx'
import { setKey, clearKey } from './auth.js'
import Automation from './Automation.jsx'
import Archive from './Archive.jsx'
import Dashboard from './Dashboard.jsx'
import Settings from './Settings.jsx'
import { deleteFile, uploadFile, filesEnabled } from './files.js'
import { FilePopover, FilePreview } from './Files.jsx'
import TopBar from './TopBar.jsx'
import Drawer, { tagColor } from './Drawer.jsx'

const DEFAULT_STATUSES = [
  { id: 'todo', label: 'To Do', color: '#98a2b3' },
  { id: 'working', label: 'Working on it', color: '#f79009' },
  { id: 'stuck', label: 'Stuck', color: '#f04438' },
  { id: 'review', label: 'Review', color: '#7a5af8' },
  { id: 'done', label: 'Done', color: '#12b76a' },
]
const PRIORITIES = [
  { id: 'low', label: 'Low', color: '#579bfc' },
  { id: 'medium', label: 'Medium', color: '#5559df' },
  { id: 'high', label: 'High', color: '#a25ddc' },
  { id: 'critical', label: 'Critical', color: '#bb3354' },
]
const GROUP_COLORS = ['#155eef', '#12b76a', '#7a5af8', '#f79009', '#f04438', '#06aed4']
const byId = (list, id) => list.find((x) => x.id === id) || list[0]
const allFiles = (t) => [...(t.attachments || []), ...(t.subtasks || []).flatMap((x) => x.attachments || [])]
const LABEL_COLORS = { 'warm up text': '#7fb0c5', 'dynamic call': '#4a6fa5', 'special text': '#5bbcf0', 'call reminder': '#f26d6d', 'text reminder': '#f29c9c' }
const labelColor = (n) => LABEL_COLORS[n.trim().toLowerCase()] || ['#6c8ebf', '#8e7cc3', '#6aa84f', '#c27ba0', '#e69138', '#45818e'][[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 6]
const initials = (n) => n.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const fmtTime = (v) => { if (!v) return null; const [h, m] = v.split(':').map(Number); return [`${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`, h >= 12 ? 'PM' : 'AM'] }
const today = () => new Date().toISOString().slice(0, 10)

function Pill({ list, value, onChange }) {
  const o = byId(list, value)
  return (
    <select className="pill" style={{ background: o.color }} value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
    </select>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="stat" style={{ '--c': color }}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function Main() {
  const [allTasks, setTasks] = useState([])
  const tasks = useMemo(() => allTasks.filter((t) => !t.archived), [allTasks])
  const archived = useMemo(() => allTasks.filter((t) => t.archived), [allTasks])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(() => {
    try { return new URLSearchParams(location.search).get('view') || localStorage.getItem('view-v2') || 'dashboard' } catch { return 'dashboard' }
  })
  useEffect(() => { try { localStorage.setItem('view-v2', view) } catch {} }, [view])
  const [group, setGroup] = useState('Main')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [collapsed, setCollapsed] = useState({})
  const [sort, setSort] = useState('created')
  const [status, setStatus] = useState('todo')
  const [showAdd, setShowAdd] = useState(false)
  const [board, setBoard] = useState(() => { try { return new URLSearchParams(location.search).get('board') || localStorage.getItem('board-v1') || 'all' } catch { return 'all' } })
  useEffect(() => { try { localStorage.setItem('board-v1', board) } catch {} }, [board])
  const [openId, setOpenId] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [addGroup, setAddGroup] = useState(null)
  const [addSection, setAddSection] = useState(null)
  const [sections, setSections] = useState({})
  const [focusGroup, setFocusGroup] = useState(null)
  const [delSec, setDelSec] = useState(null)
  const [secBusy, setSecBusy] = useState(false)
  const [sel, setSel] = useState({})
  const [upBusy, setUpBusy] = useState({})
  const [moveOpen, setMoveOpen] = useState(false)
  const [dup, setDup] = useState(null)
  const [subMenu, setSubMenu] = useState(null)
  const [pop, setPop] = useState(null)
  const [preview, setPreview] = useState(null)
  const popTimer = useRef()
  const openPop = (id, e, pin, sid) => {
    clearTimeout(popTimer.current)
    const r = e.currentTarget.getBoundingClientRect()
    setPop((p) => ({ id, sid, x: r.right, y: r.bottom + 6, pinned: !!pin || (p?.id === id && p.sid === sid && p.pinned) }))
  }
  const leavePop = () => { clearTimeout(popTimer.current); popTimer.current = setTimeout(() => setPop((p) => (p && p.pinned ? p : null)), 220) }
  useEffect(() => { const c = () => { setPop(null); setSubMenu(null) }; window.addEventListener('click', c); return () => window.removeEventListener('click', c) }, [])
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [ownerEdit, setOwnerEdit] = useState(null)
  const [theme, setTheme] = useState(() => { try { return new URLSearchParams(location.search).get('theme') || localStorage.getItem('theme-v1') || 'dark' } catch { return 'dark' } })
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('theme-v1', theme) } catch {} }, [theme])
  const [extra, setExtra] = useState(() => { try { return JSON.parse(localStorage.getItem('boards-v1')) || [] } catch { return [] } })
  useEffect(() => { try { localStorage.setItem('boards-v1', JSON.stringify(extra)) } catch {} }, [extra])
  const [showBoard, setShowBoard] = useState(false)
  const [colors, setColors] = useState(() => { try { return JSON.parse(localStorage.getItem('board-colors-v1')) || {} } catch { return {} } })
  useEffect(() => { try { localStorage.setItem('board-colors-v1', JSON.stringify(colors)) } catch {} }, [colors])
  const colorOf = (g, i = 0) => colors[g] || BOARD_COLORS[i % BOARD_COLORS.length]
  const createBoard = (name, color) => {
    setExtra((e) => (e.includes(name) ? e : [...e, name])); setColors((c) => ({ ...c, [name]: color }))
    setBoard(name); setGroup(name); setShowBoard(false)
  }
  const leaveSettings = () => setView('table')
  const pickBoard = (b) => { leaveSettings(); setBoard(b); setGroup(b === 'all' ? 'Main' : b); setQ('') }
  const [error, setError] = useState('')
  const [statuses, setStatuses] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('statuses-v1'))
      if (Array.isArray(v) && v.some((x) => x.id === 'todo') && v.some((x) => x.id === 'done')) return v
    } catch {}
    return DEFAULT_STATUSES
  })
  useEffect(() => { try { localStorage.setItem('statuses-v1', JSON.stringify(statuses)) } catch {} }, [statuses])
  const STATUSES = statuses
  // Settings: naka-save sa Supabase (via n8n); localStorage ang mabilis na cache.
  const [settingsReady, setSettingsReady] = useState(false)
  useEffect(() => {
    api.getSettings().then((cfg) => {
      if (Array.isArray(cfg.statuses) && cfg.statuses.some((x) => x.id === 'todo') && cfg.statuses.some((x) => x.id === 'done')) setStatuses(cfg.statuses)
      if (cfg.boards) { setExtra(cfg.boards.extra || []); setColors(cfg.boards.colors || {}); setSections(cfg.boards.sections || {}) }
      setSettingsReady(true)
    }).catch((e) => setError(`Settings not synced: ${e.message}`))
  }, [])
  useEffect(() => {
    if (!settingsReady) return
    const t = setTimeout(() => api.saveSetting('statuses', statuses).catch((e) => setError(e.message)), 400)
    return () => clearTimeout(t)
  }, [statuses, settingsReady])
  useEffect(() => {
    if (!settingsReady) return
    const t = setTimeout(() => api.saveSetting('boards', { extra, colors, sections }).catch((e) => setError(e.message)), 400)
    return () => clearTimeout(t)
  }, [extra, colors, sections, settingsReady])

  const tasksRef = useRef([])
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  const setT = (next) => { tasksRef.current = next; setTasks(next) }
  const refresh = () => api.list().then((list) => { if (pending.current === 0) setT(list) }).catch((e) => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  const run = async (fn) => { try { setError(''); await fn(); await refresh() } catch (e) { setError(e.message) } }
  const createTask = async (task) => {
    const sec = board === 'all' ? null : (addSection ?? Object.keys(groups)[0] ?? null)
    const payload = sec && sec !== board ? { ...task, section: sec } : task // walang section = default group
    await run(() => api.create(payload))
    setShowAdd(false); setStatus('todo'); setAddGroup(null); setAddSection(null)
  }
  const PR = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorter = (a, b) => sort === 'due' ? (a.due_date || '9999').localeCompare(b.due_date || '9999') : sort === 'priority' ? PR[a.priority] - PR[b.priority] : (a.created_at || '').localeCompare(b.created_at || '')
  // Laging nasa pinakabagong kopya ang edit, at sunud-sunod ang pag-save para walang nabubura.
  const patch = (id, p) => {
    setT(tasksRef.current.map((t) => (t.id === id ? { ...t, ...p } : t)))
    pending.current++
    queue.current = queue.current
      .then(() => api.update(id, p))
      .catch((e) => setError(`Hindi na-save: ${e.message}`))
      .finally(() => { pending.current--; if (pending.current === 0) refresh() })
  }

  const actions = {
    askDuplicateBoard: (g) => setDup({ kind: 'board', name: g }),
    recolorBoard: (g, c) => setColors((x) => ({ ...x, [g]: c })),
    renameBoard: async (old, name) => {
      await run(() => Promise.all(allTasks.filter((t) => (t.group_name || 'Main') === old).map((t) => api.update(t.id, { group_name: name }))))
      setExtra((e) => [...e.filter((x) => x !== old), name])
      setSections((x) => { const { [old]: v, ...rest } = x; return v ? { ...rest, [name]: v } : rest })
      setColors((c) => { const { [old]: col, ...rest } = c; return col ? { ...rest, [name]: col } : rest })
      if (board === old) setBoard(name)
    },
    deleteBoard: async (name) => {
      const mine = allTasks.filter((t) => (t.group_name || 'Main') === name)
      await run(async () => {
        await Promise.all(mine.flatMap((t) => allFiles(t).map((f) => deleteFile(f.path).catch(() => {}))))
        await Promise.all(mine.map((t) => api.remove(t.id)))
      })
      setExtra((e) => e.filter((x) => x !== name))
      setSections((x) => { const { [name]: _, ...rest } = x; return rest })
      setColors((c) => { const { [name]: _, ...rest } = c; return rest })
      if (board === name) pickBoard('all')
    },
    addStatus: (label, color) => setStatuses((x) => [...x, { id: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 5)}`, label, color }]),
    updateStatus: (id, p) => setStatuses((x) => x.map((s) => (s.id === id ? { ...s, ...p } : s))),
    moveStatus: (id, d) => setStatuses((x) => {
      const i = x.findIndex((s) => s.id === id), j = i + d
      if (j < 0 || j >= x.length) return x
      const c = [...x]; [c[i], c[j]] = [c[j], c[i]]; return c
    }),
    deleteStatus: async (id) => {
      await run(() => Promise.all(tasks.filter((t) => t.status === id).map((t) => api.update(t.id, { status: 'todo' }))))
      setStatuses((x) => x.filter((s) => s.id !== id))
      if (filter === id) setFilter('all')
    },
  }

  const uploadRow = async (t, list) => {
    setUpBusy((b) => ({ ...b, [t.id]: true }))
    try {
      const added = []
      for (const f of list) added.push(await uploadFile(t.id, f))
      const cur = tasksRef.current.find((x) => x.id === t.id) || t
      patch(t.id, { attachments: [...(cur.attachments || []), ...added] })
    } catch (e) { setError(e.message) } finally { setUpBusy((b) => ({ ...b, [t.id]: false })) }
  }
  const uploadSub = async (t, x, list) => {
    setUpBusy((b) => ({ ...b, [x.id]: true }))
    try {
      const added = []
      for (const f of list) added.push(await uploadFile(t.id, f))
      const cur = (tasksRef.current.find((q) => q.id === t.id)?.subtasks || []).find((q) => q.id === x.id) || x
      editSub(t, x.id, { attachments: [...(cur.attachments || []), ...added] })
    } catch (e) { setError(e.message) } finally { setUpBusy((b) => ({ ...b, [x.id]: false })) }
  }
  const subs = (t) => t.subtasks || []
  const latest = (t) => subs(tasksRef.current.find((x) => x.id === t.id) || t)
  const addSub = (t, title) => patch(t.id, { subtasks: [...latest(t), { id: crypto.randomUUID(), title, status: 'todo', due_date: null }] })
  const editSub = (t, sid, p) => patch(t.id, { subtasks: latest(t).map((x) => (x.id === sid ? { ...x, ...p } : x)) })
  const delSub = (t, sid) => {
    const gone = latest(t).find((x) => x.id === sid)
    ;(gone?.attachments || []).forEach((f) => deleteFile(f.path).catch(() => {}))
    patch(t.id, { subtasks: latest(t).filter((x) => x.id !== sid) })
  }

  const cloneTask = (t, o) => ({
    id: crypto.randomUUID(), title: t.title, status: o.reset ? 'todo' : t.status, priority: t.priority, group_name: o.group_name,
    due_date: shiftDate(t.due_date, o.n, o.unit) || null, notes: o.notes ? (t.notes || '') : '', tags: t.tags || [], attachments: [],
    subtasks: o.subs ? (t.subtasks || []).map((x) => ({ ...x, id: crypto.randomUUID(), status: o.reset ? 'todo' : x.status, due_date: shiftDate(x.due_date, o.n, o.unit) || null, attachments: [] })) : [],
    ...(o.section && o.section !== o.group_name ? { section: o.section } : {}),
  })
  const visible = useMemo(() => tasks.filter((t) =>
    (board === 'all' || (t.group_name || 'Main') === board) && (filter === 'all' || t.status === filter) && t.title.toLowerCase().includes(q.toLowerCase())).sort(sorter), [tasks, q, filter, sort, board])

  const groups = useMemo(() => {
    const m = {}
    if (board === 'all') { visible.forEach((t) => (m[t.group_name || 'Main'] ||= []).push(t)); return m }
    ;(sections[board] || []).forEach((x) => { m[x.name] = [] })
    visible.forEach((t) => (m[t.section || board] ||= []).push(t))
    if (!(sections[board] || []).length && !(board in m)) m[board] = []
    return m
  }, [visible, board, sections])
  const allGroups = [...new Set(['Main', ...extra, ...tasks.map((t) => t.group_name || 'Main')])]
  const gColor = (g) => (board === 'all' ? colorOf(g, allGroups.indexOf(g)) : ((sections[board] || []).find((x) => x.name === g)?.color || colorOf(board)))
  const saveSections = (list) => setSections((x) => ({ ...x, [board]: list }))
  const currentList = (over = {}) => Object.keys(groups).map((n) => ({ name: over.rename?.[0] === n ? over.rename[1] : n, color: over.color?.[0] === n ? over.color[1] : gColor(n) }))
  const addSectionGroup = () => {
    let name = 'New group', i = 2
    while (name in groups) name = `New group ${i++}`
    saveSections([...currentList(), { name, color: BOARD_COLORS[Object.keys(groups).length % BOARD_COLORS.length] }])
    setFocusGroup(name)
  }
  const renameSection = (old, name) => {
    name = name.trim()
    if (!name || name === old) return
    if (name in groups) { setError(`May group na "${name}".`); return }
    tasks.filter((t) => (t.group_name || 'Main') === board && (t.section || board) === old).forEach((t) => patch(t.id, { section: name }))
    saveSections(currentList({ rename: [old, name] }))
  }
  useEffect(() => { if (!loading && settingsReady && board !== 'all' && !allGroups.includes(board)) setBoard('all') }, [loading, settingsReady, board, allGroups.join('|')])
  const inBoard = board === 'all' ? tasks : tasks.filter((t) => (t.group_name || 'Main') === board)

  const done = inBoard.filter((t) => t.status === 'done').length
  const overdue = inBoard.filter((t) => t.due_date && t.due_date < today() && t.status !== 'done').length
  const active = inBoard.filter((t) => ['working', 'review'].includes(t.status)).length
  const pct = inBoard.length ? Math.round((done / inBoard.length) * 100) : 0

  return (
    <div className="shell">
      <TopBar />
      <aside>
        <div className="logo"><span>✓</span> TaskFlow</div>
        <div className="side-search">
          <span>⌕</span>
          <input placeholder="Search tasks" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value && view !== 'table') setView('table') }} />
          {q && <button title="Clear" onClick={() => setQ('')}>✕</button>}
        </div>
        <div className="side-label">Workspace</div>
        <nav>
          <button className={view === 'dashboard' ? 'on' : ''} onClick={() => setView('dashboard')}>◔ Dashboard</button>
          <button className={view === 'automation' ? 'on' : ''} onClick={() => setView('automation')}>⚡ Automation</button>
          <button className={view === 'archive' ? 'on' : ''} onClick={() => setView('archive')}>▤ Archive<em>{archived.length}</em></button>
        </nav>
        <div className="side-label">Boards</div>
        <nav>
          <button className={board === 'all' ? 'on' : ''} onClick={() => pickBoard('all')}>◎ All tasks<em>{tasks.length}</em></button>
          {allGroups.map((g, i) => (
            <button key={g} className={board === g ? 'on' : ''} onClick={() => pickBoard(g)}>
              <i style={{ background: colorOf(g, i) }} /> {g}
              <em>{tasks.filter((t) => (t.group_name || 'Main') === g).length}</em>
            </button>
          ))}
          <button className="newb" onClick={() => setShowBoard(true)}>+ New board</button>
        </nav>
        <button className="settings-btn theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}</button>
        <button className={`settings-btn ${view === 'settings' ? 'on' : ''}`} onClick={() => setView('settings')}>⚙ Settings</button>
        <div className="mode">● {api.mode === 'n8n' ? 'Synced via n8n' : 'Local only'}</div>
      </aside>

      <main>
        {view === 'dashboard' ? (
          <Dashboard tasks={tasks} statuses={statuses} boards={allGroups} colorOf={colorOf} onOpenTask={setOpenId} onOpenBoard={(b) => pickBoard(b)} />
        ) : view === 'automation' ? (
          <Automation boards={allGroups} onCreate={async (task) => { await run(() => api.create(task)) }} onOpenBoard={(b) => pickBoard(b)} />
        ) : view === 'archive' ? (
          <Archive items={archived} statuses={statuses} colorOf={colorOf} onOpen={setOpenId}
            onRestore={(t) => patch(t.id, { archived: false })}
            onDelete={async (t) => { await Promise.all(allFiles(t).map((f) => deleteFile(f.path).catch(() => {}))); await run(() => api.remove(t.id)) }} />
        ) : view === 'settings' ? (
          <Settings boards={allGroups} tasks={tasks} statuses={statuses} colorOf={colorOf} actions={actions} />
        ) : (<>
        <div className="top">
          <div>
            <h1>{board === 'all' ? 'All Tasks' : board}</h1>
            <p className="muted">{done} of {inBoard.length} done · {overdue} overdue · {pct}% complete</p>
          </div>
        </div>

        <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
          <div className="tools">
            <label>Filter <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All</option>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="created">Newest</option><option value="due">Due date</option><option value="priority">Priority</option></select></label>
          </div>
        </div>

        {error && <div className="error">⚠ {error}</div>}

        {loading ? <div className="empty">Loading...</div> : view === 'table' ? (
          (board === 'all' && !visible.length) ? <div className="empty">Wala pang tasks. Gamitin ang “+ Add task” sa table.</div> :
          <>{Object.entries(groups).map(([g, items], i) => {
            const c = gColor(g)
            const open = !collapsed[g]
            return (
              <section key={g} className="group">
                <h2 style={{ color: c }}>
                  <span className={`caret ${open ? 'is-open' : ''}`} onClick={() => setCollapsed({ ...collapsed, [g]: open })}>⌄</span>
                  {board === 'all' ? <span onClick={() => setCollapsed({ ...collapsed, [g]: open })}>{g}</span> : (<>
                    <input className="gname" key={g} defaultValue={g} style={{ color: c }} autoFocus={focusGroup === g}
                      onFocus={(e) => { if (focusGroup === g) { e.target.select(); setFocusGroup(null) } }}
                      onBlur={(e) => renameSection(g, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
                    <input type="color" className="gcolor" value={c} title="Group color" onChange={(e) => saveSections(currentList({ color: [g, e.target.value] }))} />
                  </>)}
                  <small>{items.length} {items.length === 1 ? 'Task' : 'Tasks'} / {items.reduce((n, t) => n + subs(t).length, 0)} Subitems</small>
                  {board !== 'all' && <button className="gdup" title="Duplicate group" onClick={() => setDup({ kind: 'group', name: g })}>⧉ Duplicate</button>}
                  {board !== 'all' && <button className="gdel" title="Delete group" onClick={() => setDelSec(g)}>✕</button>}
                </h2>
                {open && (
                  <div className="table" style={{ '--c': c }}>
                    <div className="row head">
                      <span className="c-check" />
                      <span style={{ gridColumn: '2 / 4' }}>Task</span><span>Due date</span><span>Status</span><span>Notes</span><span>Files</span></div>
                    {items.map((t) => {
                      const nFiles = (t.attachments || []).length
                      const nUpd = (t.updates || []).length
                      const late = t.due_date && t.due_date < today() && t.status !== 'done'
                      const isOpen = expanded[t.id] ?? new URLSearchParams(location.search).has('expand')
                      return (
                        <div key={t.id} className={`trow ${t.status === 'done' ? 'is-done' : ''}`}>
                          <div className={`row ${sel[t.id] ? 'selected' : ''}`}>
                            <span className="c-check"><input type="checkbox" checked={!!sel[t.id]} onChange={(e) => setSel({ ...sel, [t.id]: e.target.checked })} /></span>
                            <div className="c-title">
                              <button className={`chev ${isOpen ? 'open' : ''}`} onClick={() => setExpanded({ ...expanded, [t.id]: !isOpen })} title="Show details">›</button>
                              <input className="inline" key={t.id + t.title} defaultValue={t.title} onBlur={(e) => e.target.value !== t.title && patch(t.id, { title: e.target.value })} />
                              {subs(t).length > 0 && <span className="count" title="Subitems">{subs(t).length}</span>}
                            </div>
                            <button className="c-bubble" onClick={() => setOpenId(t.id)} title="Open notes and files">
                              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={nUpd ? '#2e90fa' : 'currentColor'} strokeWidth="1.7"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />{!nUpd && <path d="M12 9v6M9 12h6" />}</svg>
                              {nUpd > 0 && <b>{nUpd}</b>}
                            </button>
                            <label className={`c-date ${late ? 'late' : ''}`}>
                              {t.due_date ? new Date(t.due_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                              <input type="date" value={t.due_date || ''} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => patch(t.id, { due_date: e.target.value || null })} />
                            </label>
                            <Pill list={STATUSES} value={t.status} onChange={(v) => patch(t.id, { status: v })} />
                            {(t.notes || '').includes('\n')
                              ? <button className="inline cell-notes multi" title="May maraming linya ang notes. I-click para buksan." onClick={() => setOpenId(t.id)}>{(t.notes || '').split('\n').find((l) => l.trim()) || ''}<em>…</em></button>
                              : <input className="inline cell-notes" key={t.id + (t.notes || '').length} defaultValue={t.notes || ''} placeholder="Add notes"
                                  onChange={(e) => { e.target.dataset.dirty = '1' }}
                                  onBlur={(e) => e.target.dataset.dirty && e.target.value !== (t.notes || '') && patch(t.id, { notes: e.target.value })}
                                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />}
                            <div className="c-files">
                              {filesEnabled && <label className={`fup ${upBusy[t.id] ? 'busy' : ''}`} title="Upload file">{upBusy[t.id] ? '…' : '+'}
                                <input type="file" multiple hidden onChange={(e) => { uploadRow(t, [...e.target.files]); e.target.value = '' }} /></label>}
                              {nFiles > 0 && <button className="fcount" onMouseEnter={(e) => openPop(t.id, e)} onMouseLeave={leavePop} onClick={(e) => { e.stopPropagation(); openPop(t.id, e, true) }}>📎 {nFiles}</button>}
                            </div>
                          </div>
                          {isOpen && (
                            <div className="expand">
                              {!!(t.tags || []).length && <div className="chips">{t.tags.map((x) => <span key={x} className="chip" style={{ color: tagColor(x), background: tagColor(x) + '26' }}>{x}</span>)}</div>}
                              {t.notes && <p>{t.notes}</p>}
                              <div className="subs-wrap"><div className="subs" style={{ '--c': c }}>
                                <div className="srow shead"><span>Subitem</span><span>Label</span><span>Status</span><span>Owner</span><span>Date</span><span>Time</span><span>Notes</span><span>Files</span></div>
                                {subs(t).map((x) => {
                                  const tm = fmtTime(x.time)
                                  return (
                                    <div key={x.id} className={`srow ${x.status === 'done' ? 'is-done' : ''}`} onContextMenu={(e) => { e.preventDefault(); setSubMenu({ x: e.clientX, y: e.clientY, t, sid: x.id }) }}>
                                      <input className="inline" key={x.id + x.title} defaultValue={x.title} onBlur={(e) => e.target.value.trim() && e.target.value !== x.title && editSub(t, x.id, { title: e.target.value.trim() })} />
                                      <input className="lab-in" key={x.id + (x.label || '')} defaultValue={x.label || ''} style={x.label ? { background: labelColor(x.label) } : undefined}
                                        onBlur={(e) => e.target.value.trim() !== (x.label || '') && editSub(t, x.id, { label: e.target.value.trim() })} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
                                      <Pill list={STATUSES} value={x.status} onChange={(v) => editSub(t, x.id, { status: v })} />
                                      <div className="c-owner">
                                        {ownerEdit === x.id
                                          ? <input autoFocus defaultValue={x.owner || ''} placeholder="Name" onBlur={(e) => { editSub(t, x.id, { owner: e.target.value.trim() }); setOwnerEdit(null) }} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
                                          : <button className="avatar" title={x.owner || 'Set owner'} onClick={() => setOwnerEdit(x.id)}>
                                              {x.owner ? initials(x.owner) : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="9" r="3.5" /><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5" /></svg>}
                                            </button>}
                                      </div>
                                      <label className={`c-date ${x.due_date && x.due_date < today() && x.status !== 'done' ? 'late' : ''}`}>
                                        {x.due_date ? new Date(x.due_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                        <input type="date" value={x.due_date || ''} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => editSub(t, x.id, { due_date: e.target.value || null })} />
                                      </label>
                                      <label className="c-date">
                                        {tm && <>{tm[0]} <em className="ampm">{tm[1]}</em></>}
                                        <input type="time" value={x.time || ''} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => editSub(t, x.id, { time: e.target.value || null })} />
                                      </label>
                                      <input className="inline notes-in" key={x.id + (x.notes || '')} defaultValue={x.notes || ''} placeholder="" onBlur={(e) => e.target.value !== (x.notes || '') && editSub(t, x.id, { notes: e.target.value })} />
                                      <div className="c-files">
                                        {filesEnabled && <label className={`fup ${upBusy[x.id] ? 'busy' : ''}`} title="Upload file">{upBusy[x.id] ? '…' : '+'}
                                          <input type="file" multiple hidden onChange={(e) => { uploadSub(t, x, [...e.target.files]); e.target.value = '' }} /></label>}
                                        {(x.attachments || []).length > 0 && <button className="fcount" onMouseEnter={(e) => openPop(t.id, e, false, x.id)} onMouseLeave={leavePop}
                                          onClick={(e) => { e.stopPropagation(); openPop(t.id, e, true, x.id) }}>📎 {x.attachments.length}</button>}
                                      </div>
                                    </div>
                                  )
                                })}
                                <form className="srow sadd" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.sub.value.trim(); if (v) { addSub(t, v); e.target.reset() } }}>
                                  <input name="sub" className="inline" placeholder="+ Add subitem" autoComplete="off" />
                                </form>
                              </div></div>
                              <button className="open" onClick={() => setOpenId(t.id)}>Open notes, tags and files →</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div className="row addwrap">
                      <span className="c-check"><input type="checkbox" disabled /></span>
                      <button className="addrow" style={{ gridColumn: '2 / 8' }} onClick={() => { setStatus('todo'); if (board === 'all') setAddGroup(g); else setAddSection(g); setShowAdd(true) }}>+ Add task</button>
                    </div>
                    <div className="row foot">
                      <span style={{ gridColumn: '1 / 5' }} />
                      <span className="statbar">
                        {STATUSES.map((st) => { const n = items.filter((t) => t.status === st.id).length; return n ? <i key={st.id} title={`${st.label}: ${n}`} style={{ flex: n, background: st.color }} /> : null })}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            )
          })}
          {board !== 'all' && <button className="addgroup" onClick={addSectionGroup}>+ Add new group</button>}
          </>
        ) : null}
        </>)}
      </main>
      {Object.values(sel).some(Boolean) && (() => {
        const chosen = tasks.filter((t) => sel[t.id])
        const n = chosen.length
        const duplicate = async () => {
          await run(() => Promise.all(chosen.map((t) => api.create({
            title: `${t.title} (copy)`, status: t.status, priority: t.priority, group_name: t.group_name || 'Main', due_date: t.due_date,
            notes: t.notes || '', tags: t.tags || [], attachments: [], subtasks: (t.subtasks || []).map((x) => ({ ...x, id: crypto.randomUUID(), attachments: [] })),
            ...(t.section ? { section: t.section } : {}),
          }))))
          setSel({})
        }
        const exportCsv = () => {
          const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
          const rows = [['Title', 'Board', 'Group', 'Status', 'Priority', 'Due date', 'Notes', 'Subitems'],
            ...chosen.map((t) => [t.title, t.group_name || 'Main', t.section || '', (STATUSES.find((x) => x.id === t.status) || {}).label || t.status, t.priority, t.due_date || '', t.notes || '', (t.subtasks || []).length])]
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }))
          a.download = 'tasks.csv'; a.click(); URL.revokeObjectURL(a.href)
        }
        const moveTo = async (b) => {
          setMoveOpen(false)
          await run(() => Promise.all(chosen.map((t) => api.update(t.id, { group_name: b, section: null }))))
          setSel({})
        }
        return (
          <div className="selbar" onClick={(e) => e.stopPropagation()}>
            <span className="sel-n">{n}</span>
            <b className="sel-t">{n === 1 ? 'Task' : 'Tasks'} selected</b>
            <div className="sel-actions">
              <button onClick={duplicate}><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>Duplicate</button>
              <button onClick={exportCsv}><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>Export</button>
              <button onClick={() => { chosen.forEach((t) => patch(t.id, { archived: true })); setSel({}) }}><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" /></svg>Archive</button>
              <button onClick={() => setConfirmBulk(true)}><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>Delete</button>
              <div className="sel-move">
                <button onClick={() => setMoveOpen(!moveOpen)}><svg viewBox="0 0 24 24"><path d="M4 12h16M14 6l6 6-6 6" /></svg>Move to</button>
                {moveOpen && <div className="move-menu">{allGroups.map((b) => <button key={b} onClick={() => moveTo(b)}><i style={{ background: colorOf(b, allGroups.indexOf(b)) }} />{b}</button>)}</div>}
              </div>
            </div>
            <button className="sel-x" title="Clear selection" onClick={() => { setSel({}); setMoveOpen(false) }}>✕</button>
          </div>
        )
      })()}
      {confirmBulk && (() => {
        const ids = Object.keys(sel).filter((k) => sel[k]); const mine = tasks.filter((t) => ids.includes(t.id))
        return <ConfirmModal busy={bulkBusy} title={`Delete ${mine.length} task${mine.length === 1 ? '' : 's'}?`} message="Hindi na ito maibabalik pagkatapos."
          detail={<>{mine.slice(0, 4).map((t) => <b key={t.id}>{t.title}</b>)}{mine.length > 4 && <span>+{mine.length - 4} more</span>}</>}
          onClose={() => !bulkBusy && setConfirmBulk(false)}
          onConfirm={async () => {
            setBulkBusy(true)
            await run(async () => {
              await Promise.all(mine.flatMap((t) => allFiles(t).map((f) => deleteFile(f.path).catch(() => {}))))
              await Promise.all(mine.map((t) => api.remove(t.id)))
            })
            setSel({}); setBulkBusy(false); setConfirmBulk(false)
          }} />
      })()}
      {subMenu && (
        <div className="ctx" style={{ left: subMenu.x, top: subMenu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { delSub(subMenu.t, subMenu.sid); setSubMenu(null) }}>🗑 Delete subitem</button>
        </div>
      )}
      {pop && (() => {
        const t = tasks.find((x) => x.id === pop.id)
        const list = !t ? [] : pop.sid ? ((t.subtasks || []).find((x) => x.id === pop.sid)?.attachments || []) : (t.attachments || [])
        return t && list.length ? <FilePopover files={list} x={pop.x} y={pop.y} onPreview={(f) => { setPop(null); setPreview(f) }}
          onEnter={() => clearTimeout(popTimer.current)} onLeave={leavePop} /> : null
      })()}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
      {dup && (() => {
        const isGroup = dup.kind === 'group'
        const items = isGroup ? tasks.filter((t) => (t.group_name || 'Main') === board && (t.section || board) === dup.name) : tasks.filter((t) => (t.group_name || 'Main') === dup.name)
        return <DuplicateModal kind={dup.kind} source={dup.name} items={items} existing={isGroup ? Object.keys(groups) : allGroups} onClose={() => setDup(null)}
          onConfirm={async (o) => {
            await run(async () => {
              for (const t of items) await api.create(cloneTask(t, { ...o, group_name: isGroup ? board : o.name, section: isGroup ? o.name : t.section }))
            })
            if (isGroup) {
              const list = currentList(); const at = list.findIndex((x) => x.name === dup.name)
              list.splice(at + 1, 0, { name: o.name, color: gColor(dup.name) }); saveSections(list)
            } else {
              setExtra((e) => (e.includes(o.name) ? e : [...e, o.name]))
              setColors((c) => ({ ...c, [o.name]: colorOf(dup.name) }))
              setSections((x) => (x[dup.name] ? { ...x, [o.name]: x[dup.name].map((g) => ({ ...g, name: g.name === dup.name ? o.name : g.name })) } : x))
              setBoard(o.name); setView('table')
            }
            setDup(null)
          }} />
      })()}
      {delSec && (() => {
        const mine = tasks.filter((t) => (t.group_name || 'Main') === board && (t.section || board) === delSec)
        return <ConfirmModal busy={secBusy} title="Delete this group?" message={mine.length ? 'Mabubura ang group at lahat ng task nito. Hindi na ito maibabalik.' : 'Walang task sa group na ito.'}
          detail={<><b>{delSec}</b>{mine.length > 0 && <span>{mine.length} task{mine.length > 1 ? 's' : ''} will be deleted</span>}</>}
          onClose={() => !secBusy && setDelSec(null)}
          onConfirm={async () => {
            setSecBusy(true)
            await run(async () => {
              await Promise.all(mine.flatMap((t) => allFiles(t).map((f) => deleteFile(f.path).catch(() => {}))))
              await Promise.all(mine.map((t) => api.remove(t.id)))
            })
            saveSections(Object.keys(groups).filter((n) => n !== delSec).map((n) => ({ name: n, color: gColor(n) })))
            setSecBusy(false); setDelSec(null)
          }} />
      })()}
      {showAdd && <TaskModal statuses={STATUSES} priorities={PRIORITIES} groups={allGroups}
        initial={{ status, group_name: addGroup || (board === 'all' ? 'Main' : board) }} onCreate={createTask} onClose={() => { setShowAdd(false); setAddGroup(null); setAddSection(null) }} />}
      {showBoard && <BoardModal existing={allGroups} onCreate={createBoard} onClose={() => setShowBoard(false)} />}
      {allTasks.find((t) => t.id === openId) && (
        <Drawer task={allTasks.find((t) => t.id === openId)} statuses={STATUSES} priorities={PRIORITIES} groups={allGroups}
          onPatch={patch} onPreview={setPreview} onClose={() => setOpenId(null)} onDelete={(id) => { setOpenId(null); run(() => api.remove(id)) }} />
      )}
    </div>
  )
}

export default function App() {
  const [locked, setLocked] = useState(() => api.mode === 'n8n' && !api.hasKey())
  const [msg, setMsg] = useState('')
  const [round, setRound] = useState(0)
  useEffect(() => {
    const h = () => { clearKey(); setMsg('Mali ang access key. Subukan ulit.'); setLocked(true) }
    window.addEventListener('auth-failed', h)
    return () => window.removeEventListener('auth-failed', h)
  }, [])
  if (locked) return <AccessGate message={msg} onSubmit={(k) => { setKey(k); setMsg(''); setLocked(false); setRound((r) => r + 1) }} />
  return <Main key={round} />
}
