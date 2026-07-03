let counter = 0

/** Compact, collision-resistant id for balls/alerts (not cryptographic). */
export function makeId(prefix = 'id'): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER
  const rand = Math.floor(Math.random() * 1e6).toString(36)
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${rand}`
}
