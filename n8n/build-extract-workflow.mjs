// Builds the n8n workflow "Task Tracker - Extract (login)" (POST /webhook/extract-auth): Groq's vision model reads a sequence image.
// Only signed-in, allowed users may call it: n8n asks Supabase (rpc whoami) who owns the bearer token and whether
// that account is on the allowed_users list.
// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... LLM_CRED_ID=<Header Auth credential with the Groq key> \
//        node n8n/build-extract-workflow.mjs [outfile]
import { writeFileSync } from 'node:fs'

export const PROMPT = `This image is a screenshot of a project-board subitem table. Transcribe EVERY row, top to bottom, exactly as it is shown.

Columns to read: Subitem (the name), Label, Date (month and day only, no year), Time (12-hour with AM/PM).

Strict rules:
- Copy each Subitem name character for character. Keep codes such as BAY-1126CT, spacing, slashes and capitalisation exactly as shown. Never correct, shorten or reformat a name.
- Label: copy the visible text. If the label is cut off with "..." in the image, return only the visible text without the ellipsis, set uncertain to true and explain in note.
- Date: month as a number 1-12 and day as a number. Time: convert to 24-hour "HH:MM" (04:30 PM -> "16:30", 10:00 AM -> "10:00", 12:00 AM -> "00:00", 12:00 PM -> "12:00").
- Include a row only if its Subitem, Date and Time are all readable. A row that is cut off at the edge of the image and not fully readable must be left out.
- If any value is blurry, ambiguous or guessed, set uncertain to true and describe the doubt in note. Otherwise uncertain is false and note is an empty string.
- Do not invent, merge, skip or reorder rows. Ignore checkboxes, owner avatars, chat icons and any other column.`

export const SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' }, label: { type: 'string' }, month: { type: 'integer' }, day: { type: 'integer' },
          time: { type: 'string' }, uncertain: { type: 'boolean' }, note: { type: 'string' },
        },
        required: ['title', 'label', 'month', 'day', 'time', 'uncertain', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
}

export const GROQ_MODEL = 'qwen/qwen3.8-27b'
const SYSTEM = 'You are a precise transcription tool. You copy what is visible and never guess.'

// Groq: Code node 1 - builds the request body for Groq (OpenAI-compatible chat completions with an image)
export const GROQ_BUILD_CODE = `const bin = $input.first().binary && $input.first().binary.image
if (!bin) return [{ json: { error: 'No image received. Send the file in the "image" field.' } }]
const ok = ['image/png', 'image/jpeg', 'image/webp']
const mediaType = bin.mimeType === 'image/jpg' ? 'image/jpeg' : bin.mimeType
if (!ok.includes(mediaType)) return [{ json: { error: 'The image must be PNG, JPG or WEBP (got: ' + bin.mimeType + ').' } }]
const buf = await this.helpers.getBinaryDataBuffer(0, 'image')
if (buf.length > 4 * 1024 * 1024) return [{ json: { error: 'The image is too large (over 4 MB). Shrink or crop it.' } }]
const url = 'data:' + mediaType + ';base64,' + buf.toString('base64')
const make = (temperature) => ({
  model: ${JSON.stringify(GROQ_MODEL)},
  temperature,
  max_completion_tokens: 8000,
  reasoning_format: 'hidden',
  response_format: { type: 'json_schema', json_schema: { name: 'rows', strict: true, schema: ${JSON.stringify(SCHEMA)} } },
  messages: [
    { role: 'system', content: ${JSON.stringify(SYSTEM)} },
    { role: 'user', content: [ { type: 'text', text: ${JSON.stringify(PROMPT)} }, { type: 'image_url', image_url: { url } } ] },
  ],
})
return [{ json: { body: make(0.1) } }]`

