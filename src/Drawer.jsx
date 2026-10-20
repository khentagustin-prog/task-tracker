import { useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import { uploadFile, deleteFile, filesEnabled } from './files.js'

const TAG_COLORS = ['#4f46e5', '#12b76a', '#f79009', '#f04438', '#7a5af8', '#06aed4', '#ee46bc']
export const tagColor = (t) => TAG_COLORS[[...t].reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_COLORS.length]
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}
const fmt = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function Drawer({ task, statuses, priorities, groups, onPatch, onPreview, onClose, onDelete }) {
  const [tab, setTab] = useState('updates')
  const [draft, setDraft] = useState('')
  const [delUpd, setDelUpd] = useState(null)
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const tags = task.tags || []
  const files = task.attachments || []
  const updates = task.updates || []
  const post = () => {
    const text = draft.trim()
    if (!text) return
    onPatch(task.id, { updates: [{ id: crypto.randomUUID(), text, at: new Date().toISOString() }, ...updates] })
    setDraft('')
  }

  const addTag = (e) => {
    e.preventDefault()
    const t = tag.trim()
    if (t && !tags.includes(t)) onPatch(task.id, { tags: [...tags, t] })
    setTag('')
  }
  const upload = async (list) => {
    setBusy(true); setErr('')
    try {
      const added = []
      for (const f of list) {
        const k = f.name + f.size
        setProgress((p) => ({ ...p, [k]: { name: f.name, pct: 0 } }))
        try {
          added.push(await uploadFile(task.id, f, (pct) => setProgress((p) => ({ ...p, [k]: { name: f.name, pct } }))))
        } finally { setProgress((p) => { const { [k]: _, ...rest } = p; return rest }) }
      }
      onPatch(task.id, { attachments: [...files, ...added] })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const removeFile = async (f) => {
    try { await deleteFile(f.path) } catch {}
    onPatch(task.id, { attachments: files.filter((x) => x.path !== f.path) })
  }

  const destroy = async () => {
    setDeleting(true)
    await Promise.all([...(task.attachments || []), ...(task.subtasks || []).flatMap((x) => x.attachments || [])].map((f) => deleteFile(f.path).catch(() => {})))
    onDelete(task.id)
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="d-head">
          <input className="d-title" defaultValue={task.title} key={task.id}
            onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && onPatch(task.id, { title: e.target.value.trim() })} />
          <button className="x" onClick={onClose}>✕</button>
        </div>

        <div className="d-tabs">
          <button className={tab === 'updates' ? 'on' : ''} onClick={() => setTab('updates')}>Updates{updates.length > 0 && <em>{updates.length}</em>}</button>
          <button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>Files{files.length > 0 && <em>{files.length}</em>}</button>
          <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
        </div>

        {tab === 'updates' && (
          <div className="upd">
            <div className="upd-box">
              <textarea placeholder="Write an update..." value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post() } }} />
              <div className="upd-foot"><span className="muted">Enter to post · Shift+Enter for a new line</span><button className="primary" disabled={!draft.trim()} onClick={post}>Update</button></div>
            </div>
            {!updates.length ? (
              <div className="upd-empty">
                <svg viewBox="0 0 120 90" width="120" height="90" aria-hidden="true"><rect x="22" y="6" width="80" height="38" rx="7" fill="#c7d7fe" /><rect x="30" y="16" width="22" height="3" rx="1.5" fill="#344054" /><rect x="30" y="24" width="14" height="3" rx="1.5" fill="#344054" /><rect x="62" y="13" width="30" height="24" rx="4" fill="#fff" /><rect x="6" y="40" width="62" height="40" rx="7" fill="#5b5be6" /><rect x="14" y="52" width="26" height="3" rx="1.5" fill="#fff" opacity=".9" /><rect x="14" y="60" width="18" height="3" rx="1.5" fill="#fff" opacity=".9" /><circle cx="54" cy="68" r="7" fill="#fdb022" /></svg>
                <b>No updates yet</b>
                <p>Share progress, or upload a file to get things moving</p>
              </div>
            ) : (
              <ul className="upd-list">
                {updates.map((u) => (
                  <li key={u.id}>
                    <span className="upd-av">K</span>
                    <div>
                      <div className="upd-meta"><b>You</b><em title={new Date(u.at).toLocaleString()}>{ago(u.at)}</em>
                        <button className="x" title="Delete update" onClick={() => setDelUpd(u)}>✕</button></div>
                      <p>{u.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {delUpd && <ConfirmModal title="Delete this update?" message="This cannot be undone." detail={<span style={{ color: 'inherit' }}>{delUpd.text.slice(0, 120)}</span>}
              onClose={() => setDelUpd(null)} onConfirm={() => { onPatch(task.id, { updates: updates.filter((x) => x.id !== delUpd.id) }); setDelUpd(null) }} />}
          </div>
        )}

        {tab === 'files' && (<div>
        {!filesEnabled ? <p className="muted">File upload needs VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env</p> : (
          <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload([...e.dataTransfer.files]) }}>
            {busy ? 'Uploading... please keep this open' : 'Click or drop files here to upload'}
            <input type="file" multiple hidden onChange={(e) => { upload([...e.target.files]); e.target.value = '' }} />
          </label>
        )}
        {err && <div className="error">⚠ {err}</div>}
        {Object.values(progress).map((p) => (
          <div key={p.name} className="up">
            <div className="up-top"><span>{p.name}</span><b>{p.pct}%</b></div>
            <div className="up-bar"><div style={{ width: `${p.pct}%` }} /></div>
          </div>
        ))}
        <ul className="files">
          {files.map((f) => (
            <li key={f.path}>
              <span>📄</span>
              <a href={f.url} target="_blank" rel="noreferrer" onClick={(e) => { if (onPreview) { e.preventDefault(); onPreview(f) } }}>{f.name}</a>
              <em>{fmt(f.size)}</em>
              <button className="x" onClick={() => removeFile(f)}>✕</button>
            </li>
          ))}
        </ul>

        </div>)}

        {tab === 'details' && (<div>
        <div className="d-grid">
          <label>Status
            <select value={task.status} onChange={(e) => onPatch(task.id, { status: e.target.value })}>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label>Priority
            <select value={task.priority} onChange={(e) => onPatch(task.id, { priority: e.target.value })}>
              {priorities.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label>Due date
            <input type="date" value={task.due_date || ''} onChange={(e) => onPatch(task.id, { due_date: e.target.value || null })} /></label>
          <label>Board
            <select value={task.group_name || 'Main'} onChange={(e) => onPatch(task.id, { group_name: e.target.value })}>
              {groups.map((g) => <option key={g}>{g}</option>)}</select></label>
        </div>

        <h4>Tags</h4>
        <div className="chips">
          {tags.map((t) => (
            <span key={t} className="chip" style={{ color: tagColor(t), background: tagColor(t) + '1a' }}>
              {t}<button onClick={() => onPatch(task.id, { tags: tags.filter((x) => x !== t) })}>×</button>
            </span>
          ))}
          <form onSubmit={addTag}><input className="chip-in" placeholder="+ add tag" value={tag} onChange={(e) => setTag(e.target.value)} /></form>
        </div>

        <h4>Notes</h4>
        <textarea className="notes" key={task.id + 'n'} defaultValue={task.notes || ''} placeholder="Write notes here..."
          onBlur={(e) => e.target.value !== (task.notes || '') && onPatch(task.id, { notes: e.target.value })} />

        </div>)}

        <button className="danger" onClick={() => setConfirming(true)}>Delete task</button>
        {confirming && (
          <ConfirmModal title="Delete this task?" message="This cannot be undone." busy={deleting}
            detail={<><b>{task.title}</b>{files.length > 0 && <span>{files.length} file{files.length > 1 ? 's' : ''} will also be deleted</span>}</>}
            onConfirm={destroy} onClose={() => setConfirming(false)} />
        )}
      </div>
    </>
  )
}
