// Reads the "Workflow Gap" PDF (Activation / Reminder) and computes the schedule.
// Pure functions (no browser / pdf.js), so they are tested in node and also used by the app.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const RE_DATE = /^([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})$/
const RE_TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
const RE_GAP = /^(?:\d+\s*(?:days?|hrs?|hours?|mins?|minutes?)\s*)+$/i

export const MIN = 60000

// ---------- gap / date helpers ----------
export function parseGap(s) {
  if (!s || !RE_GAP.test(s.trim())) return null
  const g = (re) => { const m = s.match(re); return m ? Number(m[1]) : 0 }
  return g(/(\d+)\s*days?/i) * 1440 + g(/(\d+)\s*(?:hrs?|hours?)/i) * 60 + g(/(\d+)\s*(?:mins?|minutes?)/i)
}
export function formatGap(min) {
  if (min == null) return ''
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  const out = []
  if (d) out.push(`${d}day${d > 1 ? 's' : ''}`)
  if (h) out.push(`${h}hr${h > 1 ? 's' : ''}`)
  if (m) out.push(`${m}min${m > 1 ? 's' : ''}`)
  return out.join(' ') || '0hrs'
}
// "Oct 1, 2026" + "4:30 AM" -> ms (UTC-naive: no timezone or DST shifts)
export function toMs(dateStr, timeStr) {
  const d = dateStr.match(RE_DATE), t = timeStr.match(RE_TIME)
  if (!d || !t) return null
  const mon = MONTHS.indexOf(d[1]); if (mon < 0) return null
  let h = Number(t[1]) % 12; if (t[3].toUpperCase() === 'PM') h += 12
  return Date.UTC(Number(d[3]), mon, Number(d[2]), h, Number(t[2]))
}
export const msToDate = (ms) => new Date(ms).toISOString().slice(0, 10)
export const msToTime = (ms) => new Date(ms).toISOString().slice(11, 16) // 24h "HH:MM" (this is what a subitem stores)
export const dayMs = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export function fmtTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ---------- PDF text items -> lines -> rows ----------
// items: [{ s, x, y }]  (from pdf.js getTextContent)
export function itemsToLines(items) {
  const sorted = items.filter((i) => i.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x))
  return lines
}

export function parseTable(items) {
  const lines = itemsToLines(items)
  const text = lines.map((l) => l.items.map((i) => i.s.trim()).join(' '))
  const info = {}
  const rows = []
  const frags = [] // pieces of a name that wrapped onto another line (can be above or below the row)
  const issues = []
  let inTable = false
  for (let n = 0; n < lines.length; n++) {
    const cells = lines[n].items.map((i) => i.s.trim()), line = text[n]
    let m
    if ((m = line.match(/^Casino:\s*(.+)$/))) info.casino = m[1].trim()
    if ((m = line.match(/^Assigned To:\s*(.+)$/))) info.assignedTo = m[1].trim()
    if ((m = line.match(/^Workflow:\s*(.+)$/))) info.workflow = m[1].trim()
    if ((m = line.match(/^Total Gap:\s*(.+)$/))) info.totalGapText = m[1].trim()
    if ((m = line.match(/^From:\s*(.+?)\s+To:\s*(.+)$/))) { info.from = m[1].trim(); info.to = m[2].trim() }
    if (/^Done\b.*\bSubitem\b/.test(line)) { inTable = true; continue }
    if (/^Workflow Gap Summary/.test(line)) { inTable = false; continue }
    if (!inTable) continue

    if (/^(Yes|No)$/i.test(cells[0]) && cells.length >= 3) {
      const di = cells.findIndex((c) => RE_DATE.test(c))
      const ti = di >= 0 ? cells.findIndex((c, k) => k > di && RE_TIME.test(c)) : -1
      if (di < 0 || ti < 0) { issues.push(`Could not read the row: "${line}"`); continue }
      const mid = cells.slice(1, di)
      if (mid.length < 1) { issues.push(`No Label found in the row: "${line}"`); continue }
      const label = mid[mid.length - 1], own = mid.slice(0, -1).join(' ')
      const gapText = cells[ti + 1] && RE_GAP.test(cells[ti + 1]) ? cells[ti + 1] : null
      rows.push({ y: lines[n].y, own, done: /^yes$/i.test(cells[0]), label, dateText: cells[di], timeText: cells[ti], gapText, gap: parseGap(gapText) })
    } else if (cells.length === 1 && !RE_DATE.test(cells[0])) {
      frags.push({ y: lines[n].y, text: cells[0] })
    }
  }
  // Attach each wrapped piece to the nearest row (by y position)
  const parts = rows.map((r) => (r.own ? [{ y: r.y, text: r.own }] : []))
  for (const f of frags) {
    if (!rows.length) break
    let best = 0
    rows.forEach((r, i) => { if (Math.abs(r.y - f.y) < Math.abs(rows[best].y - f.y)) best = i })
    parts[best].push(f)
  }
  rows.forEach((r, i) => {
    r.title = parts[i].sort((a, b) => b.y - a.y).map((p) => p.text).join(' ').trim() // higher y = higher on the page
    delete r.own; delete r.y
    if (!r.title) issues.push(`The row with Label "${r.label}" has no name.`)
    r.ms = toMs(r.dateText, r.timeText)
  })
  info.totalGap = parseGap(info.totalGapText)
  return { info, rows, issues }
}

