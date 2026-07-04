import { z } from 'zod'
import type { PegShape } from './board.schema'

/** Visual theme for the board overlay. */
export const themeSchema = z.object({
  frameColor: z.string().default('#ff4d8d'),
  // Per-shape peg colors.
  circlePegColor: z.string().default('#b6ff7a'),
  flatPegColor: z.string().default('#5cc8ff'),
  spinnerPegColor: z.string().default('#ff6bd6'),
  trianglePegColor: z.string().default('#ffb84d'),
  pegGlowColor: z.string().default('#ff4d8d'),
  ballColor: z.string().default('#ffffff'),
  trailColor: z.string().default('#ff8fbf'),
  gateColor: z.string().default('#ffd54d'),
  /** Solid background color for the board area (pickable instead of an image). */
  backgroundColor: z.string().default('#000000'),
  /** Optional board background image (data URL) drawn over the color. */
  backgroundImage: z.string().optional(),
  /** Background opacity 0..1 (applies to color + image). Default a subtle 20%. */
  backgroundOpacity: z.number().min(0).max(1).default(0.2),
  /** Fade the board out when no balls are dropping, and in while balls are active. */
  idleFade: z.boolean().default(false),
  /** How faded the board gets when idle: 0 = fully hidden, 1 = no fade. */
  idleFadeOpacity: z.number().min(0).max(1).default(0.12),
  /** Keep the board visible this many seconds after the last ball before fading out. */
  idleFadeLingerSec: z.number().min(0).max(30).default(2.5),
  /** Show each ball owner's name on/under the ball. */
  showBallNames: z.boolean().default(true),
  /** Use the viewer's Twitch profile picture as their ball (falls back to a colored ball). */
  useAvatarBalls: z.boolean().default(false)
})
export type Theme = z.infer<typeof themeSchema>
export const defaultTheme = (): Theme => themeSchema.parse({})

/** Resolve the fill color for a peg of a given shape. */
export function pegColorFor(theme: Theme, shape: PegShape): string {
  switch (shape) {
    case 'flat':
      return theme.flatPegColor
    case 'spinner':
      return theme.spinnerPegColor
    case 'triangle':
      return theme.trianglePegColor
    default:
      return theme.circlePegColor
  }
}
