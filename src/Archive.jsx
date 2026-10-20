import { useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'

const fmt = (d) => (d ? new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')

export default function Archive({ items, statuses, colorOf, onRestore, onDelete, onOpen }) {
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="arch">
      <div className="top"><div><h1>Archive</h1><p className="muted">{items.length} archived {items.length === 1 ? 'task' : 'tasks'} · not shown in the table or dashboard.</p></div></div>
      {!items.length ? <div className="empty" style={{ marginTop: 16 }}>Nothing archived yet. Select finished tasks in the table and click <b>Archive</b>.</div> : (
        <div className="arch-list">
          <div className="arow ahead"><span>Task</span><span>Board</span><span>Status</span><span>Due</span><span /></div>
          {items.map((t) => {
            const st = statuses.find((s) => s.id === t.status) || statuses[0]
            const b = t.group_name || 'Main'
            return (
              <div key={t.id} className="arow">
                <button className="a-title" onClick={() => onOpen(t.id)}>{t.title}</button>
                <span className="a-board"><i style={{ background: colorOf(b) }} />{b}</span>
                <span className="a-status" style={{ background: st.color }}>{st.label}</span>
                <span className="a-due">{fmt(t.due_date)}</span>
                <span className="a-act">
                  <button onClick={() => onRestore(t)}>↩ Restore</button>
                  <button className="d" onClick={() => setDel(t)}>Delete</button>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {del && <ConfirmModal busy={busy} title="Delete permanently?" message="This will be deleted permanently, including its files."
        detail={<b>{del.title}</b>} onClose={() => !busy && setDel(null)}
        onConfirm={async () => { setBusy(true); await onDelete(del); setBusy(false); setDel(null) }} />}
    </div>
  )
}