// Groq: Code node 2 - validates the answer and returns { rows, warnings } or { error }
export const GROQ_COMPARE_CODE = `const clean = (r, label) => {
  if (!r || typeof r !== 'object') return { error: label + ': no answer.' }
  if (r.error) return { error: label + ': ' + (typeof r.error === 'string' ? r.error : (r.error.message || 'error mula sa AI')) }
  const ch = r.choices && r.choices[0]
  if (!ch) return { error: label + ': no answer from the AI.' }
  if (ch.finish_reason === 'length') return { error: label + ': the answer was cut off (too long).' }
  let t = String((ch.message && ch.message.content) || '')
  t = t.replace(/<think>[\\s\\S]*?<\\/think>/g, '').replace(/^\\s*\`\`\`(?:json)?/i, '').replace(/\`\`\`\\s*$/, '').trim()
  let data
  try { data = JSON.parse(t) } catch (e) { return { error: label + ': the answer is not valid JSON.' } }
  if (!data || !Array.isArray(data.rows) || !data.rows.length) return { error: label + ': no rows were found in the image.' }
  const bad = []
  const rows = data.rows.map((x, i) => {
    const row = { title: String(x.title == null ? '' : x.title).trim(), label: String(x.label == null ? '' : x.label).trim(), month: Number(x.month), day: Number(x.day), time: String(x.time == null ? '' : x.time).trim(), uncertain: Boolean(x.uncertain), note: String(x.note == null ? '' : x.note) }
    const m = row.time.match(/^(\\d{2}):(\\d{2})$/)
    if (!row.title) bad.push('row ' + (i + 1) + ': no name')
    if (!(Number.isInteger(row.month) && row.month >= 1 && row.month <= 12)) bad.push('row ' + (i + 1) + ': invalid month')
    if (!(Number.isInteger(row.day) && row.day >= 1 && row.day <= 31)) bad.push('row ' + (i + 1) + ': invalid day')
    if (!m || +m[1] > 23 || +m[2] > 59) bad.push('row ' + (i + 1) + ': invalid time "' + row.time + '"')
    return row
  })
  if (bad.length) return { error: label + ': ' + bad.slice(0, 4).join('; ') }
  return { rows }
}
const pick = (name) => { try { const j = $(name).first().json; return j } catch (e) { return null } }
const raw = pick('Groq read (retry)') || pick('Groq read')
const A = clean(raw, 'Read')
if (A.error) return [{ json: { error: 'The AI could not read the image. ' + A.error + ' Try again in a minute.' } }]
return [{ json: { rows: A.rows, warnings: [] } }]`


// Code node: checks the Supabase answer (rpc whoami) for the bearer token
export const CHECK_USER_CODE = `const u = $input.first().json
const built = $('Build Request').first().json
if (!u || u.error || u.code || u.message || u.msg) return [{ json: { status: 401, error: 'Your session is not valid. Sign out and sign in again.' } }]
if (u.ok !== true) return [{ json: { status: 403, error: 'This account is not allowed.' } }]
return [{ json: built }]`

