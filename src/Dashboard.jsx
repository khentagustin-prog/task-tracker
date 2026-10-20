import { useMemo, useState } from 'react'

const day = (d) => d.toISOString().slice(0, 10)
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return day(d) }
const pctOf = (n, t) => (t ? Math.round((n / t) * 100) : 0)
const fmtDate = (d) => new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`d-tile ${tone || ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <em>{sub}</em>}
    </div>
  )
}

function TaskList({ title, empty, items, statuses, onOpen }) {
  return (
    <section className="d-card">
      <h3>{title} <small>{items.length}</small></h3>
      {!items.length ? <p className="d-empty">{empty}</p> : (
        <ul className="d-list">
          {items.slice(0, 6).map((t) => {
            const st = statuses.find((s) => s.id === t.status) || statuses[0]
            return (
              <li key={t.id}>
                <button onClick={() => onOpen(t.id)}>
                  <span className="d-dot" style={{ background: st.color }} />
                  <span className="d-t">{t.title}</span>
                  <em>{t.group_name || 'Main'}</em>
                  <span className="d-date">{fmtDate(t.due_date)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function Dashboard({ tasks, statuses, boards, colorOf, onOpenTask, onOpenBoard }) {
  const [scope, setScope] = useState('all')
  const [tip, setTip] = useState(null)

  const list = useMemo(() => (scope === 'all' ? tasks : tasks.filter((t) => (t.group_name || 'Main') === scope)), [tasks, scope])
  const m = useMemo(() => {
    const total = list.length
    const done = list.filter((t) => t.status === 'done').length
    const open = list.filter((t) => t.status !== 'done')
    const t0 = day(new Date()), t7 = addDays(7)
    const overdue = open.filter((t) => t.due_date && t.due_date < t0).sort((a, b) => a.due_date.localeCompare(b.due_date))
    const soon = open.filter((t) => t.due_date && t.due_date >= t0 && t.due_date <= t7).sort((a, b) => a.due_date.localeCompare(b.due_date))
    const active = list.filter((t) => t.status !== 'done' && t.status !== 'todo').length
    const subs = list.flatMap((t) => t.subtasks || [])
    const subDone = subs.filter((x) => x.status === 'done').length
    const byStatus = statuses.map((s) => ({ ...s, n: list.filter((t) => t.status === s.id).length }))
    return { total, done, overdue, soon, active, subs: subs.length, subDone, byStatus, pct: pctOf(done, total) }
  }, [list, statuses])

  const showTip = (e, text) => setTip({ x: e.clientX, y: e.clientY, text })
  const tipProps = (text) => ({ onMouseMove: (e) => showTip(e, text), onMouseLeave: () => setTip(null) })
  const tableRows = m.byStatus

  return (
    <div className="dash">
      <div className="top"><div><h1>Dashboard</h1><p className="muted">A summary of all your tasks.</p></div></div>

      <div className="d-filter" role="tablist">
        {['all', ...boards].map((b) => (
          <button key={b} className={scope === b ? 'on' : ''} onClick={() => setScope(b)}>
            {b !== 'all' && <i style={{ background: colorOf(b) }} />}{b === 'all' ? 'All boards' : b}
          </button>
        ))}
      </div>

      <div className="d-top">
        <section className="d-card d-hero">
          <span className="d-label">Overall completion</span>
          <div className="d-big">{m.pct}<small>%</small></div>
          <div className="d-meter" {...tipProps(`${m.done} of ${m.total} tasks done`)}><div style={{ width: `${m.pct}%` }} /></div>
          <p className="muted">{m.done} of {m.total} tasks done</p>
        </section>
        <div className="d-tiles">
          <Tile label="Total tasks" value={m.total} />
          <Tile label="In progress" value={m.active} sub={`${pctOf(m.active, m.total)}% of tasks`} />
          <Tile label="Overdue" value={m.overdue.length} tone={m.overdue.length ? 'bad' : ''} sub={m.overdue.length ? 'needs attention' : 'all on time'} />
          <Tile label="Due in 7 days" value={m.soon.length} />
          <Tile label="Subitems done" value={`${m.subDone}/${m.subs}`} sub={`${pctOf(m.subDone, m.subs)}%`} />
        </div>
      </div>

      <section className="d-card">
        <h3>Status breakdown <small>{m.total} tasks</small></h3>
        {m.total === 0 ? <p className="d-empty">No tasks yet.</p> : (
          <div className="d-stack">
            {m.byStatus.filter((s) => s.n > 0).map((s) => (
              <i key={s.id} style={{ flex: s.n, background: s.color }} {...tipProps(`${s.label}: ${s.n} (${pctOf(s.n, m.total)}%)`)} />
            ))}
          </div>
        )}
        <ul className="d-legend">
          {tableRows.map((s) => (
            <li key={s.id} {...tipProps(`${s.label}: ${s.n} (${pctOf(s.n, m.total)}%)`)}>
              <span className="d-dot" style={{ background: s.color }} />
              <span className="d-name">{s.label}</span>
              <b>{s.n}</b>
              <em>{pctOf(s.n, m.total)}%</em>
            </li>
          ))}
        </ul>
      </section>

      <section className="d-card">
        <h3>Progress per board <small>{boards.length}</small></h3>
        <ul className="d-boards">
          {boards.map((b) => {
            const bt = tasks.filter((t) => (t.group_name || 'Main') === b)
            const bd = bt.filter((t) => t.status === 'done').length
            const p = pctOf(bd, bt.length)
            const c = colorOf(b)
            return (
              <li key={b}>
                <button onClick={() => onOpenBoard(b)} title="Open board">
                  <span className="d-name"><i className="d-dot" style={{ background: c }} />{b}</span>
                  <span className="d-bar" style={{ '--c': c }} {...tipProps(`${b}: ${bd} of ${bt.length} done`)}><span style={{ width: `${p}%` }} /></span>
                  <span className="d-val">{bd}/{bt.length} · {p}%</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="d-two">
        <TaskList title="Overdue" empty="Nothing overdue. 🎉" items={m.overdue} statuses={statuses} onOpen={onOpenTask} />
        <TaskList title="Due in the next 7 days" empty="Nothing due in the next 7 days." items={m.soon} statuses={statuses} onOpen={onOpenTask} />
      </div>

      {tip && <div className="d-tip" style={{ left: tip.x + 12, top: tip.y + 14 }}>{tip.text}</div>}
    </div>
  )
}
