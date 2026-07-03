import { z } from 'zod'

export const SUPER_SLOT_BEHAVIORS = [
  'redropDoubledEscalating',
  'redropDoubledOnce',
  'instantJackpot'
] as const
export type SuperSlotBehavior = (typeof SUPER_SLOT_BEHAVIORS)[number]

export const superSlotConfigSchema = z.object({
  behavior: z.enum(SUPER_SLOT_BEHAVIORS).default('redropDoubledEscalating'),
  /** Multiplier applied (and compounded, for escalating) on each super-slot hit. */
  escalationFactor: z.number().min(1).default(2),
  /** Safety cap on re-drops to avoid an endless super-slot chain. */
  maxRedrops: z.number().int().positive().default(8),
  /** Time awarded by the instant-jackpot behavior (and the escalation safety payout). */
  jackpotSeconds: z.number().default(600),
  jackpotPrizeId: z.string().optional()
})
export type SuperSlotConfig = z.infer<typeof superSlotConfigSchema>
export const defaultSuperSlotConfig = (): SuperSlotConfig => superSlotConfigSchema.parse({})
