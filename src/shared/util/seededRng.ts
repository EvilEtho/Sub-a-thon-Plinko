/**
 * Deterministic seeded PRNG (mulberry32). Used for reproducible, auditable outcome
 * selection so a subathon can be replayed and never depends on wall-clock randomness.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer in [0, maxExclusive). */
export function randomInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}

/** Derive a fresh 32-bit seed from a previous one (for advancing persisted RNG state). */
export function nextSeed(seed: number): number {
  let a = (seed ^ 0x9e3779b9) >>> 0
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b) >>> 0
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35) >>> 0
  return (a ^ (a >>> 16)) >>> 0
}
