import { track } from './net.js'
import { accessToken } from './supabase.js'

const BASE = import.meta.env.VITE_N8N_BASE_URL

// Sends the image to n8n (/extract), where the AI reads it. n8n checks the signed-in user's session.
// Returns: { rows: [{ title, label, month, day, time:'HH:MM'(24h), uncertain, note }], warnings: [string] }
export async function extractRows(file) {
  if (!BASE) throw new Error('Not connected to n8n (VITE_N8N_BASE_URL is missing).')
  const fd = new FormData()
  fd.append('image', file, file.name)
  let res
  try {
    res = await track(fetch(`${BASE}/extract-auth`, { method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}` }, body: fd }))
  } catch {
    // "Failed to fetch": no internet, or n8n answered with an error that has no CORS headers (e.g. the workflow is not active)
    throw new Error(navigator.onLine === false
      ? 'No connection to the internet. Check your connection and try again.'
      : 'Cannot reach the "extract-auth" workflow in n8n. It is probably not active: open "Task Tracker - Extract (login)" in n8n and click Activate.')
  }
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (res.status === 401) throw new Error(data?.error || 'Your session is not valid. Sign out and sign in again.')
  if (res.status === 404) throw new Error('The "extract-auth" workflow does not exist in n8n yet. Import and activate it first (see the README).')
  if (!res.ok || !data) throw new Error(data?.error || `The AI could not read the image (n8n ${res.status}).`)
  if (!Array.isArray(data.rows) || !data.rows.length) throw new Error(data.error || 'No rows were found in the image.')
  return { rows: data.rows, warnings: Array.isArray(data.warnings) ? data.warnings : [] }
}
