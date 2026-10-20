import { track } from './net.js'
import { getKey, authFailed } from './auth.js'
// Data layer: n8n webhooks when VITE_N8N_BASE_URL is set, otherwise localStorage.
const BASE = import.meta.env.VITE_N8N_BASE_URL
const KEY = 'tasks-v1'

const local = {
  load: () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } },
  save: (t) => localStorage.setItem(KEY, JSON.stringify(t)),
}

async function call(path, method, body) {
  const res = await track(fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-app-key': getKey() },
    body: body ? JSON.stringify(body) : undefined,
  }))
  if (res.status === 403) { authFailed(); throw new Error('Not allowed (wrong access key)') }
  if (!res.ok) throw new Error(`n8n ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

export const api = {
  mode: BASE ? 'n8n' : 'local',
  hasKey: () => Boolean(getKey()),
  async list() {
    return BASE ? call('/tasks', 'GET') : local.load()
  },
  async getSettings() {
    if (!BASE) return {}
    const rows = await call('/settings', 'GET')
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  },
  async saveSetting(key, value) {
    if (BASE) return call('/settings', 'POST', { key, value })
  },
  async create(task) {
    if (BASE) return call('/tasks', 'POST', task)
    const t = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...task }
    local.save([...local.load(), t]); return t
  },
  async update(id, patch) {
    if (BASE) return call(`/tasks?id=${id}`, 'PATCH', patch)
    local.save(local.load().map((t) => (t.id === id ? { ...t, ...patch } : t)))
  },
  async remove(id) {
    if (BASE) return call(`/tasks?id=${id}`, 'DELETE')
    local.save(local.load().filter((t) => t.id !== id))
  },
}