export function build({ supabaseUrl = 'https://YOUR_PROJECT.supabase.co', anonKey = 'YOUR_SUPABASE_ANON_KEY', llmCredId = 'REPLACE_ME' } = {}) {
  const llm = { httpHeaderAuth: { id: llmCredId, name: 'grock' } }
  const node = (id, name, type, typeVersion, x, y, parameters, extra = {}) => ({ id, name, type, typeVersion, position: [x, y], parameters, ...extra })
  const ifNode = (id, name, x, y, left, operation, ctype = 'string') => node(id, name, 'n8n-nodes-base.if', 2.2, x, y,
    { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, combinator: 'and', conditions: [{ id: id + '-c', leftValue: left, rightValue: '', operator: { type: ctype, operation, singleValue: true } }] } })
  const groq = (id, name, x) => node(id, name, 'n8n-nodes-base.httpRequest', 4.2, x, -80, {
    method: 'POST', url: 'https://api.groq.com/openai/v1/chat/completions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'content-type', value: 'application/json' }] },
    sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify($('Build Request').first().json.body) }}", options: { timeout: 120000 } },
    { onError: 'continueRegularOutput', credentials: llm, notes: 'Uses the existing Header Auth credential "grock" (Authorization: Bearer <Groq key>).' })

  const nodes = [
    node('extract-hook', 'Extract Hook', 'n8n-nodes-base.webhook', 2, 0, 0, { httpMethod: 'POST', path: 'extract-auth', authentication: 'none', responseMode: 'responseNode', options: { allowedOrigins: '*' } }, { webhookId: 'extract-auth-post' }),
    node('build-request', 'Build Request', 'n8n-nodes-base.code', 2, 260, 0, { jsCode: GROQ_BUILD_CODE }),
    node('verify-user', 'Verify user (Supabase)', 'n8n-nodes-base.httpRequest', 4.2, 520, 0, {
      method: 'POST', url: supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/whoami', sendHeaders: true,
      headerParameters: { parameters: [{ name: 'apikey', value: anonKey }, { name: 'Authorization', value: "={{ $('Extract Hook').first().json.headers.authorization || '' }}" }, { name: 'content-type', value: 'application/json' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '{}', options: { timeout: 20000 } },
      { onError: 'continueRegularOutput', notes: 'Calls the database function whoami() with the caller\'s token. An invalid or expired token returns an error; a valid one says whether the account is allowed.' }),
    node('check-user', 'Check user', 'n8n-nodes-base.code', 2, 780, 0, { jsCode: CHECK_USER_CODE }),
    ifNode('has-body', 'Has Image?', 1040, 0, '={{ $json.error }}', 'empty'),
    groq('groq-1', 'Groq read', 1300),
    ifNode('failed', 'Read failed?', 1560, -80, '={{ $json.error }}', 'notEmpty'),
    node('pause', 'Wait 30s (rate limit)', 'n8n-nodes-base.wait', 1.1, 1820, -160, { amount: 30, unit: 'seconds' }, { webhookId: 'extract-pause', notes: 'If Groq rate-limits the call (limit per minute), wait 30 seconds and retry once.' }),
    groq('groq-retry', 'Groq read (retry)', 2080),
    node('compare', 'Validate Answer', 'n8n-nodes-base.code', 2, 2340, -80, { jsCode: GROQ_COMPARE_CODE }),
    node('respond', 'Respond', 'n8n-nodes-base.respondToWebhook', 1.1, 2600, 0, { respondWith: 'json', responseBody: '={{ $json }}', options: { responseCode: '={{ $json.status || ($json.error ? 422 : 200) }}', responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } }),
  ]
  const to = (...names) => ({ main: [names.map((n) => ({ node: n, type: 'main', index: 0 }))] })
  const connections = {
    'Extract Hook': to('Build Request'),
    'Build Request': to('Verify user (Supabase)'),
    'Verify user (Supabase)': to('Check user'),
    'Check user': to('Has Image?'),
    'Has Image?': { main: [[{ node: 'Groq read', type: 'main', index: 0 }], [{ node: 'Respond', type: 'main', index: 0 }]] },
    'Groq read': to('Read failed?'),
    'Read failed?': { main: [[{ node: 'Wait 30s (rate limit)', type: 'main', index: 0 }], [{ node: 'Validate Answer', type: 'main', index: 0 }]] },
    'Wait 30s (rate limit)': to('Groq read (retry)'),
    'Groq read (retry)': to('Validate Answer'),
    'Validate Answer': to('Respond'),
  }
  return { name: 'Task Tracker - Extract (login)', nodes, connections, settings: {} }
}

if (process.argv[1] && process.argv[1].endsWith('build-extract-workflow.mjs')) {
  const out = process.argv[2] || new URL('./extract-workflow.json', import.meta.url)
  const wf = build({ supabaseUrl: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, llmCredId: process.env.LLM_CRED_ID })
  writeFileSync(out, JSON.stringify(wf, null, 2))
  console.log('wrote extract workflow')
}
