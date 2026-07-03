import type { NormalizedEvent } from '../types/events'
import { ballsForTier, effectiveDonationAmount, type ConversionRules } from '../schema/rules.schema'
import type { Accumulator } from '../schema/runtime.schema'

export interface AwardResult {
  balls: number
  reason: string
  /** Updated accumulator for this user (bits/CC coin remainders carried forward). */
  accumulator: Accumulator
}

const emptyAcc = (): Accumulator => ({ bitsRemainder: 0, ccCoinsRemainder: 0, dollarsRemainder: 0 })

/**
 * Pure ball-award computation. Given an event, the user's current accumulator, and the
 * conversion rules, returns how many balls to award, a human reason, and the updated
 * accumulator (remainders carried for bits and CC coins).
 */
export function computeAward(
  evt: NormalizedEvent,
  acc: Accumulator | undefined,
  rules: ConversionRules
): AwardResult {
  const a: Accumulator = { ...emptyAcc(), ...acc }

  switch (evt.kind) {
    case 'sub':
    case 'resub': {
      const tier = evt.tier ?? 1
      const balls = ballsForTier(rules, tier)
      return { balls, reason: `Tier ${tier} ${evt.kind}`, accumulator: a }
    }
    case 'giftsub': {
      const tier = evt.tier ?? 1
      const count = Math.max(1, evt.giftCount ?? 1)
      const perGift = rules.giftSubCountsPerSub ? ballsForTier(rules, tier) : 1
      return {
        balls: count * perGift,
        reason: `${count}× gifted Tier ${tier}`,
        accumulator: a
      }
    }
    case 'bits': {
      const total = (rules.carryRemainder ? a.bitsRemainder : 0) + Math.max(0, evt.bits ?? 0)
      const balls = Math.floor(total / rules.bitsPerBall)
      a.bitsRemainder = rules.carryRemainder ? total % rules.bitsPerBall : 0
      return { balls, reason: `${evt.bits ?? 0} bits`, accumulator: a }
    }
    case 'donation': {
      const raw = Math.max(0, evt.amount ?? 0)
      const cur = evt.currency ?? '$'
      const eff = effectiveDonationAmount(rules, raw, evt.currency)
      if (eff === null) {
        return { balls: 0, reason: `${cur}${raw} (other currency, ignored)`, accumulator: a }
      }
      const total = (rules.carryRemainder ? a.dollarsRemainder : 0) + eff
      const balls = Math.floor(total / rules.dollarsPerBall)
      a.dollarsRemainder = rules.carryRemainder ? total % rules.dollarsPerBall : 0
      return { balls, reason: `${cur}${raw} donation`, accumulator: a }
    }
    case 'cc_coins': {
      const total = (rules.carryRemainder ? a.ccCoinsRemainder : 0) + Math.max(0, evt.coins ?? 0)
      const balls = Math.floor(total / rules.ccCoinsPerBall)
      a.ccCoinsRemainder = rules.carryRemainder ? total % rules.ccCoinsPerBall : 0
      return { balls, reason: `${evt.coins ?? 0} CC coins`, accumulator: a }
    }
    default:
      return { balls: 0, reason: 'unknown', accumulator: a }
  }
}
