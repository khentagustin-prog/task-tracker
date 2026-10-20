import { createClient } from '@supabase/supabase-js'

// The publishable key is meant to be public. Access is protected by Google sign-in + row level security in Supabase.
export const projectUrl = import.meta.env.VITE_SUPABASE_URL
export const anonKey = import.meta.env.VITE_SUPABASE_KEY
export const configured = Boolean(projectUrl && anonKey)
export const ALLOWED_DOMAIN = (import.meta.env.VITE_ALLOWED_DOMAIN || '247ga.co').toLowerCase()

export const supabase = configured
  ? createClient(projectUrl, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null

export const isAllowedEmail = (email) => (email || '').toLowerCase().endsWith('@' + ALLOWED_DOMAIN)

export async function accessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}
export async function userId() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || ''
}
