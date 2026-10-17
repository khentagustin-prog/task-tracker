import { track } from './net.js'
// File uploads diretso sa Supabase Storage (bucket: task-files).
const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_KEY
const BUCKET = 'task-files'
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const N8N = import.meta.env.VITE_N8N_BASE_URL
const APP_KEY = import.meta.env.VITE_API_KEY || ''
export const filesEnabled = Boolean(N8N || (URL_ && KEY))

// XHR (hindi fetch) para may totoong upload progress. onProgress(0..100)
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
      xhr.setRequestHeader('x-app-key', APP_KEY)
    } else {
      body = file
      xhr.open('POST', `${URL_}/storage/v1/object/${BUCKET}/${path}`)
      xhr.setRequestHeader('apikey', KEY); xhr.setRequestHeader('Authorization', `Bearer ${KEY}`)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(result) } else reject(new Error(`Upload failed (${xhr.status})`)) }
    xhr.onerror = () => reject(new Error('Walang internet o hindi maabot ang server'))
    xhr.send(body)
  }))
}

export async function deleteFile(path) {
  if (N8N) {
    const r = await fetch(`${N8N}/upload?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: { 'x-app-key': APP_KEY } })
    if (!r.ok) throw new Error(`Delete failed (${r.status})`)
    return
  }
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`Delete failed (${res.status})`)
}
