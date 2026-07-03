import { describe, it, expect } from 'vitest'
import { resolveDrop } from './resolveDrop'
import type { SlotConfig, SlotOutcome } from '../schema/slots.schema'
import { defaultSuperSlotConfig, type SuperSlotConfig } from '../schema/superslot.schema'
import { defaultTimerConfig, type TimerConfig } from '../schema/timer.schema'

/** Deterministic rng that plays back a fixed sequence (repeats the last value). */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

const slot = (index: number, outcome: SlotOutcome, isSuper = false): SlotConfig => ({
  index,
  label: '',
  outcome,
  color: '#fff',
  isSuper
})

const timer = (over: Partial<TimerConfig> = {}): TimerConfig => ({
  ...defaultTimerConfig(),
  baseSecondsPerBall: 60,
  ...over
})
const superCfg = (over: Partial<SuperSlotConfig> = {}): SuperSlotConfig => ({
  ...defaultSuperSlotConfig(),
  ...over
})

describe('resolveDrop', () => {
  it('applies a normal addTime slot (countdown)', () => {
    const slots = [slot(0, { kind: 'addTime', seconds: 100 })]
    const r = resolveDrop({ ballId: 'b', slots, superSlot: superCfg(), timer: timer(), rng: seqRng([0]) })
    expect(r.finalSlotIndex).toBe(0)
    expect(r.timeDeltaSeconds).toBe(100)
    expect(r.superHits).toBe(0)
  })

  it('negates time in reverse mode', () => {
    const slots = [slot(0, { kind: 'addTime', seconds: 100 })]
    const r = resolveDrop({
      ballId: 'b',
      slots,
      superSlot: superCfg(),
      timer: timer({ mode: 'reverse' }),
      rng: seqRng([0])
    })
    expect(r.timeDeltaSeconds).toBe(-100)
  })

  it('computes multiplier slots from baseSecondsPerBall', () => {
    const slots = [slot(0, { kind: 'multiplier', factor: 5 })]
    const r = resolveDrop({ ballId: 'b', slots, superSlot: superCfg(), timer: timer(), rng: seqRng([0]) })
    expect(r.timeDeltaSeconds).toBe(300)
  })

  it('resolves prize win/lose via the rng roll', () => {
    const slots = [slot(0, { kind: 'prize', prizeId: 'p', winChance: 0.5 })]
    const won = resolveDrop({
      ballId: 'b',
      slots,
      superSlot: superCfg(),
      timer: timer(),
      rng: seqRng([0, 0.4])
    })
    expect(won.prize).toEqual({ prizeId: 'p', won: true })
    const lost = resolveDrop({
      ballId: 'b',
      slots,
      superSlot: superCfg(),
      timer: timer(),
      rng: seqRng([0, 0.9])
    })
    expect(lost.prize).toEqual({ prizeId: 'p', won: false })
  })

  it('instant jackpot awards jackpotSeconds without a re-drop', () => {
    const slots = [slot(0, { kind: 'addTime', seconds: 0 }, true)]
    const r = resolveDrop({
      ballId: 'b',
      slots,
      superSlot: superCfg({ behavior: 'instantJackpot', jackpotSeconds: 600 }),
      timer: timer(),
      rng: seqRng([0])
    })
    expect(r.jackpot).toBe(true)
    expect(r.timeDeltaSeconds).toBe(600)
    expect(r.superHits).toBe(1)
  })

  it('redropDoubledOnce doubles a single re-drop', () => {
    const slots = [slot(0, { kind: 'addTime', seconds: 0 }, true), slot(1, { kind: 'addTime', seconds: 50 })]
    const r = resolveDrop({
      ballId: 'b',
      slots,
      superSlot: superCfg({ behavior: 'redropDoubledOnce', escalationFactor: 2 }),
      timer: timer(),
      rng: seqRng([0, 0.6]) // super, then index 1
    })
    expect(r.timeDeltaSeconds).toBe(100) // 50 × 2
    expect(r.superHits).toBe(1)
    expect(r.path).toEqual([0, 1])
  })

  it('redropDoubledEscalating compounds across repeated super hits', () => {
    const slots = [slot(0, { kind: 'addTime', seconds: 0 }, true), slot(1, { kind: 'addTime', seconds: 50 })]
    const r = resolveDrop({
      ballId: 'b',
      slots,
      superSlot: superCfg({ behavior: 'redropDoubledEscalating', escalationFactor: 2 }),
      timer: timer(),
      rng: seqRng([0, 0, 0.6]) // super, super, then index 1
    })
    expect(r.superHits).toBe(2)
    expect(r.multiplier).toBe(4)
    expect(r.timeDeltaSeconds).toBe(200) // 50 × 4
    expect(r.path).toEqual([0, 0, 1])
  })
})
