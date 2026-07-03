import { z } from 'zod'
import { DEFAULT_BOARD, PHYSICS } from '../physics/constants'
import { makeId } from '../util/id'

export const PEG_SHAPES = ['circle', 'flat', 'spinner', 'triangle'] as const
export type PegShape = (typeof PEG_SHAPES)[number]

/** How to handle a ball that gets physically stuck on a peg. */
export const STUCK_BEHAVIORS = ['redrop', 'remove', 'noclip'] as const
export type StuckBehavior = (typeof STUCK_BEHAVIORS)[number]

/**
 * Board geometry. Pegs/gate are edited by the visual designer (M7/F1/F2) and drive both
 * the Matter.js bodies and the Pixi.js sprites via a single boardFactory.
 *
 * Peg shapes:
 * - circle: classic round peg
 * - flat: a static bar/paddle, oriented by `angle`
 * - spinner: a bar that rotates (speed = `spin`, degrees/second)
 * - triangle: adds directional randomness (can also spin)
 * `spin` is applied deterministically from the physics step count.
 */
export const pegSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  radius: z.number().positive().default(6),
  shape: z.enum(PEG_SHAPES).default('circle'),
  /** Base orientation in radians. */
  angle: z.number().default(0),
  /** Rotation speed in degrees/second (0 = static). */
  spin: z.number().default(0),
  /** Length of a flat/bar peg in px (ignored by circle/triangle). */
  length: z.number().positive().default(46),
  /** Slide the peg left/right over time (like a moving wall). */
  oscillate: z.boolean().default(false),
  /** Peak horizontal offset in px when oscillating. */
  oscillateRangePx: z.number().nonnegative().default(40),
  /** Seconds for one full left-right-left cycle. */
  oscillatePeriodSec: z.number().positive().default(3)
})
export type Peg = z.infer<typeof pegSchema>

export const boardPhysicsSchema = z.object({
  gravity: z.number().default(1),
  restitution: z.number().min(0).max(1).default(0.5),
  friction: z.number().min(0).default(0.02)
})

/**
 * The "super gate": a region the ball can pass through mid-fall to trigger the super
 * effect. Optionally oscillates side to side. When disabled, no gate exists.
 */
export const gateSchema = z.object({
  enabled: z.boolean().default(false),
  x: z.number().default(360),
  y: z.number().default(470),
  width: z.number().positive().default(90),
  height: z.number().positive().default(26),
  oscillate: z.boolean().default(false),
  /** Peak horizontal offset in px when oscillating. */
  oscillateRangePx: z.number().nonnegative().default(180),
  /** Seconds for one full left-right-left cycle. */
  oscillatePeriodSec: z.number().positive().default(4)
})
export type Gate = z.infer<typeof gateSchema>

/**
 * Generate the standard staggered peg grid. Used as the default for a NEW board and by
 * the designer's "Reset pegs". Because this is the `pegs` default (applied only when the
 * key is missing), an explicitly-empty `pegs: []` (e.g. after "Clear pegs") stays empty.
 */
export function generateDefaultPegs(): Peg[] {
  const { width, wall, slots, pegRows, pegTopY, pegRowGap } = DEFAULT_BOARD
  const slotWidth = (width - 2 * wall) / slots
  const mk = (x: number, y: number): Peg => ({
    id: makeId('peg'),
    x,
    y,
    radius: PHYSICS.pegRadius,
    shape: 'circle',
    angle: 0,
    spin: 0,
    length: 46,
    oscillate: false,
    oscillateRangePx: 40,
    oscillatePeriodSec: 3
  })
  const pegs: Peg[] = []
  for (let r = 0; r < pegRows; r++) {
    const y = pegTopY + r * pegRowGap
    if (r % 2 === 0) {
      for (let i = 0; i < slots; i++) pegs.push(mk(wall + slotWidth * (i + 0.5), y))
    } else {
      for (let i = 1; i < slots; i++) pegs.push(mk(wall + slotWidth * i, y))
    }
  }
  return pegs
}

export const boardLayoutSchema = z.object({
  width: z.number().positive().default(720),
  height: z.number().positive().default(900),
  pegs: z.array(pegSchema).default(() => generateDefaultPegs()),
  gate: gateSchema.default(() => gateSchema.parse({})),
  physics: boardPhysicsSchema.default(() => boardPhysicsSchema.parse({})),
  stuckBehavior: z.enum(STUCK_BEHAVIORS).default('redrop'),
  /** A ball is "stuck" only if it moves less than `stuckMovePx` over this many seconds. */
  stuckAfterSeconds: z.number().min(0.2).max(20).default(1.5),
  /** How far (px, any direction) a ball must travel within the window to count as still moving. */
  stuckMovePx: z.number().min(1).max(200).default(16),
  /** Absolute max airtime (seconds) before a ball is force-landed even if it's still moving. */
  maxBallSeconds: z.number().min(2).max(60).default(15)
})
export type BoardLayout = z.infer<typeof boardLayoutSchema>
export const defaultBoardLayout = (): BoardLayout => boardLayoutSchema.parse({})
