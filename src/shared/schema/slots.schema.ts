import { z } from 'zod'

/** A single slot's outcome. `prize` awards a prize (with win chance) instead of time. */
export const slotOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('addTime'), seconds: z.number() }),
  z.object({ kind: z.literal('removeTime'), seconds: z.number().nonnegative() }),
  z.object({ kind: z.literal('multiplier'), factor: z.number() }),
  z.object({
    kind: z.literal('prize'),
    prizeId: z.string(),
    winChance: z.number().min(0).max(1).default(1)
  })
])
export type SlotOutcome = z.infer<typeof slotOutcomeSchema>

export const slotConfigSchema = z.object({
  index: z.number().int().min(0),
  label: z.string().default(''),
  outcome: slotOutcomeSchema,
  color: z.string().default('#ff4d8d'),
  /** The center "super slot" (exactly one on a standard board). */
  isSuper: z.boolean().default(false)
})
export type SlotConfig = z.infer<typeof slotConfigSchema>

/** Default 9-slot board (index 4 = center super slot), loosely mirroring the reference art. */
export function defaultSlots(): SlotConfig[] {
  const mk = (
    index: number,
    outcome: SlotOutcome,
    color: string,
    label = '',
    isSuper = false
  ): SlotConfig => ({ index, label, outcome, color, isSuper })
  return [
    mk(0, { kind: 'addTime', seconds: 15 }, '#7a5cff', '+15s'),
    mk(1, { kind: 'multiplier', factor: 1.25 }, '#ff4d8d', '1.25x'),
    mk(2, { kind: 'multiplier', factor: 0.5 }, '#5cc8ff', '0.5x'),
    mk(3, { kind: 'addTime', seconds: 120 }, '#3ad6a0', '+120s'),
    mk(4, { kind: 'multiplier', factor: 5 }, '#ffd54d', '5x'),
    mk(5, { kind: 'addTime', seconds: 120 }, '#3ad6a0', '+120s'),
    mk(6, { kind: 'multiplier', factor: 0.5 }, '#5cc8ff', '0.5x'),
    mk(7, { kind: 'multiplier', factor: 1.25 }, '#ff4d8d', '1.25x'),
    mk(8, { kind: 'addTime', seconds: 15 }, '#7a5cff', '+15s')
  ]
}
