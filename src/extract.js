import { track } from './net.js'
import { getKey, authFailed } from './auth.js'

const BASE = import.meta.env.VITE_N8N_BASE_URL

// Ipinapadala ang larawan sa n8n (/extract) kung saan binabasa ito ng AI.
// Ibinabalik: [{ title, label, month, day, time:'HH:MM'(24h), uncertain, note }]
export async function extractRows(file) {
  if (!BASE) throw new Error('Walang koneksyon sa n8n (VITE_N8N_BASE_URL).')
  const fd = new FormData()
  fd.append('image', file, file.name)
  let res
  try {
    res = await track(fetch(`${BASE}/extract`, { method: 'POST', headers: { 'x-app-key': getKey() }, body: fd }))
  } catch {
    // "Failed to fetch": walang internet, o ang n8n ay sumasagot ng error na walang CORS (hal. hindi pa naka-activate ang workflow)
    let reachable = false
    try { reachable = (await fetch(`${BASE}/tasks`, { headers: { 'x-app-key': getKey() } })).ok } catch { /* offline */ }
    throw new Error(reachable
      ? 'Hindi maabot ang "extract" workflow sa n8n. Malamang hindi pa ito naka-activate: buksan ang "Task Tracker - Extract (image to rows)" sa n8n, ilagay ang Anthropic API key sa credential, at i-click ang Activate.'
      : 'Walang koneksyon sa internet o sa n8n. Tingnan ang internet mo at subukan ulit.')
  }
  if (res.status === 403) { authFailed(); throw new Error('Walang pahintulot (mali ang access key).') }
  if (res.status === 404) throw new Error('Wala pa ang "extract" workflow sa n8n. I-import at i-activate muna ito (tingnan ang README).')
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = null }
  if (!res.ok || !data) throw new Error(data?.error || `Hindi nabasa ng AI ang larawan (n8n ${res.status}).`)
  if (!Array.isArray(data.rows) || !data.rows.length) throw new Error(data.error || 'Walang nakitang row sa larawan.')
  return data.rows
}
