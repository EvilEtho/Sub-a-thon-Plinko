import { describe, it, expect } from 'vitest'
import { buildBoardModel, slotForX } from './boardModel'
import { boardLayoutSchema } from '../schema/board.schema'

const board = boardLayoutSchema.parse({})

describe('board model — variable slots', () => {
  it('defaults to 9 equal slots when no widths are given', () => {
    const m = buildBoardModel(board)
    expect(m.slotCount).toBe(9)
    const w0 = m.slots[0].xMax - m.slots[0].xMin
    for (const s of m.slots) expect(Math.round(s.xMax - s.xMin)).toBe(Math.round(w0))
    expect(m.dividers.length).toBe(8)
  })

  it('honors a custom slot count + normalized widths', () => {
    const m = buildBoardModel(board, 1, [25, 50, 25])
    expect(m.slotCount).toBe(3)
    expect(m.dividers.length).toBe(2)
    const playW = m.width - 2 * m.wall
    expect(Math.round(m.slots[0].xMax - m.slots[0].xMin)).toBe(Math.round(playW * 0.25))
    expect(Math.round(m.slots[1].xMax - m.slots[1].xMin)).toBe(Math.round(playW * 0.5))
    expect(Math.round(m.slots[2].xMax - m.slots[2].xMin)).toBe(Math.round(playW * 0.25))
    // slots span the full playfield with no gaps
    expect(Math.round(m.slots[0].xMin)).toBe(m.wall)
    expect(Math.round(m.slots[2].xMax)).toBe(m.width - m.wall)
  })

  it('weights that do not sum to 100 are still normalized to fill the board', () => {
    const m = buildBoardModel(board, 1, [1, 3]) // 25% / 75%
    const playW = m.width - 2 * m.wall
    expect(Math.round(m.slots[0].xMax - m.slots[0].xMin)).toBe(Math.round(playW * 0.25))
    expect(Math.round(m.slots[1].xMax - m.slots[1].xMin)).toBe(Math.round(playW * 0.75))
  })

  it('slotForX maps an x to the correct variable-width slot (and clamps outside)', () => {
    const m = buildBoardModel(board, 1, [25, 50, 25])
    expect(slotForX(m, (m.slots[1].xMin + m.slots[1].xMax) / 2)).toBe(1)
    expect(slotForX(m, m.slots[0].xMin + 1)).toBe(0)
    expect(slotForX(m, m.slots[2].xMax - 1)).toBe(2)
    expect(slotForX(m, -100)).toBe(0)
    expect(slotForX(m, 999999)).toBe(2)
  })
})
