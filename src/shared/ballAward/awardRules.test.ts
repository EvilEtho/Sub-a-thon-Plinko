import { describe, it, expect } from 'vitest'
import { computeAward } from './awardRules'
import { defaultConversionRules } from '../schema/rules.schema'
import type { NormalizedEvent } from '../types/events'
import type { Accumulator } from '../schema/runtime.schema'

const rules = defaultConversionRules()
const base = (over: Partial<NormalizedEvent>): NormalizedEvent => ({
  id: 'e',
  source: 'test',
  kind: 'bits',
  userId: 'u1',
  displayName: 'U',
  tsEpochMs: 0,
  ...over
})

describe('computeAward', () => {
  it('awards balls by sub tier', () => {
    expect(computeAward(base({ kind: 'sub', tier: 1 }), undefined, rules).balls).toBe(1)
    expect(computeAward(base({ kind: 'sub', tier: 2 }), undefined, rules).balls).toBe(2)
    expect(computeAward(base({ kind: 'sub', tier: 3 }), undefined, rules).balls).toBe(5)
  })

  it('multiplies gifted subs by tier when configured', () => {
    const r = computeAward(base({ kind: 'giftsub', tier: 2, giftCount: 3 }), undefined, rules)
    expect(r.balls).toBe(6) // 3 gifts × 2 balls (tier 2)
  })

  it('gives 1 ball per gift when giftSubCountsPerSub is false', () => {
    const r = computeAward(base({ kind: 'giftsub', tier: 3, giftCount: 4 }), undefined, {
      ...rules,
      giftSubCountsPerSub: false
    })
    expect(r.balls).toBe(4)
  })

  it('accumulates bits with carried remainder', () => {
    const first = computeAward(base({ kind: 'bits', bits: 300 }), undefined, rules)
    expect(first.balls).toBe(0)
    expect(first.accumulator.bitsRemainder).toBe(300)

    const second = computeAward(base({ kind: 'bits', bits: 300 }), first.accumulator, rules)
    expect(second.balls).toBe(1) // 300 + 300 = 600 => 1 ball
    expect(second.accumulator.bitsRemainder).toBe(100)
  })

  it('floors donations by dollarsPerBall', () => {
    expect(computeAward(base({ kind: 'donation', amount: 12 }), undefined, rules).balls).toBe(2)
    expect(computeAward(base({ kind: 'donation', amount: 4.99 }), undefined, rules).balls).toBe(0)
  })

  it('accumulates CC coins with carried remainder', () => {
    const acc: Accumulator = { bitsRemainder: 0, ccCoinsRemainder: 200, dollarsRemainder: 0 }
    const r = computeAward(base({ kind: 'cc_coins', coins: 400 }), acc, rules)
    expect(r.balls).toBe(1) // 200 + 400 = 600 => 1 ball @ 500
    expect(r.accumulator.ccCoinsRemainder).toBe(100)
  })

  it('does not cross-contaminate bit and coin remainders', () => {
    const acc: Accumulator = { bitsRemainder: 400, ccCoinsRemainder: 0, dollarsRemainder: 0 }
    const r = computeAward(base({ kind: 'cc_coins', coins: 100 }), acc, rules)
    expect(r.balls).toBe(0)
    expect(r.accumulator.bitsRemainder).toBe(400) // untouched
    expect(r.accumulator.ccCoinsRemainder).toBe(100)
  })

  it('banks donation remainder across tips when carry is on', () => {
    const first = computeAward(base({ kind: 'donation', amount: 12 }), undefined, rules)
    expect(first.balls).toBe(2) // $12 @ $5 => 2 balls
    expect(first.accumulator.dollarsRemainder).toBeCloseTo(2)
    const second = computeAward(base({ kind: 'donation', amount: 8 }), first.accumulator, rules)
    expect(second.balls).toBe(2) // $2 carried + $8 = $10 => 2 balls
    expect(second.accumulator.dollarsRemainder).toBeCloseTo(0)
  })

  it('discards remainders when carryRemainder is off', () => {
    const off = { ...rules, carryRemainder: false }
    const b1 = computeAward(base({ kind: 'bits', bits: 300 }), undefined, off)
    expect(b1.balls).toBe(0)
    expect(b1.accumulator.bitsRemainder).toBe(0) // not banked
    const b2 = computeAward(base({ kind: 'bits', bits: 300 }), b1.accumulator, off)
    expect(b2.balls).toBe(0) // no carry => still under 500
    const d = computeAward(base({ kind: 'donation', amount: 12 }), undefined, off)
    expect(d.balls).toBe(2)
    expect(d.accumulator.dollarsRemainder).toBe(0)
  })

  describe('currency modes', () => {
    it('faceValue counts any currency at face value', () => {
      const r = computeAward(base({ kind: 'donation', amount: 10, currency: 'EUR' }), undefined, rules)
      expect(r.balls).toBe(2)
    })
    it('primaryOnly ignores non-primary currencies', () => {
      const cfg = { ...rules, currencyMode: 'primaryOnly' as const, primaryCurrency: 'USD' }
      expect(computeAward(base({ kind: 'donation', amount: 10, currency: 'EUR' }), undefined, cfg).balls).toBe(0)
      expect(computeAward(base({ kind: 'donation', amount: 10, currency: 'USD' }), undefined, cfg).balls).toBe(2)
    })
    it('convert multiplies by the configured rate', () => {
      const cfg = {
        ...rules,
        currencyMode: 'convert' as const,
        primaryCurrency: 'USD',
        currencyRates: { EUR: 1.2 }
      }
      // 10 EUR * 1.2 = 12 USD => floor(12/5) = 2
      expect(computeAward(base({ kind: 'donation', amount: 10, currency: 'EUR' }), undefined, cfg).balls).toBe(2)
    })
  })
})
