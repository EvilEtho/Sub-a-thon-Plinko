import type { OverlayTheme } from '@shared/schema/overlay.schema'

/** Convert #rgb / #rrggbb + opacity to an rgba() string. */
export function rgba(hex: string, opacity: number): string {
  const h = (hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length !== 6) return `rgba(20,16,31,${opacity})`
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`
}

export function setVars(vars: Record<string, string>): void {
  const s = document.documentElement.style
  for (const k in vars) s.setProperty(k, vars[k])
}

/** Apply the shared CSS variables common to every overlay. */
export function applyCommon(t: OverlayTheme): void {
  setVars({
    '--font': t.fontFamily,
    '--radius': `${t.cornerRadius}px`,
    '--panel': rgba(t.panelColor, t.panelOpacity),
    '--accent': t.accentColor,
    '--text': t.textColor,
    '--muted': t.mutedColor
  })
}
