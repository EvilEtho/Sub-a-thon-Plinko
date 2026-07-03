import { z } from 'zod'

/** Font stacks offered for the overlays (all system-safe, no web fonts). */
export const OVERLAY_FONTS = [
  "'Segoe UI', system-ui, sans-serif",
  "'Bahnschrift', 'Segoe UI', sans-serif",
  "'Cascadia Mono', 'Consolas', monospace",
  "Impact, 'Arial Black', sans-serif",
  "Georgia, 'Times New Roman', serif",
  "'Trebuchet MS', system-ui, sans-serif"
] as const

/** Which totals the goals bar can display (streamer picks any subset + order). */
export const GOAL_STAT_KEYS = ['timer', 'subs', 'bits', 'dollars', 'ccCoins', 'balls', 'timeAdded', 'timeRemoved'] as const
export type GoalStatKey = (typeof GOAL_STAT_KEYS)[number]

/**
 * Visual styling for the three non-board overlays (timer, feed, goals). Broadcast to those
 * overlays so streamers can match their stream's vibe. Colors + a few style knobs; kept
 * separate from the board Theme.
 */
export const overlayThemeSchema = z.object({
  // shared
  fontFamily: z.string().default("'Segoe UI', system-ui, sans-serif"),
  cornerRadius: z.number().min(0).max(40).default(10),
  panelColor: z.string().default('#14101f'),
  panelOpacity: z.number().min(0).max(1).default(0.82),
  accentColor: z.string().default('#ff4d8d'),
  textColor: z.string().default('#ffffff'),
  mutedColor: z.string().default('#cbb9e6'),

  // timer overlay
  timerColor: z.string().default('#ffffff'),
  timerGlowColor: z.string().default('#ff4d8d'),
  timerSizeVmin: z.number().min(4).max(30).default(16),
  timerShowMode: z.boolean().default(true),
  timerPanel: z.boolean().default(false),

  // feed overlay
  feedFontSize: z.number().min(8).max(40).default(15),
  feedMaxItems: z.number().int().min(1).max(20).default(6),
  feedLifetimeSec: z.number().min(1).max(120).default(9),
  feedSubColor: z.string().default('#a06bff'),
  feedBitsColor: z.string().default('#5cc8ff'),
  feedDonationColor: z.string().default('#3ad6a0'),
  feedCcColor: z.string().default('#ffb84d'),
  feedJackpotColor: z.string().default('#ffd54d'),
  feedPrizeColor: z.string().default('#3ad6a0'),

  // goals overlay
  goalValueColor: z.string().default('#ffffff'),
  goalValueSizePx: z.number().min(10).max(80).default(30),
  goalTimerColor: z.string().default('#ffd6e8'),
  goalStats: z.array(z.enum(GOAL_STAT_KEYS)).default(['timer', 'subs', 'bits', 'dollars', 'timeAdded'])
})
export type OverlayTheme = z.infer<typeof overlayThemeSchema>
export const defaultOverlayTheme = (): OverlayTheme => overlayThemeSchema.parse({})
