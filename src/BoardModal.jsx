import { useEffect, useState } from 'react'

export const BOARD_COLORS = ['#4f46e5', '#12b76a', '#7a5af8', '#f79009', '#f04438', '#06aed4', '#ee46bc', '#344054']
const SUGGESTIONS = ['For Work', 'Personal', 'Home', 'Study', 'Side Project', 'Errands']

export default function BoardModal({ existing, onCreate, onClose }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(BOARD_COLORS[0])
  const clean = name.trim()
  const dup = existing.some((g) => g.toLowerCase() === clean.toLowerCase())

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const submit = (e) => {
    e.preventDefault()
    if (clean && !dup) onCreate(clean, color)
  }

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="m-head">
          <div className="m-icon" style={{ background: color }}>{(clean[0] || '+').toUpperCase()}</div>
          <div>
            <h3>Create new board</h3>
            <p>A separate list of tasks for one thing.</p>
          </div>
          <button type="button" className="x" onClick={onClose}>✕</button>
        </div>

        <label className="m-label">Board name</label>
        <input className="m-input" autoFocus maxLength={30} placeholder="e.g. For Work" value={name} onChange={(e) => setName(e.target.value)} />
        {dup && <div className="m-err">A board with that name already exists.</div>}

        <div className="m-sug">
          {SUGGESTIONS.filter((s) => !existing.includes(s)).map((s) => (
            <button type="button" key={s} onClick={() => setName(s)}>{s}</button>
          ))}
        </div>

        <label className="m-label">Color</label>
        <div className="swatches">
          {BOARD_COLORS.map((c) => (
            <button type="button" key={c} className={c === color ? 'sel' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>

        <div className="m-foot">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!clean || dup}>Create board</button>
        </div>
      </form>
    </div>
  )
}
