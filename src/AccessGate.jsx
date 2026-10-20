import { useState } from 'react'

export default function AccessGate({ message, onSubmit }) {
  const [v, setV] = useState('')
  const [show, setShow] = useState(false)
  return (
    <div className="gate">
      <form className="gate-card" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()) }}>
        <div className="gate-logo">✓</div>
        <h1>TaskFlow</h1>
        <p>Enter the access key to continue.</p>
        <div className="gate-input">
          <input autoFocus type={show ? 'text' : 'password'} placeholder="Access key" value={v} onChange={(e) => setV(e.target.value)} autoComplete="current-password" />
          <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        {message && <div className="m-err" style={{ marginTop: 8 }}>{message}</div>}
        <button className="primary" disabled={!v.trim()}>Unlock</button>
        <small>It is saved on this browser only.</small>
      </form>
    </div>
  )
}
