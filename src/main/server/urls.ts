export interface OverlayUrls {
  base: string
  panel: string
  board: string
  timer: string
  feed: string
  goals: string
}

/** Canonical localhost URLs for the panel + every overlay, given the bound port. */
export function buildUrls(port: number): OverlayUrls {
  const base = `http://127.0.0.1:${port}`
  return {
    base,
    panel: `${base}/panel`,
    board: `${base}/board`,
    timer: `${base}/timer`,
    feed: `${base}/feed`,
    goals: `${base}/goals`
  }
}
