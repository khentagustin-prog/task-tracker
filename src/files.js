import { track } from './net.js'
import { getKey, authFailed } from './auth.js'
// File uploads go straight to Supabase Storage (bucket: task-files).
const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_KEY
const BUCKET = 'task-files'
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const N8N = import.meta.env.VITE_N8N_BASE_URL
export const filesEnabled = Boolean(N8N || (URL_ && KEY))

// XHR (not fetch) so there is real upload progress. onProgress(0..100)
export function uploadFile(taskId, file, onProgress = () => {}) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${taskId}/${Date.now()}-${safe}`
  const result = { name: file.name, size: file.size, path, url: `${URL_}/storage/v1/object/public/${BUCKET}/${path}` }
  return track(new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let body
    if (N8N) {
      body = new FormData(); body.append('file', file, file.name)
      xhr.open('POST', `${N8N}/upload?path=${encodeURIComponent(path)}`)
      xhr.setRequestHeader('x-app-key', getKey())
    } else {
      body = file
      xhr.open('POST', `${URL_}/storage/v1/object/${BUCKET}/${path}`)
      xhr.setRequestHeader('apikey', KEY); xhr.setRequestHeader('Authorization', `Bearer ${KEY}`)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(result) } else { if (xhr.status === 403) authFailed(); reject(new Error(xhr.status === 403 ? 'Not allowed (wrong access key)' : `Upload failed (${xhr.status})`)) } }
    xhr.onerror = () => reject(new Error('No internet, or the server cannot be reached'))
    xhr.send(body)
  }))
}

export async function deleteFile(path) {
  if (N8N) {
    const r = await fetch(`${N8N}/upload?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: { 'x-app-key': getKey() } })
    if (!r.ok) throw new Error(`Delete failed (${r.status})`)
    return
  }
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`Delete failed (${res.status})`)
}
