import { useEffect, useState } from 'react'
import { supabase, configured, isAllowedEmail, ALLOWED_DOMAIN } from './supabase.js'

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

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.7 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.5 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" /><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.7-4-13.6-9.6l-7.8 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
)

// Wraps the app: shows the Google sign-in screen until a signed-in user with an allowed company email exists.
export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, session: null })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => setState({ loading: false, session: data.session }))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ loading: false, session }))
    return () => data.subscription.unsubscribe()
  }, [])

  const email = state.session?.user?.email
  useEffect(() => {
    if (email && !isAllowedEmail(email)) {
      setMsg(`${email} is not allowed. Sign in with your @${ALLOWED_DOMAIN} Google account.`)
      clearCaches()
      supabase.auth.signOut()
    }
  }, [email])

  const signIn = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' } } })
    if (error) { setMsg(error.message); setBusy(false) }
  }
  const signOut = async () => { clearCaches(); await supabase.auth.signOut() }

  if (!configured) return <Card><p>Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY, then reload.</p></Card>
  if (state.loading) return <Card><p>Loading...</p></Card>
  if (!state.session || !isAllowedEmail(email)) {
    return (
      <Card>
        <p>Sign in with your company Google account (@{ALLOWED_DOMAIN}) to open your tracker.</p>
        <button className="g-btn" onClick={signIn} disabled={busy}><GoogleLogo /> {busy ? 'Opening Google...' : 'Sign in with Google'}</button>
        {msg && <div className="m-err" style={{ marginTop: 6 }}>{msg}</div>}
        <small>Each person has a private tracker. Nobody else can see your tasks.</small>
      </Card>
    )
  }
  return children(state.session.user, signOut)
}
