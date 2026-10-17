// Usage: SUPABASE_KEY=sb_publishable_... node n8n/build-workflow.mjs https://YOURPROJECT.supabase.co [outfile]
import { writeFileSync } from 'node:fs'
const base = (process.argv[2] || 'https://YOUR_PROJECT.supabase.co').replace(/\/$/, '')
const url = `${base}/rest/v1/tasks`
const key = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_KEY'
const authCred = { httpHeaderAuth: { id: process.env.AUTH_CRED_ID || 'REPLACE_ME', name: 'Task Tracker API key' } }
const secure = (n) => (n.type === 'n8n-nodes-base.webhook' ? { ...n, credentials: authCred, parameters: { ...n.parameters, authentication: 'headerAuth' } } : n)
const hdr = (extra = []) => ({
  sendHeaders: true,
  headerParameters: { parameters: [{ name: 'apikey', value: key }, { name: 'Prefer', value: 'return=representation' }, ...extra] },
})
const http = (name, pos, method, u, extra = {}) => ({
  id: name, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  parameters: { method, url: u, ...hdr(), ...extra },
})
const hook = (name, pos, method, path = 'tasks') => ({
  id: name, name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos, webhookId: `${path}-${method.toLowerCase()}`,
  parameters: { httpMethod: method, path, responseMode: 'responseNode', options: { allowedOrigins: '*' } },
})
const respond = (name, pos, body = '={{ $json }}') => ({
  id: name, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos,
  parameters: { respondWith: 'allIncomingItems', options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } },
})
const storage = `${base}/storage/v1/object/task-files`
const uploadNodes = [
  { id: 'Upload Hook', name: 'Upload Hook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 800], webhookId: 'upload-post',
    parameters: { httpMethod: 'POST', path: 'upload', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
  { id: 'Upload File', name: 'Upload File', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 800],
    parameters: { method: 'POST', url: `=${storage}/{{ $json.query.path }}`, sendHeaders: true,
      headerParameters: { parameters: [{ name: 'apikey', value: key }] },
      sendBody: true, contentType: 'binaryData', inputDataFieldName: 'file' } },
  { id: 'Upload Respond', name: 'Upload Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [520, 800],
    parameters: { respondWith: 'json', responseBody: `={{ { path: $('Upload Hook').item.json.query.path, url: '${base}/storage/v1/object/public/task-files/' + $('Upload Hook').item.json.query.path } }}`,
      options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } } },
  { id: 'File Delete Hook', name: 'File Delete Hook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 1000], webhookId: 'upload-delete',
    parameters: { httpMethod: 'DELETE', path: 'upload', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
  { id: 'Delete File', name: 'Delete File', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 1000],
    parameters: { method: 'DELETE', url: `=${storage}/{{ $json.query.path }}`, sendHeaders: true,
      headerParameters: { parameters: [{ name: 'apikey', value: key }] } } },
  respond('File Delete Respond', [520, 1000]),
]
const settingsUrl = `${base}/rest/v1/app_settings`
const settingsNodes = [
  hook('Settings Get Hook', [0, 1200], 'GET', 'settings'),
  http('Settings Get', [260, 1200], 'GET', `${settingsUrl}?select=*`),
  respond('Settings Get Respond', [520, 1200]),
  hook('Settings Save Hook', [0, 1400], 'POST', 'settings'),
  { id: 'Settings Save', name: 'Settings Save', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 1400],
    parameters: { method: 'POST', url: `${settingsUrl}?on_conflict=key`, sendHeaders: true,
      headerParameters: { parameters: [{ name: 'apikey', value: key }, { name: 'Prefer', value: 'resolution=merge-duplicates,return=representation' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}' } },
  respond('Settings Save Respond', [520, 1400]),
]
const nodes = [
  hook('List Hook', [0, 0], 'GET'),
  http('List Tasks', [260, 0], 'GET', `${url}?select=*&order=created_at.asc`),
  respond('List Respond', [520, 0]),

  hook('Create Hook', [0, 200], 'POST'),
  http('Create Task', [260, 200], 'POST', url, { sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}' }),
  respond('Create Respond', [520, 200]),

  hook('Update Hook', [0, 400], 'PATCH'),
  http('Update Task', [260, 400], 'PATCH', `=${url}?id=eq.{{ $json.query.id }}`, { sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}' }),
  respond('Update Respond', [520, 400]),

  hook('Delete Hook', [0, 600], 'DELETE'),
  http('Delete Task', [260, 600], 'DELETE', `=${url}?id=eq.{{ $json.query.id }}`),
  respond('Delete Respond', [520, 600]),
  ...uploadNodes,
  ...settingsNodes,
]
const link = (a, b) => ({ [a]: { main: [[{ node: b, type: 'main', index: 0 }]] } })
nodes.forEach((n, i) => { nodes[i] = secure(n) })
const connections = Object.assign({},
  ...[['List Hook','List Tasks'],['List Tasks','List Respond'],['Create Hook','Create Task'],['Create Task','Create Respond'],
      ['Update Hook','Update Task'],['Update Task','Update Respond'],['Delete Hook','Delete Task'],['Delete Task','Delete Respond'],['Upload Hook','Upload File'],['Upload File','Upload Respond'],['File Delete Hook','Delete File'],['Delete File','File Delete Respond'],['Settings Get Hook','Settings Get'],['Settings Get','Settings Get Respond'],['Settings Save Hook','Settings Save'],['Settings Save','Settings Save Respond']].map(([a,b]) => link(a,b)))
const out = process.argv[3] || new URL('./tasks-workflow.json', import.meta.url)
writeFileSync(out, JSON.stringify({ name: 'Task Tracker API', nodes, connections, settings: {} }, null, 2))
console.log('wrote workflow for', base)
