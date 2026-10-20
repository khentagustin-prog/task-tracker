import { track } from './net.js'
import { supabase, projectUrl, anonKey, accessToken, userId } from './supabase.js'

const BUCKET = 'task-files'
export const filesEnabled = Boolean(supabase)

// XHR (not fetch) so there is real upload progress. Files live under <user id>/<task id>/ and the bucket is private.
// onProgress(0..100). Returns { name, size, path }.
export function uploadFile(taskId, file, onProgress = () => {}) {
  return track((async () => {
    const [uid, token] = await Promise.all([userId(), accessToken()])
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `${uid}/${taskId}/${Date.now()}-${safe}`
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${projectUrl}/storage/v1/object/${BUCKET}/${path}`)
      xhr.setRequestHeader('apikey', anonKey)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
      xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve() } else reject(new Error(xhr.status === 401 || xhr.status === 403 ? 'Not allowed. Sign in again.' : `Upload failed (${xhr.status})`)) }
      xhr.onerror = () => reject(new Error('No internet, or the server cannot be reached'))
      xhr.send(file)
    })
    return { name: file.name, size: file.size, path }
  })())
}

export async function deleteFile(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(`Delete failed (${error.message})`)
}

// Private files are opened through short-lived signed links.
export async function fileLinks(file) {
  const store = supabase.storage.from(BUCKET)
  const [view, down] = await Promise.all([store.createSignedUrl(file.path, 3600), store.createSignedUrl(file.path, 3600, { download: file.name })])
  if (view.error) throw new Error(view.error.message)
  return { url: view.data.signedUrl, download: down.data?.signedUrl || view.data.signedUrl }
}
