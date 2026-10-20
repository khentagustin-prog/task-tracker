import { useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import { BOARD_COLORS } from './BoardModal.jsx'

const PROTECTED = ['todo', 'done'] // todo = the default status, done = used for progress

export default function Settings({ boards, tasks, statuses, colorOf, actions }) {
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(BOARD_COLORS[0])
  const [err, setErr] = useState('')

  const countBoard = (g) => tasks.filter((t) => (t.group_name || 'Main') === g).length
  const countStatus = (id) => tasks.filter((t) => t.status === id).length

  const rename = (g, e) => {
    const v = e.target.value.trim()
    if (!v || v === g) { e.target.value = g; return }
    if (boards.some((b) => b.toLowerCase() === v.toLowerCase())) { setErr(`A board named "${v}" already exists.`); e.target.value = g; return }
    setErr(''); actions.renameBoard(g, v)
  }
  const addStatus = (e) => {
    e.preventDefault()
    const v = label.trim()
    if (!v) return
    if (statuses.some((s) => s.label.toLowerCase() === v.toLowerCase())) { setErr(`A status named "${v}" already exists.`); return }
    setErr(''); actions.addStatus(v, color); setLabel('')
  }
  const doDelete = async () => {
    setBusy(true)
    try { confirm.kind === 'board' ? await actions.deleteBoard(confirm.name) : await actions.deleteStatus(confirm.id) }
    finally { setBusy(false); setConfirm(null) }
  }

  const delBoardFiles = confirm?.kind === 'board'
    ? tasks.filter((t) => (t.group_name || 'Main') === confirm.name).reduce((n, t) => n + (t.attachments || []).length, 0) : 0

  return (
    <div className="settings">
      <div className="top"><div><h1>Settings</h1><p className="muted">Manage your boards and statuses.</p></div></div>
      {err && <div className="error" style={{ marginTop: 16 }}>⚠ {err}</div>}

      <section className="s-card">
        <h2>Boards <small>{boards.length}</small></h2>
        <p className="muted">Rename, recolor or delete a board.</p>
        {boards.map((g, i) => (
          <div key={g} className="s-row">
            <input type="color" value={colorOf(g, i)} onChange={(e) => actions.recolorBoard(g, e.target.value)} title="Change color" />
            {g === 'Main'
              ? <span className="s-name">Main <em className="badge">default</em></span>
              : <input className="s-name edit" defaultValue={g} key={g} onBlur={(e) => rename(g, e)} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />}
            <span className="s-count">{countBoard(g)} tasks</span>
            <button className="s-dup" onClick={() => actions.askDuplicateBoard(g)} title="Duplicate board">⧉ Duplicate</button>
            <button className="s-del" disabled={g === 'Main'} title={g === 'Main' ? 'The default board cannot be deleted' : 'Delete board'}
              onClick={() => setConfirm({ kind: 'board', name: g })}>Delete</button>
          </div>
        ))}
      </section>

      <section className="s-card">
        <h2>Statuses <small>{statuses.length}</small></h2>
        <p className="muted">These are the statuses your tasks can have. When a status is deleted, its tasks move to To Do.</p>
        {statuses.map((s, i) => (
          <div key={s.id} className="s-row">
            <input type="color" value={s.color} onChange={(e) => actions.updateStatus(s.id, { color: e.target.value })} title="Change color" />
            <input className="s-name edit" defaultValue={s.label} key={s.id + s.label}
              onBlur={(e) => e.target.value.trim() ? actions.updateStatus(s.id, { label: e.target.value.trim() }) : (e.target.value = s.label)}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
            <span className="s-count">{countStatus(s.id)} tasks</span>
            <div className="s-move">
              <button disabled={i === 0} onClick={() => actions.moveStatus(s.id, -1)} title="Move up">↑</button>
              <button disabled={i === statuses.length - 1} onClick={() => actions.moveStatus(s.id, 1)} title="Move down">↓</button>
            </div>
            <button className="s-del" disabled={PROTECTED.includes(s.id)} title={PROTECTED.includes(s.id) ? 'The app needs this status' : 'Delete status'}
              onClick={() => setConfirm({ kind: 'status', id: s.id, label: s.label })}>Delete</button>
          </div>
        ))}
        <form className="s-add" onSubmit={addStatus}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <input className="m-input" placeholder="New status name (e.g. Waiting)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="primary" disabled={!label.trim()}>+ Add status</button>
        </form>
      </section>

      {confirm && (
        <ConfirmModal busy={busy} onClose={() => !busy && setConfirm(null)} onConfirm={doDelete}
          title={confirm.kind === 'board' ? 'Delete this board?' : 'Delete this status?'}
          message={confirm.kind === 'board' ? 'The board and all its tasks will be deleted. This cannot be undone.' : 'Tasks with this status will move to To Do.'}
          detail={confirm.kind === 'board'
            ? <><b>{confirm.name}</b><span>{countBoard(confirm.name)} task{countBoard(confirm.name) === 1 ? '' : 's'}{delBoardFiles ? ` and ${delBoardFiles} file${delBoardFiles > 1 ? 's' : ''}` : ''} will be deleted</span></>
            : <><b>{confirm.label}</b>{countStatus(confirm.id) > 0 && <span>{countStatus(confirm.id)} task{countStatus(confirm.id) > 1 ? 's' : ''} will move to To Do</span>}</>} />
      )}
    </div>
  )
}
