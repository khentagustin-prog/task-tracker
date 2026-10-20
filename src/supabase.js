import { createClient } from '@supabase/supabase-js'

// The publishable key is meant to be public. Access is protected by the login + row level security in Supabase.
export const projectUrl = import.meta.env.VITE_SUPABASE_URL
export const anonKey = import.meta.env.VITE_SUPABASE_KEY
export const configured = Boolean(projectUrl && anonKey)

export const supabase = configured
  ? createClient(projectUrl, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null

// People type a short username ("admin1"); Supabase needs an email, so we add a fixed domain.
const EMAIL_DOMAIN = 'taskflow.local'
export const usernameToEmail = (u) => {
  const v = (u || '').trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${EMAIL_DOMAIN}`
}
export const emailToUsername = (email) => (email || '').replace(`@${EMAIL_DOMAIN}`, '')

// Supabase refuses passwords shorter than 6 characters, so a short password gets a fixed suffix before it is sent.
// (Passwords of 6+ characters are sent as typed.) The same rule is used when the accounts are created in SQL.
export const passwordFor = (p) => (p.length < 6 ? `${p}#taskflow` : p)

export async function accessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}
export async function userId() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || ''
}
