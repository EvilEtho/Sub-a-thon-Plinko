import { describe, it, expect } from 'vitest'
import {
  applyRealtimeTick,
  applyTimeDelta,
  clampTimer,
  modeSign,
  outcomeSeconds
} from './timerEngine'
import { defaultTimerConfig, type TimerConfig } from '../schema/timer.schema'

const cfg = (over: Partial<TimerConfig> = {}): TimerConfig => ({ ...defaultTimerConfig(), ...over })

describe('outcomeSeconds', () => {
  it('handles each outcome kind', () => {
    const c = cfg({ baseSecondsPerBall: 60 })
    expect(outcomeSeconds({ kind: 'addTime', seconds: 45 }, c)).toBe(45)
    expect(outcomeSeconds({ kind: 'removeTime', seconds: 30 }, c)).toBe(-30)
    expect(outcomeSeconds({ kind: 'multiplier', factor: 0.5 }, c)).toBe(30)
    expect(outcomeSeconds({ kind: 'multiplier', factor: 5 }, c)).toBe(300)
    expect(outcomeSeconds({ kind: 'prize', prizeId: 'p', winChance: 1 }, c)).toBe(0)
  })
})

describe('modeSign', () => {
  it('negates only in reverse mode', () => {
    expect(modeSign(cfg({ mode: 'countdown' }))).toBe(1)
    expect(modeSign(cfg({ mode: 'mixed' }))).toBe(1)
    expect(modeSign(cfg({ mode: 'reverse' }))).toBe(-1)
  })
})

describe('clampTimer', () => {
  it('applies cap and floor', () => {
    expect(clampTimer(1000, cfg({ maxCapSeconds: 500 }))).toBe(500)
    expect(clampTimer(-10, cfg())).toBe(0)
    expect(clampTimer(-10, cfg({ allowNegative: true }))).toBe(-10)
    expect(clampTimer(50, cfg({ minFloorSeconds: 100 }))).toBe(100)
  })
})

describe('applyTimeDelta', () => {
  it('adds and clamps', () => {
    expect(applyTimeDelta(100, 50, cfg())).toBe(150)
    expect(applyTimeDelta(100, -200, cfg())).toBe(0)
    expect(applyTimeDelta(100, 1000, cfg({ maxCapSeconds: 400 }))).toBe(400)
  })
})

describe('applyRealtimeTick', () => {
  it('subtracts elapsed while ticking', () => {
    expect(applyRealtimeTick(100, 5, cfg())).toBe(95)
  })
  it('does nothing when realtimeTick is disabled', () => {
    expect(applyRealtimeTick(100, 5, cfg({ realtimeTick: false }))).toBe(100)
  })
  it('never drops below floor', () => {
    expect(applyRealtimeTick(3, 10, cfg())).toBe(0)
  })
})
