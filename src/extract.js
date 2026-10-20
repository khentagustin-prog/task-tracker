import { track } from './net.js'
import { getKey, authFailed } from './auth.js'

const BASE = import.meta.env.VITE_N8N_BASE_URL

// Sends the image to n8n (/extract), where the AI reads it.
// Returns: { rows: [{ title, label, month, day, time:'HH:MM'(24h), uncertain, note }], warnings: [string] }
export async function extractRows(file) {
  if (!BASE) throw new Error('Not connected to n8n (VITE_N8N_BASE_URL is missing).')
  const fd = new FormData()
  fd.append('image', file, file.name)
  let res
  try {
    res = await track(fetch(`${BASE}/extract`, { method: 'POST', headers: { 'x-app-key': getKey() }, body: fd }))
  } catch {
    // "Failed to fetch": no internet, or n8n answered with an error that has no CORS headers (e.g. the workflow is not active)
    let reachable = false
    try { reachable = (await fetch(`${BASE}/tasks`, { headers: { 'x-app-key': getKey() } })).ok } catch { /* offline */ }
    throw new Error(reachable
      ? 'Cannot reach the "extract" workflow in n8n. It is probably not active yet: open "Task Tracker - Extract (image to rows)" in n8n, make sure its AI credential is set, and click Activate.'
      : 'No connection to the internet or to n8n. Check your internet and try again.')
  }
  if (res.status === 403) { authFailed(); throw new Error('Not allowed (wrong access key).') }
  if (res.status === 404) throw new Error('The "extract" workflow does not exist in n8n yet. Import and activate it first (see the README).')
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!res.ok || !data) throw new Error(data?.error || `The AI could not read the image (n8n ${res.status}).`)
  if (!Array.isArray(data.rows) || !data.rows.length) throw new Error(data.error || 'No rows were found in the image.')
  return { rows: data.rows, warnings: Array.isArray(data.warnings) ? data.warnings : [] }
}
