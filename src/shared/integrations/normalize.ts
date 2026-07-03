import type { NormalizedEvent } from '../types/events'

/** A normalized event without the transport-assigned id/timestamp. */
export type PartialEvent = Omit<NormalizedEvent, 'id' | 'tsEpochMs'>

/** Map a Twitch sub tier ("1000"/"2000"/"3000" or number) to 1/2/3. */
export function tierFromTwitch(tier: string | number | undefined): 1 | 2 | 3 {
  const t = typeof tier === 'string' ? parseInt(tier, 10) : (tier ?? 1000)
  if (t >= 3000) return 3
  if (t >= 2000) return 2
  return 1
}

export interface StreamlabsDonationMsg {
  name?: string
  amount?: string | number
  currency?: string
  message?: string
}

/** Map a Streamlabs donation message to a normalized donation event. */
export function mapStreamlabsDonation(m: StreamlabsDonationMsg): PartialEvent {
  const amount = typeof m.amount === 'string' ? parseFloat(m.amount) : (m.amount ?? 0)
  const name = m.name || 'Anonymous'
  return {
    source: 'streamlabs',
    kind: 'donation',
    userId: name,
    displayName: name,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: m.currency || '$'
  }
}

export interface StreamElementsTipData {
  username?: string
  displayName?: string
  amount?: number
  currency?: string
  message?: string
}

/** Map a StreamElements tip payload to a normalized donation event. */
export function mapStreamElementsTip(d: StreamElementsTipData): PartialEvent {
  const name = d.displayName || d.username || 'Anonymous'
  return {
    source: 'streamelements',
    kind: 'donation',
    userId: d.username || name,
    displayName: name,
    amount: Math.max(0, d.amount ?? 0),
    currency: d.currency || '$'
  }
}
