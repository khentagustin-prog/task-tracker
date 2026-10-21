import { track } from './net.js'
import { supabase, userId } from './supabase.js'

// Data layer: Supabase (PostgREST). Row level security makes every query return only the signed-in user's rows.
async function run(query) {
  const { data, error } = await track(query)
  if (error) throw new Error(error.message)
  return data
}

// A shared board shows up under the key "<board> · <owner>" so it never clashes with a board of the same name.
export const boardKey = (board, ownerName) => `${board} · ${ownerName}`
let foreign = {} // key -> { owner, board }
let taskOwner = {} // task id -> owner id
export const setForeign = (map) => { foreign = map }

// Sharing needs supabase-v9-sharing.sql. Without it these calls fail with "does not exist" / "not found".
const missing = (e) => /does not exist|could not find|not found|schema cache|42P01|42883|PGRST20\d/i.test(`${e.code || ''} ${e.message || ''}`)
async function optional(query, fallback) {
  const { data, error } = await track(query)
  if (error) { if (missing(error)) return fallback; throw new Error(error.message) }
  return data ?? fallback
}

export const api = {
  mode: 'supabase',
  async list() {
    const rows = await run(supabase.from('tasks').select('*').order('created_at', { ascending: true }))
    taskOwner = Object.fromEntries((rows || []).map((t) => [t.id, t.owner]))
    return rows
  },
  // --- sharing ---
  async sharedBoards() { return optional(supabase.rpc('shared_boards'), []) },
  async people() { return optional(supabase.rpc('people'), null) }, // null = sharing is not set up
  async myShares() { return optional(supabase.from('board_shares').select('board,shared_with').eq('owner', await userId()), []) },
  async addShare(board, sharedWith) { return run(supabase.from('board_shares').insert({ board, shared_with: sharedWith })) },
  async removeShare(board, sharedWith) { return run(supabase.from('board_shares').delete().eq('owner', await userId()).eq('board', board).eq('shared_with', sharedWith)) },
  async leaveBoard(owner, board) { return run(supabase.from('board_shares').delete().eq('owner', owner).eq('board', board).eq('shared_with', await userId())) },
  async renameShares(oldName, newName) { return optional(supabase.from('board_shares').update({ board: newName }).eq('owner', await userId()).eq('board', oldName), null) },
  async deleteShares(board) { return optional(supabase.from('board_shares').delete().eq('owner', await userId()).eq('board', board), null) },
  async getSettings() {
    const rows = await run(supabase.from('app_settings').select('key,value'))
    return Object.fromEntries((rows || []).map((r) => [r.key, r.value]))
  },
  async saveSetting(key, value) {
    const owner = await userId()
    return run(supabase.from('app_settings').upsert({ owner, key, value, updated_at: new Date().toISOString() }, { onConflict: 'owner,key' }))
  },
  async create(task) {
    const f = foreign[task.group_name]
    const payload = f ? { ...task, group_name: f.board, owner: f.owner } : task // a task on a shared board belongs to the board's owner
    return run(supabase.from('tasks').insert(payload).select().single())
  },
  async update(id, patch) {
    if (patch.group_name !== undefined) {
      const f = foreign[patch.group_name]
      const mine = await userId()
      const from = taskOwner[id] || mine
      if ((f ? f.owner : mine) !== from) throw new Error('A task can only be moved between boards of the same owner.')
      if (f) patch = { ...patch, group_name: f.board }
    }
    return run(supabase.from('tasks').update(patch).eq('id', id))
  },
  async remove(id) {
    return run(supabase.from('tasks').delete().eq('id', id))
  },
}
