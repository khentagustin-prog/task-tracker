import { useEffect, useState } from 'react'
import { shiftDate, suggestCopy } from './dates.js'

const fmt = (d) => (d ? new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')

export default function DuplicateModal({ kind, source, items, existing, onConfirm, onClose }) {
  const sug = kind === 'group' ? suggestCopy(source) : { name: `${source} (copy)`, n: 0 }
  const [name, setName] = useState(sug.name)
  const [n, setN] = useState(sug.n)
  const [unit, setUnit] = useState('months')
  const [reset, setReset] = useState(true)
  const [subs, setSubs] = useState(true)
  const [notes, setNotes] = useState(true)
  const [busy, setBusy] = useState(false)
  const clean = name.trim()
  const dup = existing.some((x) => x.toLowerCase() === clean.toLowerCase())
  const subCount = items.reduce((a, t) => a + (t.subtasks || []).length, 0)
  const sample = items.find((t) => t.due_date)

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [busy, onClose])

  const submit = async (e) => {
    e.preventDefault()
    if (!clean || dup || busy) return
    setBusy(true)
    await onConfirm({ name: clean, n: Number(n) || 0, unit, reset, subs, notes })
  }

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="m-head">
          <div className="m-icon" style={{ background: '#4f46e5' }}>⧉</div>
          <div>
            <h3>Duplicate {kind}</h3>
            <p><b>{source}</b> · {items.length} {items.length === 1 ? 'task' : 'tasks'} / {subCount} subitems</p>
          </div>
          <button type="button" className="x" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <label className="m-label">New {kind} name</label>
        <input className="m-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        {dup && <div className="m-err">A {kind} with that name already exists.</div>}

        <label className="m-label">Shift dates by</label>
        <div className="dup-shift">
          <input type="number" value={n} onChange={(e) => setN(e.target.value)} />
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="days">day(s)</option><option value="weeks">week(s)</option><option value="months">month(s)</option>
          </select>
          {sample && <span className="muted">e.g. {fmt(sample.due_date)} → <b>{fmt(shiftDate(sample.due_date, Number(n) || 0, unit))}</b></span>}
        </div>

        <div className="dup-opts">
          <label><input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> Reset statuses to To Do</label>
          <label><input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Copy subitems</label>
          <label><input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Copy notes</label>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>Uploaded files are not copied.</p>

        <div className="m-foot">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" disabled={!clean || dup || busy}>{busy ? 'Duplicating...' : 'Duplicate'}</button>
        </div>
      </form>
    </div>
  )
}
