import { useEffect, useState } from 'react'

const initial = (n) => (n || '?').slice(0, 1).toUpperCase()

// Share a board with other accounts. People can add, edit and delete tasks in it and open its files.
export default function ShareModal({ board, people, sharedIds, onAdd, onRemove, onClose }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const act = async (fn, p) => {
    setBusy(p.id); setErr('')
    try { await fn(p) } catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const list = people || []
  const withAccess = list.filter((p) => sharedIds.includes(p.id))
  const needle = q.trim().toLowerCase()
  const found = list.filter((p) => !sharedIds.includes(p.id) && p.username.includes(needle))

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-modal" role="dialog" aria-label="Share board">
        <h3>Share “{board}”</h3>
        <p className="muted s-note">People you add can add, edit and delete tasks in this board and open its files. They cannot see your other boards.</p>
        {people === null ? (
          <div className="m-err">Sharing is not set up yet. Run supabase-v9-sharing.sql once in the Supabase SQL Editor, then reload.</div>
        ) : (<>
          <input className="m-input" autoFocus placeholder="Search people by username" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="s-list">
            {found.map((p) => (
              <div key={p.id} className="s-row">
                <span className="avatar sm">{initial(p.username)}</span><span className="s-name">{p.username}</span>
                <button className="primary s-btn" disabled={busy === p.id} onClick={() => act((x) => onAdd(x), p)}>{busy === p.id ? 'Adding...' : 'Add'}</button>
              </div>
            ))}
            {!found.length && <div className="s-empty">{list.length === 0 ? 'No other accounts yet.' : needle ? 'Nobody matches that name.' : 'Everyone already has access.'}</div>}
          </div>
          <div className="s-head">People with access</div>
          <div className="s-list">
            <div className="s-row"><span className="avatar sm me">Y</span><span className="s-name">You <small>(owner)</small></span></div>
            {withAccess.map((p) => (
              <div key={p.id} className="s-row">
                <span className="avatar sm">{initial(p.username)}</span><span className="s-name">{p.username} <small>can edit</small></span>
                <button className="ghost s-btn" disabled={busy === p.id} onClick={() => act((x) => onRemove(x), p)}>{busy === p.id ? '...' : 'Remove'}</button>
              </div>
            ))}
          </div>
        </>)}
        {err && <div className="m-err">{err}</div>}
        <div className="m-foot"><button className="primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  )
}