// ---------- validation ----------
// The document's own Date/Time must match its Gap column (cumulative).
export function validateFlow(name, rows) {
  const problems = []
  if (!rows.length) return [`${name}: no rows were read.`]
  if (rows.some((r) => r.ms == null)) problems.push(`${name}: some dates or times could not be read.`)
  if (rows[0].gap !== 0) problems.push(`${name}: the first step must have a 0hrs gap (read: ${rows[0].gapText}).`)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], prev = rows[i - 1]
    if (r.gap == null) { problems.push(`${name}: "${r.title}" has no Gap.`); continue }
    const real = (r.ms - prev.ms) / MIN
    if (real !== r.gap) problems.push(`${name}: "${r.title}" — Gap ${r.gapText} (${r.gap} min) but the Date/Time difference is ${formatGap(real)} (${real} min).`)
  }
  const dup = rows.map((r) => r.title).filter((t, i, a) => a.indexOf(t) !== i)
  if (dup.length) problems.push(`${name}: duplicate names: ${[...new Set(dup)].join(', ')}`)
  return problems
}

// ---------- compute ----------
// act/rem: parseTable() result or null. launchMs: date+time of the first Activation step (or of Reminder if that is the only one).
// replace: [{ from, to }] to swap the code inside names (e.g. 0926 -> 1026)
export function compute({ act, rem, launchMs, replace = [] }) {
  const warnings = []
  const flows = []
  if (act) flows.push({ key: 'Activation', ...act })
  if (rem) flows.push({ key: 'Reminder', ...rem })
  if (!flows.length) return { steps: [], warnings: ['No file.'], errors: [] }
  const errors = []
  flows.forEach((f) => { errors.push(...validateFlow(f.key, f.rows)) })

  // Where each flow starts
  const starts = {}
  if (act) starts.Activation = launchMs
  if (rem) {
    if (act && act.rows.length && rem.rows.length) {
      const offset = rem.rows[0].ms - act.rows[0].ms // gap between the first Activation and the first Reminder in the document
      starts.Reminder = launchMs + offset
      for (const side of [act, rem]) {
        if (side.info.totalGap != null && side.info.totalGap * MIN !== offset) {
          warnings.push(`The "Total Gap" in the PDF (${side.info.totalGapText}) does not match the difference between the first Activation and the first Reminder (${formatGap(offset / MIN)}).`)
          break
        }
      }
    } else starts.Reminder = launchMs
  }

  const steps = []
  for (const f of flows) {
    let t = starts[f.key]
    f.rows.forEach((r, i) => {
      if (i > 0) t += (r.gap ?? 0) * MIN
      let title = r.title
      for (const { from, to } of replace) if (from) title = title.split(from).join(to)
      steps.push({ flow: f.key, order: i, title, label: r.label, done: r.done, gap: r.gap, ms: t, date: msToDate(t), time: msToTime(t) })
    })
  }
  const rank = { Activation: 0, Reminder: 1 }
  steps.sort((a, b) => a.ms - b.ms || rank[a.flow] - rank[b.flow] || a.order - b.order)
  return { steps, warnings, errors }
}


