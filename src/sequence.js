// Pagbasa ng "Workflow Gap" PDF (Activation / Reminder) at pagkompyut ng schedule.
// Puro function ito (walang browser/pdf.js) kaya nasusubukan sa node at ginagamit din sa app.

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
// "Oct 1, 2026" + "4:30 AM" -> ms (UTC-naive: walang timezone o DST na gumagalaw)
export function toMs(dateStr, timeStr) {
  const d = dateStr.match(RE_DATE), t = timeStr.match(RE_TIME)
  if (!d || !t) return null
  const mon = MONTHS.indexOf(d[1]); if (mon < 0) return null
  let h = Number(t[1]) % 12; if (t[3].toUpperCase() === 'PM') h += 12
  return Date.UTC(Number(d[3]), mon, Number(d[2]), h, Number(t[2]))
}
export const msToDate = (ms) => new Date(ms).toISOString().slice(0, 10)
export const msToTime = (ms) => new Date(ms).toISOString().slice(11, 16) // 24h "HH:MM" (ito ang gamit ng subitem)
export const dayMs = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export function fmtTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ---------- PDF text items -> lines -> rows ----------
// items: [{ s, x, y }]  (galing sa pdf.js getTextContent)
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
  const text = lines.map((l) => l.items.map((i) => i.s).join(' '))
  const info = {}
  const rows = []
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

    if (/^(Yes|No)$/i.test(cells[0]) && cells.length >= 4) {
      const di = cells.findIndex((c) => RE_DATE.test(c))
      const ti = di >= 0 ? cells.findIndex((c, k) => k > di && RE_TIME.test(c)) : -1
      if (di < 0 || ti < 0) { issues.push(`Hindi nabasa ang row: "${line}"`); continue }
      const mid = cells.slice(1, di)
      if (mid.length < 2) { issues.push(`Kulang ang Subitem/Label sa row: "${line}"`); continue }
      const label = mid[mid.length - 1], title = mid.slice(0, -1).join(' ')
      const gapText = cells[ti + 1] && RE_GAP.test(cells[ti + 1]) ? cells[ti + 1] : null
      rows.push({ done: /^yes$/i.test(cells[0]), title, label, dateText: cells[di], timeText: cells[ti], gapText, gap: parseGap(gapText) })
    } else if (rows.length && cells.length === 1 && !RE_DATE.test(cells[0])) {
      rows[rows.length - 1].title += ' ' + cells[0] // naputol na pangalan sa susunod na linya
    }
  }
  rows.forEach((r) => { r.ms = toMs(r.dateText, r.timeText) })
  info.totalGap = parseGap(info.totalGapText)
  return { info, rows, issues }
}

// ---------- validation ----------
// Ang sariling Date/Time ng document ay dapat tumugma sa Gap column (cumulative).
export function validateFlow(name, rows) {
  const problems = []
  if (!rows.length) return [`${name}: walang nabasang row.`]
  if (rows.some((r) => r.ms == null)) problems.push(`${name}: may petsa o oras na hindi nabasa.`)
  if (rows[0].gap !== 0) problems.push(`${name}: ang unang step ay dapat 0hrs ang gap (nabasa: ${rows[0].gapText}).`)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], prev = rows[i - 1]
    if (r.gap == null) { problems.push(`${name}: walang Gap ang "${r.title}".`); continue }
    const real = (r.ms - prev.ms) / MIN
    if (real !== r.gap) problems.push(`${name}: "${r.title}" — Gap ${r.gapText} (${r.gap} min) pero ang pagitan ng Date/Time ay ${formatGap(real)} (${real} min).`)
  }
  const dup = rows.map((r) => r.title).filter((t, i, a) => a.indexOf(t) !== i)
  if (dup.length) problems.push(`${name}: may pare-parehong pangalan: ${[...new Set(dup)].join(', ')}`)
  return problems
}

// ---------- compute ----------
// act/rem: parseTable() result o null. launchMs: petsa+oras ng unang Activation step (o ng Reminder kung iyon lang).
// replace: [{ from, to }] para sa pagpalit ng code sa pangalan (hal. 0926 -> 1026)
export function compute({ act, rem, launchMs, replace = [] }) {
  const warnings = []
  const flows = []
  if (act) flows.push({ key: 'Activation', ...act })
  if (rem) flows.push({ key: 'Reminder', ...rem })
  if (!flows.length) return { steps: [], warnings: ['Walang file.'], errors: [] }
  const errors = []
  flows.forEach((f) => { errors.push(...validateFlow(f.key, f.rows)) })

  // Saan magsisimula ang bawat flow
  const starts = {}
  if (act) starts.Activation = launchMs
  if (rem) {
    if (act && act.rows.length && rem.rows.length) {
      const offset = rem.rows[0].ms - act.rows[0].ms // pagitan ng unang Activation at unang Reminder sa document
      starts.Reminder = launchMs + offset
      for (const side of [act, rem]) {
        if (side.info.totalGap != null && side.info.totalGap * MIN !== offset) {
          warnings.push(`"Total Gap" sa PDF (${side.info.totalGapText}) ay hindi tugma sa pagitan ng unang Activation at unang Reminder (${formatGap(offset / MIN)}).`)
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
