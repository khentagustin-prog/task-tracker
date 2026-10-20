import { useEffect, useState } from 'react'
import { supabase, configured, usernameToEmail, passwordFor } from './supabase.js'

const CACHE_KEYS = ['statuses-v1', 'boards-v1', 'board-colors-v1', 'board-v1', 'view-v2']
const clearCaches = () => { try { CACHE_KEYS.forEach((k) => localStorage.removeItem(k)) } catch { /* ignore */ } }

function Card({ children }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-logo">✓</div>
        <h1>TaskFlow</h1>
        {children}
      </div>
    </div>
  )
}

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password: passwordFor(password) })
    if (error) {
      setMsg(/invalid login|invalid_credentials|invalid/i.test(error.message) ? 'Wrong username or password.' : error.message)
      setBusy(false)
    }
  }

  return (
    <Card>
      <p>Sign in to open your tracker.</p>
      <form className="login-form" onSubmit={submit}>
        <input autoFocus placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck="false" />
        <div className="gate-input">
          <input type={show ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        {msg && <div className="m-err">{msg}</div>}
        <button className="primary" disabled={busy || !username.trim() || !password}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <small>Each account has its own private tracker.</small>
    </Card>
  )
}

// Wraps the app: shows the login page until someone is signed in.
export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, session: null })

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => setState({ loading: false, session: data.session }))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ loading: false, session }))
    return () => data.subscription.unsubscribe()
  }, [])

  const signOut = async () => { clearCaches(); await supabase.auth.signOut() }

  if (!configured) return <Card><p>Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY, then reload.</p></Card>
  if (state.loading) return <Card><p>Loading...</p></Card>
  if (!state.session) return <LoginForm />
  return children(state.session.user, signOut)
}
