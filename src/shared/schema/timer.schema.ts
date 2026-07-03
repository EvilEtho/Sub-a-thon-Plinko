import { z } from 'zod'

export const TIMER_MODES = ['countdown', 'reverse', 'mixed'] as const
export type TimerMode = (typeof TIMER_MODES)[number]

/**
 * Timer configuration.
 *
 * - `countdown` / `mixed`: ball outcomes apply with their natural sign (add adds,
 *   remove removes). `mixed` is the label for boards that intentionally mix add/remove
 *   slots.
 * - `reverse`: ball time effects are negated so viewers race the timer down.
 *
 * When `realtimeTick` is true the clock also ticks down one second per real second while
 * running (the classic subathon countdown). Set false for a "balls only" timer.
 */
export const timerConfigSchema = z.object({
  mode: z.enum(TIMER_MODES).default('countdown'),
  startSeconds: z.number().int().nonnegative().default(6 * 3600),
  maxCapSeconds: z.number().int().positive().optional(),
  minFloorSeconds: z.number().int().default(0),
  allowNegative: z.boolean().default(false),
  /** Base seconds a 1.0x multiplier slot is worth (so 0.5x = 30s, 5x = 300s at 60). */
  baseSecondsPerBall: z.number().nonnegative().default(60),
  realtimeTick: z.boolean().default(true)
})

export type TimerConfig = z.infer<typeof timerConfigSchema>
export const defaultTimerConfig = (): TimerConfig => timerConfigSchema.parse({})
