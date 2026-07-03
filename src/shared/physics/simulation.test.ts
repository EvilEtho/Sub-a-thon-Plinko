import { describe, it, expect } from 'vitest'
import { buildBoardModel } from './boardModel'
import { defaultBoardLayout } from '../schema/board.schema'
import {
  buildLaunchTable,
  pickLaunchForSlot,
  simulateLanding,
  tableCoverage
} from './simulation'

const model = buildBoardModel(defaultBoardLayout())

describe('simulateLanding', () => {
  it('is deterministic: same input → same slot', () => {
    for (const x of [120, 260, 360, 480, 620]) {
      const a = simulateLanding(model, x, 999)
      const b = simulateLanding(model, x, 999)
      expect(a.slot).toBe(b.slot)
      expect(a.slot).toBeGreaterThanOrEqual(0)
      expect(a.slot).toBeLessThan(model.slotCount)
    }
  })

  it('center spawns land near the center slots', () => {
    const mid = simulateLanding(model, model.width / 2, 12345)
    expect(mid.slot).toBeGreaterThanOrEqual(2)
    expect(mid.slot).toBeLessThanOrEqual(6)
  })
})

describe('spinning pegs + gate', () => {
  const base = defaultBoardLayout()
  const flatSpinPegs = buildBoardModel(base).pegs.map((p, i) => ({
    id: `p${i}`,
    x: p.x,
    y: p.y,
    radius: p.radius,
    shape: 'spinner' as const,
    angle: 0,
    spin: 140,
    length: 40,
    oscillate: false,
    oscillateRangePx: 40,
    oscillatePeriodSec: 3
  }))
  const wideGate = {
    enabled: true,
    x: base.width / 2,
    y: 300,
    width: base.width - 60,
    height: 40,
    oscillate: true,
    oscillateRangePx: 40,
    oscillatePeriodSec: 3
  }
  const model = buildBoardModel({ ...base, pegs: flatSpinPegs, gate: wideGate })

  it('is deterministic with spinning pegs + oscillating gate', () => {
    const a = simulateLanding(model, 360, 4242)
    const b = simulateLanding(model, 360, 4242)
    expect(a.slot).toBe(b.slot)
    expect(a.passedGate).toBe(b.passedGate)
  })

  it('detects passage through a wide gate', () => {
    expect(simulateLanding(model, base.width / 2, 4242).passedGate).toBe(true)
  })

  it('reports no gate passage when the gate is disabled', () => {
    expect(simulateLanding(buildBoardModel(base), 360, 4242).passedGate).toBe(false)
  })
})

describe('buildLaunchTable', () => {
  const table = buildLaunchTable(model)

  it('covers all 9 slots', () => {
    const coverage = tableCoverage(table)
    for (let i = 0; i < model.slotCount; i++) {
      expect(coverage.has(i)).toBe(true)
    }
  })

  it('pickLaunchForSlot returns a launch that truly lands there', () => {
    const rng = (): number => 0.5
    for (let slot = 0; slot < model.slotCount; slot++) {
      const launch = pickLaunchForSlot(table, slot, rng)
      expect(simulateLanding(model, launch.spawnX, launch.seed).slot).toBe(slot)
    }
  })
})
