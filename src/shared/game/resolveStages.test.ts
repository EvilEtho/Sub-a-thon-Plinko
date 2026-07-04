import { describe, it, expect } from 'vitest'
import { resolveStages, type ReportedStage } from './resolveStages'
import type { SlotConfig, SlotOutcome } from '../schema/slots.schema'
import { defaultSuperSlotConfig, type SuperSlotConfig } from '../schema/superslot.schema'
import { defaultTimerConfig, type TimerConfig } from '../schema/timer.schema'

const slot = (index: number, outcome: SlotOutcome): SlotConfig => ({
  index,
  label: '',
  outcome,
  color: '#fff',
  isSuper: false,
  widthPct: 100 / 9
})
const slots: SlotConfig[] = [
  slot(0, { kind: 'addTime', seconds: 100 }),
  slot(1, { kind: 'multiplier', factor: 5 }),
  slot(2, { kind: 'removeTime', seconds: 40 }),
  slot(3, { kind: 'prize', prizeId: 'p', winChance: 0.5 })
]
const timer = (over: Partial<TimerConfig> = {}): TimerConfig => ({ ...defaultTimerConfig(), baseSecondsPerBall: 60, ...over })
const superCfg = (over: Partial<SuperSlotConfig> = {}): SuperSlotConfig => ({ ...defaultSuperSlotConfig(), ...over })
const rng = () => 0.4 // deterministic prize roll

const run = (stages: ReportedStage[], s = superCfg(), t = timer()) =>
  resolveStages({ stages, slots, superSlot: s, timer: t, rng })

describe('resolveStages (visual == payout)', () => {
  it('credits exactly the reported slot', () => {
    const r = run([{ slotIndex: 0, passedGate: false }])
    expect(r.needsMore).toBe(false)
    expect(r.finalSlotIndex).toBe(0)
    expect(r.timeDeltaSeconds).toBe(100)
  })

  it('applies multiplier slots from baseSecondsPerBall', () => {
    expect(run([{ slotIndex: 1, passedGate: false }]).timeDeltaSeconds).toBe(300) // 5 * 60
  })

  it('negates in reverse mode', () => {
    expect(run([{ slotIndex: 0, passedGate: false }], superCfg(), timer({ mode: 'reverse' })).timeDeltaSeconds).toBe(-100)
  })

  it('asks for another stage when a gate pass needs a re-drop', () => {
    const r = run([{ slotIndex: 0, passedGate: true }], superCfg({ behavior: 'redropDoubledEscalating' }))
    expect(r.needsMore).toBe(true)
  })

  it('escalating: second stage doubled after a gate pass', () => {
    const r = run(
      [
        { slotIndex: 0, passedGate: true }, // 100 ×1, gate → redrop
        { slotIndex: 0, passedGate: false } // 100 ×2
      ],
      superCfg({ behavior: 'redropDoubledEscalating', escalationFactor: 2 })
    )
    expect(r.needsMore).toBe(false)
    expect(r.superHits).toBe(1)
    expect(r.timeDeltaSeconds).toBe(300) // 100 + 200
    expect(r.finalSlotIndex).toBe(0)
  })

  it('instant jackpot on gate pass, no re-drop', () => {
    const r = run([{ slotIndex: 0, passedGate: true }], superCfg({ behavior: 'instantJackpot', jackpotSeconds: 600 }))
    expect(r.needsMore).toBe(false)
    expect(r.jackpot).toBe(true)
    expect(r.timeDeltaSeconds).toBe(700) // slot 100 + jackpot 600
  })

  it('resolves a prize slot via the rng roll', () => {
    expect(run([{ slotIndex: 3, passedGate: false }]).prize).toEqual({ prizeId: 'p', won: true })
  })
})
