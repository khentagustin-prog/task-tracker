// Access key para sa n8n webhooks. Una: VITE_API_KEY (local dev). Kung wala: ang itinype ng user (naka-save sa browser).
const STORE = 'app-key-v1'
export const getKey = () => {
  const env = import.meta.env.VITE_API_KEY
  if (env) return env
  try { return localStorage.getItem(STORE) || '' } catch { return '' }
}
export const setKey = (k) => { try { localStorage.setItem(STORE, k.trim()) } catch {} }
export const clearKey = () => { try { localStorage.removeItem(STORE) } catch {} }
export const authFailed = () => window.dispatchEvent(new Event('auth-failed'))
