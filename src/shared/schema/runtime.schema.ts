import { z } from 'zod'
import { TIMER_MODES } from './timer.schema'

/**
 * In-progress subathon state. Persisted frequently and recovered on restart. Kept
 * separate from the Profile (config) so editing config never risks live state.
 */
export const RUNTIME_SCHEMA_VERSION = 1

export const accumulatorSchema = z.object({
  bitsRemainder: z.number().int().nonnegative().default(0),
  ccCoinsRemainder: z.number().int().nonnegative().default(0),
  /** Leftover donation amount (primary-currency units) banked toward the next tip. */
  dollarsRemainder: z.number().nonnegative().default(0)
})
export type Accumulator = z.infer<typeof accumulatorSchema>

export const totalsSchema = z.object({
  subs: z.number().int().default(0),
  bits: z.number().int().default(0),
  dollars: z.number().default(0),
  ccCoins: z.number().int().default(0),
  timeAddedSeconds: z.number().default(0),
  timeRemovedSeconds: z.number().default(0),
  ballsDropped: z.number().int().default(0)
})
export type Totals = z.infer<typeof totalsSchema>

export const queuedBallSchema = z.object({
  id: z.string(),
  source: z.enum(['twitch', 'streamlabs', 'streamelements', 'streamerbot', 'test']),
  reason: z.string(),
  userId: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  awardedAtEpochMs: z.number()
})
export type QueuedBallState = z.infer<typeof queuedBallSchema>

export const prizeWinnerSchema = z.object({
  prizeId: z.string(),
  userId: z.string(),
  displayName: z.string(),
  ballId: z.string(),
  tsEpochMs: z.number()
})
export type PrizeWinner = z.infer<typeof prizeWinnerSchema>

export const runtimeTimerSchema = z.object({
  seconds: z.number().default(6 * 3600),
  mode: z.enum(TIMER_MODES).default('countdown'),
  running: z.boolean().default(false),
  lastTickEpochMs: z.number().default(0)
})
export type RuntimeTimer = z.infer<typeof runtimeTimerSchema>

export const runtimeStateSchema = z.object({
  schemaVersion: z.number().int().default(RUNTIME_SCHEMA_VERSION),
  profileId: z.string().default('default'),
  subathonActive: z.boolean().default(false),
  timer: runtimeTimerSchema.default(() => runtimeTimerSchema.parse({})),
  accumulators: z.record(z.string(), accumulatorSchema).default({}),
  totals: totalsSchema.default(() => totalsSchema.parse({})),
  queue: z.array(queuedBallSchema).default([]),
  prizeWinners: z.array(prizeWinnerSchema).default([]),
  /** Persisted RNG seed so outcomes remain reproducible/auditable across restarts. */
  rngSeed: z.number().int().default(0x1a2b3c4d),
  /** Bounded list of recently-seen event ids for dedup. */
  seenEventIds: z.array(z.string()).default([])
})
export type RuntimeState = z.infer<typeof runtimeStateSchema>
export const defaultRuntimeState = (): RuntimeState => runtimeStateSchema.parse({})
