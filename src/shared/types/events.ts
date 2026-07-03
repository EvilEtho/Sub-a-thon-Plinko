import type { SlotOutcome } from '../schema/slots.schema'

export type EventSource = 'twitch' | 'streamlabs' | 'streamelements' | 'streamerbot' | 'test'
export type EventKind = 'sub' | 'resub' | 'giftsub' | 'bits' | 'donation' | 'cc_coins'

/** A platform event normalized to a single internal shape before award computation. */
export interface NormalizedEvent {
  id: string
  source: EventSource
  kind: EventKind
  userId: string
  displayName: string
  tsEpochMs: number
  /** Optional avatar (e.g. Twitch profile image) for avatar-ball rendering. */
  avatarUrl?: string
  // kind-specific fields
  tier?: 1 | 2 | 3
  giftCount?: number
  bits?: number
  amount?: number // donation amount in major currency units
  currency?: string
  coins?: number // Crowd Control coins (already source-filtered by the adapter)
}

/** A ball earned from an event, waiting in the queue to be dropped. */
export interface QueuedBall {
  id: string
  source: EventSource
  reason: string
  userId: string
  displayName: string
  avatarUrl?: string
  awardedAtEpochMs: number
}

/** The authoritative result of dropping one ball. */
export interface DropResult {
  ballId: string
  /** Slot indices visited (super-slot re-drops append), last is the final slot. */
  path: number[]
  finalSlotIndex: number
  outcome: SlotOutcome
  timeDeltaSeconds: number // already mode-signed
  superHits: number
  multiplier: number
  jackpot: boolean
  prize?: { prizeId: string; won: boolean }
}
