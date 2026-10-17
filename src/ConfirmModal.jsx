import { useEffect } from 'react'

export default function ConfirmModal({ title, message, detail, confirmLabel = 'Delete', busy, onConfirm, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="modal-wrap" style={{ zIndex: 30 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal confirm" role="alertdialog">
        <div className="c-icon">🗑</div>
        <h3>{title}</h3>
        <p>{message}</p>
        {detail && <div className="c-detail">{detail}</div>}
        <div className="m-foot center">
          <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary danger-btn" onClick={onConfirm} autoFocus disabled={busy}>{busy ? 'Deleting...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
