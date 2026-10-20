// Tracks pending network requests for the top loading bar.
let pending = 0
const subs = new Set()
const emit = () => subs.forEach((f) => f(pending))
export const subscribe = (f) => { subs.add(f); f(pending); return () => subs.delete(f) }
export async function track(promise) {
  pending++; emit()
  try { return await promise } finally { pending--; emit() }
}
