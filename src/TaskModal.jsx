import { useEffect, useMemo, useState } from 'react'
import { uploadFile, deleteFile, filesEnabled } from './files.js'
import { tagColor } from './Drawer.jsx'

const fmt = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function TaskModal({ statuses, priorities, groups, initial, onCreate, onClose }) {
  const id = useMemo(() => crypto.randomUUID(), []) // para may folder na agad ang files
  const [f, setF] = useState({ title: '', group_name: initial.group_name, status: initial.status, priority: 'medium', due_date: '', notes: '' })
  const [tags, setTags] = useState([])
  const [tag, setTag] = useState('')
  const [files, setFiles] = useState([])
  const [progress, setProgress] = useState({})
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const uploading = Object.keys(progress).length > 0

  const close = () => {
    if (!saving) files.forEach((x) => deleteFile(x.path).catch(() => {})) // walang naiiwang file kapag cancel
    onClose()
  }
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !uploading && close()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const addTag = (e) => {
    e.preventDefault()
    const t = tag.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTag('')
  }
  const upload = async (list) => {
    setErr('')
    for (const file of list) {
      const k = file.name + file.size + Math.random()
      setProgress((p) => ({ ...p, [k]: { name: file.name, pct: 0 } }))
      try {
        const up = await uploadFile(id, file, (pct) => setProgress((p) => ({ ...p, [k]: { name: file.name, pct } })))
        setFiles((x) => [...x, up])
      } catch (e) { setErr(e.message) }
      setProgress((p) => { const { [k]: _, ...rest } = p; return rest })
    }
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!f.title.trim() || uploading) return
    setSaving(true)
    await onCreate({ id, ...f, title: f.title.trim(), due_date: f.due_date || null, tags, attachments: files })
  }

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && !uploading && close()}>
      <form className="modal task-modal" onSubmit={submit}>
        <div className="m-head">
          <div>
            <h3>New task</h3>
            <p>Ilagay na rito ang lahat ng detalye.</p>
          </div>
          <button type="button" className="x" onClick={close}>✕</button>
        </div>

        <input className="m-input big" autoFocus placeholder="Task name" value={f.title} onChange={set('title')} />

        <div className="d-grid">
          <label>Board
            <select value={f.group_name} onChange={set('group_name')}>{groups.map((g) => <option key={g}>{g}</option>)}</select></label>
          <label>Status
            <select value={f.status} onChange={set('status')}>{statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label>Priority
            <select value={f.priority} onChange={set('priority')}>{priorities.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label>Due date
            <input type="date" value={f.due_date} onChange={set('due_date')} /></label>
        </div>

        <h4>Tags</h4>
        <div className="chips">
          {tags.map((t) => (
            <span key={t} className="chip" style={{ color: tagColor(t), background: tagColor(t) + '1a' }}>
              {t}<button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
            </span>
          ))}
          <input className="chip-in" placeholder="+ add tag, Enter" value={tag} onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag(e)} />
        </div>

        <h4>Notes</h4>
        <textarea className="notes" placeholder="Write notes here..." value={f.notes} onChange={set('notes')} />

        <h4>Files</h4>
        {filesEnabled ? (
          <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload([...e.dataTransfer.files]) }}>
            Click or drop files here to upload
            <input type="file" multiple hidden onChange={(e) => { upload([...e.target.files]); e.target.value = '' }} />
          </label>
        ) : <p className="muted">File upload needs VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env</p>}
        {err && <div className="error">⚠ {err}</div>}
        {Object.values(progress).map((p, i) => (
          <div key={i} className="up">
            <div className="up-top"><span>{p.name}</span><b>{p.pct}%</b></div>
            <div className="up-bar"><div style={{ width: `${p.pct}%` }} /></div>
          </div>
        ))}
        <ul className="files">
          {files.map((x) => (
            <li key={x.path}><span>📄</span><span className="fn">{x.name}</span><em>{fmt(x.size)}</em>
              <button type="button" className="x" onClick={() => { deleteFile(x.path).catch(() => {}); setFiles(files.filter((y) => y.path !== x.path)) }}>✕</button></li>
          ))}
        </ul>

        <div className="m-foot">
          <button type="button" className="ghost" onClick={close}>Cancel</button>
          <button className="primary" disabled={!f.title.trim() || uploading || saving}>
            {uploading ? 'Uploading...' : saving ? 'Saving...' : 'Create task'}</button>
        </div>
      </form>
    </div>
  )
}
