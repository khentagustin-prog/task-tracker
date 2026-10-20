import { useEffect, useState } from 'react'

export const fileKind = (name = '') => {
  const e = name.split('.').pop().toLowerCase()
  if (e === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(e)) return 'image'
  if (['mp4', 'webm', 'mov', 'm4v'].includes(e)) return 'video'
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(e)) return 'audio'
  if (e === 'docx') return 'docx'
  if (['txt', 'md', 'csv', 'json', 'log', 'xml', 'yml', 'yaml'].includes(e)) return 'text'
  return 'other'
}
const ICON = { docx: '📘', pdf: '📕', image: '🖼', video: '🎞', audio: '🎵', text: '📝', other: '📄' }
const fmt = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`)
const dl = (f) => `${f.url}?download=${encodeURIComponent(f.name)}`

// Appears when you hover or click 📎. Fixed position so the table does not clip it.
export function FilePopover({ files, x, y, onPreview, onEnter, onLeave }) {
  const left = Math.max(8, Math.min(x - 300, window.innerWidth - 308))
  return (
    <div className="fpop" style={{ left, top: y }} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={(e) => e.stopPropagation()}>
      <div className="fpop-head">Files <b>{files.length}</b></div>
      {files.map((f) => (
        <button key={f.path} className="fpop-item" onClick={() => onPreview(f)}>
          <span className="fi">{ICON[fileKind(f.name)]}</span>
          <span className="fn">{f.name}</span>
          <em>{fmt(f.size)}</em>
        </button>
      ))}
    </div>
  )
}

function DocxView({ url }) {
  const [state, setState] = useState({ html: '', err: '', loading: true })
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [{ default: mammoth }, buf] = await Promise.all([import('mammoth/mammoth.browser'), fetch(url).then((r) => r.arrayBuffer())])
        const { value } = await mammoth.convertToHtml({ arrayBuffer: buf })
        if (live) setState({ html: value, err: '', loading: false })
      } catch (e) { if (live) setState({ html: '', err: 'This document cannot be previewed.', loading: false }) }
    })()
    return () => { live = false }
  }, [url])
  if (state.loading) return <div className="fprev-other">Loading document...</div>
  if (state.err) return <div className="fprev-other">{state.err}</div>
  return <div className="docx" dangerouslySetInnerHTML={{ __html: state.html }} />
}

export function FilePreview({ file, onClose }) {
  const kind = fileKind(file.name)
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="modal-wrap" style={{ zIndex: 40 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fprev">
        <div className="fprev-head">
          <span className="fi">{ICON[kind]}</span>
          <b title={file.name}>{file.name}</b>
          <a href={file.url} target="_blank" rel="noreferrer">Open ↗</a>
          <a href={dl(file)}>Download ⬇</a>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="fprev-body">
          {kind === 'docx' && <DocxView url={file.url} />}
          {kind === 'pdf' && <iframe title={file.name} src={file.url} />}
          {kind === 'text' && <iframe title={file.name} src={file.url} className="light" />}
          {kind === 'image' && <img src={file.url} alt={file.name} />}
          {kind === 'video' && <video src={file.url} controls autoPlay />}
          {kind === 'audio' && <audio src={file.url} controls autoPlay />}
          {kind === 'other' && (
            <div className="fprev-other">
              <div style={{ fontSize: 44 }}>{ICON.other}</div>
              <p>This kind of file cannot be previewed in the app.</p>
              <a className="primary" href={dl(file)}>Download</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