// ---------- Image/review -> PDF ----------
// Gap format used in their PDFs: "0hrs", "12hrs 30mins", "1day", "6days", "4days 7hours", "3days 12hours 30mins"
export function formatGapPdf(min) {
  if (min == null || min <= 0) return '0hrs'
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  const out = []
  if (d) out.push(`${d}day${d > 1 ? 's' : ''}`)
  if (h) out.push(d ? `${h}hours` : `${h}hrs`)
  if (m) out.push(`${m}mins`)
  return out.join(' ')
}
export const dateText = (ms) => { const d = new Date(ms); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` }
export const timeText = (ms) => { const d = new Date(ms), h = d.getUTCHours(); return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }

// The flow of a row: Reminder if the label or name has "Reminder"/"Rem"; otherwise Activation
export const guessFlow = (r) => (/reminder/i.test(r.label || '') || /^rem[\s\d]/i.test((r.title || '').trim()) ? 'Reminder' : 'Activation')

// steps: [{ flow, title, label, ms }]  ->  adds the gap (minutes, from the previous step of the same flow)
export function withGaps(steps) {
  const last = {}
  return steps.map((s) => {
    const prev = last[s.flow]
    const gap = prev == null ? 0 : Math.round((s.ms - prev) / MIN)
    last[s.flow] = s.ms
    return { ...s, gap }
  })
}

// Extra checks against misreads (codes, numbers, time span)
const CODE_RE = /[A-Z]{2,6}-\d{4}[A-Z]{0,4}/
export function patternChecks(steps) {
  const out = []
  const codes = [...new Set(steps.map((s) => (s.title || '').match(CODE_RE)?.[0]).filter(Boolean))]
  if (codes.length > 1) out.push(`The names contain different codes (${codes.join(', ')}). A campaign should have one code — check the names.`)
  // "Rem Call 1, 2, 4" -> 3 is missing (only one number in the name, at least 3 rows)
  const groups = {}
  for (const s of steps) {
    const t = (s.title || '').replace(CODE_RE, '').trim(), nums = t.match(/\d+/g)
    if (nums && nums.length === 1) (groups[t.replace(/\d+/, '#')] ||= []).push(Number(nums[0]))
  }
  for (const [k, list] of Object.entries(groups)) {
    const u = [...new Set(list)].sort((a, b) => a - b)
    if (u.length < 3) continue
    const miss = []
    for (let n = u[0]; n < u[u.length - 1]; n++) if (!u.includes(n)) miss.push(n)
    if (miss.length) out.push(`"${k.replace('#', 'N')}": missing number(s) ${miss.join(', ')} (found: ${u.join(', ')}).`)
  }
  const ms = steps.map((s) => s.ms).filter((x) => x != null)
  if (ms.length > 1 && (Math.max(...ms) - Math.min(...ms)) / 86400000 > 62) out.push('The first and last steps are more than 62 days apart. Make sure the year and dates are correct.')
  return out
}

export function validateReview(steps) {
  const errors = [], warnings = []
  for (const flow of ['Activation', 'Reminder']) {
    const list = steps.filter((s) => s.flow === flow)
    list.forEach((s, i) => {
      if (!s.title?.trim()) errors.push(`${flow} #${i + 1}: no name.`)
      if (s.ms == null || Number.isNaN(s.ms)) errors.push(`${flow} "${s.title || '#' + (i + 1)}": missing a complete date/time.`)
      if (i > 0 && s.ms != null && list[i - 1].ms != null && s.ms < list[i - 1].ms) errors.push(`${flow} "${s.title}": this is earlier than the previous step (${list[i - 1].title}).`)
      if (s.uncertain) warnings.push(`${flow} "${s.title}": the AI is not sure${s.note ? ` — ${s.note}` : ''}. Check it against the image.`)
    })
    const dup = list.map((s) => s.title.trim()).filter((t, i, a) => t && a.indexOf(t) !== i)
    if (dup.length) errors.push(`${flow}: duplicate names: ${[...new Set(dup)].join(', ')}`)
  }
  warnings.push(...patternChecks(steps))
  return { errors, warnings }
}

export function summaryOf(steps) {
  const act = steps.filter((s) => s.flow === 'Activation'), rem = steps.filter((s) => s.flow === 'Reminder')
  if (!act.length || !rem.length) return null
  const total = Math.round((rem[0].ms - act[0].ms) / MIN)
  return { total, totalText: formatGapPdf(total), from: act[0].title, to: rem[0].title }
}


// Comparison of two independent AI reads (rows: [{ title, label, month, day, time }]).
// Returns: { diffs: { [index]: "explanation" }, warnings: [string] }
export function compareReads(a, b) {
  const diffs = {}, warnings = []
  if (a.length !== b.length) warnings.push(`The two reads found a different number of rows (${a.length} vs ${b.length}). Check for missing or extra rows.`)
  a.forEach((r, i) => {
    const q = b[i]
    if (!q) { diffs[i] = 'missing from the second read'; return }
    const d = []
    if ((r.title || '').trim() !== (q.title || '').trim()) d.push(`name: "${q.title}"`)
    if ((r.label || '').trim().toLowerCase() !== (q.label || '').trim().toLowerCase()) d.push(`label: "${q.label}"`)
    if (Number(r.month) !== Number(q.month) || Number(r.day) !== Number(q.day)) d.push(`date: ${q.month}/${q.day}`)
    if ((r.time || '') !== (q.time || '')) d.push(`time: ${q.time}`)
    if (d.length) diffs[i] = d.join(', ')
  })
  if (a.length !== b.length) a.forEach((_, i) => { diffs[i] = diffs[i] ? `${diffs[i]}; different number of rows` : 'the two reads have a different number of rows' })
  return { diffs, warnings }
}
