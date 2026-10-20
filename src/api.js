import { track } from './net.js'
import { supabase, userId } from './supabase.js'

// Data layer: Supabase (PostgREST). Row level security makes every query return only the signed-in user's rows.
async function run(query) {
  const { data, error } = await track(query)
  if (error) throw new Error(error.message)
  return data
}

export const api = {
  mode: 'supabase',
  async list() {
    return run(supabase.from('tasks').select('*').order('created_at', { ascending: true }))
  },
  async getSettings() {
    const rows = await run(supabase.from('app_settings').select('key,value'))
    return Object.fromEntries((rows || []).map((r) => [r.key, r.value]))
  },
  async saveSetting(key, value) {
    const owner = await userId()
    return run(supabase.from('app_settings').upsert({ owner, key, value, updated_at: new Date().toISOString() }, { onConflict: 'owner,key' }))
  },
  async create(task) {
    return run(supabase.from('tasks').insert(task).select().single())
  },
  async update(id, patch) {
    return run(supabase.from('tasks').update(patch).eq('id', id))
  },
  async remove(id) {
    return run(supabase.from('tasks').delete().eq('id', id))
  },
}
