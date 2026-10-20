// Gumagawa ng n8n workflow na "Task Tracker - Extract" (POST /webhook/extract): binabasa ng Claude ang larawan ng sequence.
// Usage: AUTH_CRED_ID=<id ng Header Auth credential ng webhook> node n8n/build-extract-workflow.mjs [outfile]
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

// Code node 1: gumagawa ng request body para sa Claude Messages API
export const BUILD_CODE = `const bin = $input.first().binary && $input.first().binary.image
if (!bin) return [{ json: { error: 'Walang larawan. Ipadala ang file sa field na "image".' } }]
const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const mediaType = bin.mimeType === 'image/jpg' ? 'image/jpeg' : bin.mimeType
if (!ok.includes(mediaType)) return [{ json: { error: 'Ang larawan ay dapat PNG, JPG, WEBP o GIF (nakuha: ' + bin.mimeType + ').' } }]
const buf = await this.helpers.getBinaryDataBuffer(0, 'image')
if (buf.length > 5 * 1024 * 1024) return [{ json: { error: 'Masyadong malaki ang larawan (higit 5 MB). Paliitin o i-crop ito.' } }]
const body = {
  model: 'claude-opus-5-5',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  output_config: { effort: 'high', format: { type: 'json_schema', schema: ${JSON.stringify(SCHEMA)} } },
  system: 'You are a precise transcription tool. You copy what is visible and never guess.',
  messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } },
    { type: 'text', text: ${JSON.stringify(PROMPT)} },
  ] }],
}
return [{ json: { body } }]`

// Code node 2: sinusuri ang sagot ng Claude at ibinabalik ang { rows } o { error }
export const PARSE_CODE = `const r = $input.first().json
if (r.error && typeof r.error === 'string') return [{ json: { error: r.error } }]
if (r.body === undefined && r.type === undefined && r.content === undefined) return [{ json: { error: 'Walang sagot mula sa AI.' } }]
if (r.type === 'error') return [{ json: { error: 'Error mula sa AI: ' + ((r.error && r.error.message) || 'hindi malaman') } }]
if (r.stop_reason === 'refusal') return [{ json: { error: 'Tumanggi ang AI na basahin ang larawan.' } }]
if (r.stop_reason === 'max_tokens') return [{ json: { error: 'Naputol ang sagot ng AI (masyadong mahaba). Subukan ang mas maliit na larawan.' } }]
const block = (r.content || []).find((b) => b.type === 'text')
if (!block) return [{ json: { error: 'Walang laman ang sagot ng AI.' } }]
let data
try { data = JSON.parse(block.text) } catch (e) { return [{ json: { error: 'Hindi mabasa ang sagot ng AI (hindi tamang JSON).' } }] }
if (!data || !Array.isArray(data.rows) || !data.rows.length) return [{ json: { error: 'Walang nakitang row sa larawan.' } }]
const bad = []
const rows = data.rows.map((x, i) => {
  const row = {
    title: String(x.title == null ? '' : x.title).trim(), label: String(x.label == null ? '' : x.label).trim(),
    month: Number(x.month), day: Number(x.day), time: String(x.time == null ? '' : x.time).trim(),
    uncertain: Boolean(x.uncertain), note: String(x.note == null ? '' : x.note),
  }
  const m = row.time.match(/^(\\d{2}):(\\d{2})$/)
  if (!row.title) bad.push('row ' + (i + 1) + ': walang pangalan')
  if (!(row.month >= 1 && row.month <= 12 && Number.isInteger(row.month))) bad.push('row ' + (i + 1) + ': hindi tamang buwan')
  if (!(row.day >= 1 && row.day <= 31 && Number.isInteger(row.day))) bad.push('row ' + (i + 1) + ': hindi tamang araw')
  if (!m || +m[1] > 23 || +m[2] > 59) bad.push('row ' + (i + 1) + ': hindi tamang oras "' + row.time + '"')
  return row
})
if (bad.length) return [{ json: { error: 'May hindi tamang laman ang sagot ng AI: ' + bad.slice(0, 5).join('; ') } }]
return [{ json: { rows } }]`

export function build(authCredId = 'REPLACE_ME') {
  const auth = { httpHeaderAuth: { id: authCredId, name: 'Task Tracker API key' } }
  const nodes = [
    { id: 'extract-hook', name: 'Extract Hook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'extract-post', credentials: auth,
      parameters: { httpMethod: 'POST', path: 'extract', authentication: 'headerAuth', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
    { id: 'build-request', name: 'Build Claude Request', type: 'n8n-nodes-base.code', typeVersion: 2, position: [260, 0], parameters: { jsCode: BUILD_CODE } },
    { id: 'has-body', name: 'Has Image?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [520, 0],
      parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, combinator: 'and', conditions: [{ id: 'c1', leftValue: '={{ $json.error }}', rightValue: '', operator: { type: 'string', operation: 'empty', singleValue: true } }] } } },
    { id: 'claude', name: 'Claude (read image)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [780, -80], onError: 'continueRegularOutput',
      parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }, { name: 'content-type', value: 'application/json' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}', options: { timeout: 180000 } },
      notes: 'Gumawa ng Header Auth credential: Name = x-api-key, Value = ANTHROPIC API KEY mo.' },
    { id: 'parse', name: 'Validate Answer', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1040, -80], parameters: { jsCode: PARSE_CODE } },
    { id: 'respond', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1300, 0],
      parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: { responseCode: '={{ $json.error ? 422 : 200 }}', responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } } },
  ]
  const link = (a, b, out = 0) => ({ node: b, type: 'main', index: 0, _from: a, _out: out })
  const connections = {
    'Extract Hook': { main: [[{ node: 'Build Claude Request', type: 'main', index: 0 }]] },
    'Build Claude Request': { main: [[{ node: 'Has Image?', type: 'main', index: 0 }]] },
    'Has Image?': { main: [[{ node: 'Claude (read image)', type: 'main', index: 0 }], [{ node: 'Respond', type: 'main', index: 0 }]] }, // true -> Claude, false -> diretso sa Respond (may error)
    'Claude (read image)': { main: [[{ node: 'Validate Answer', type: 'main', index: 0 }]] },
    'Validate Answer': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
  }
  return { name: 'Task Tracker - Extract (image to rows)', nodes, connections, settings: {} }
}

if (process.argv[1] && process.argv[1].endsWith('build-extract-workflow.mjs')) {
  const out = process.argv[2] || new URL('./extract-workflow.json', import.meta.url)
  writeFileSync(out, JSON.stringify(build(process.env.AUTH_CRED_ID), null, 2))
  console.log('wrote extract workflow')
}
