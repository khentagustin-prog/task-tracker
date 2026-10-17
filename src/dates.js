export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Ilipat ang petsa (YYYY-MM-DD) ng n araw / linggo / buwan. Sa buwan: Jan 31 + 1 buwan = Feb 28 (hindi lumalampas).
export function shiftDate(s, n, unit) {
  if (!s || !n) return s || null
  const [y, m, d] = s.split('-').map(Number)
  if (unit === 'months') {
    const t = new Date(Date.UTC(y, m - 1 + n, 1))
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10)
  }
  return new Date(Date.UTC(y, m - 1, d + n * (unit === 'weeks' ? 7 : 1))).toISOString().slice(0, 10)
}

// "November 2026" -> "December 2026" (+1 buwan). Kung hindi buwan ang pangalan: "<pangalan> (copy)".
export function suggestCopy(name) {
  const m = name.trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
  const i = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1
  if (i < 0) return { name: `${name} (copy)`, n: 0 }
  const ni = (i + 1) % 12, yr = Number(m[2]) + (i === 11 ? 1 : 0)
  return { name: `${MONTHS[ni]} ${yr}`, n: 1 }
}
