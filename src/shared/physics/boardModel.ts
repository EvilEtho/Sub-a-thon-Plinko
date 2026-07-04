import type { BoardLayout, Gate, PegShape } from '../schema/board.schema'
import { DEFAULT_BOARD, PHYSICS } from './constants'

export interface Vec {
  x: number
  y: number
}
export interface PegModel {
  x: number
  y: number
  radius: number
  shape: PegShape
  angle: number
  spin: number
  length: number
  oscillate: boolean
  oscillateRangePx: number
  oscillatePeriodSec: number
}
export interface RectModel {
  x: number
  y: number
  w: number
  h: number
}
export interface SlotModel {
  index: number
  xMin: number
  xMax: number
  xCenter: number
  isSuper: boolean
}

export interface BoardModel {
  width: number
  height: number
  wall: number
  slotCount: number
  slotWidth: number
  slotAreaTop: number
  landingY: number
  pegs: PegModel[]
  dividers: RectModel[]
  walls: RectModel[]
  slots: SlotModel[]
  spawn: { xMin: number; xMax: number; y: number }
  gate: Gate | null
}

/**
 * Build the concrete board geometry from a BoardLayout. If the layout supplies custom
 * pegs (from the visual designer) they are used; otherwise a standard staggered grid is
 * generated. The same model drives Matter bodies and Pixi sprites.
 */
export function buildBoardModel(board: BoardLayout, superSlotIndex = 4, slotWidths?: number[]): BoardModel {
  const width = board.width || DEFAULT_BOARD.width
  const height = board.height || DEFAULT_BOARD.height
  const wall = DEFAULT_BOARD.wall
  const playW = width - 2 * wall
  // Slot widths are relative weights (percentages); normalized so any set fills the playfield.
  const weights =
    slotWidths && slotWidths.length > 0
      ? slotWidths.map((w) => (Number.isFinite(w) && w > 0 ? w : 0.0001))
      : new Array(DEFAULT_BOARD.slots).fill(1)
  const slotCount = weights.length
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1
  const slotHeight = DEFAULT_BOARD.slotHeight
  const slotAreaTop = height - slotHeight
  const landingY = height - wall - PHYSICS.ballRadius - 2

  // Pegs come straight from the layout (generation happens at profile/layout creation),
  // so an explicitly-cleared board renders empty rather than snapping back to a default.
  const pegs: PegModel[] = board.pegs.map((p) => ({
    x: p.x,
    y: p.y,
    radius: p.radius,
    shape: p.shape,
    angle: p.angle,
    spin: p.spin,
    length: p.length,
    oscillate: p.oscillate,
    oscillateRangePx: p.oscillateRangePx,
    oscillatePeriodSec: p.oscillatePeriodSec
  }))

  // Cumulative slot boundaries across the playfield: bounds[0] = wall … bounds[slotCount] = width-wall.
  const bounds: number[] = [wall]
  for (let i = 0; i < slotCount; i++) bounds.push(bounds[i] + (weights[i] / totalWeight) * playW)

  const dividers: RectModel[] = []
  for (let i = 1; i < slotCount; i++) {
    dividers.push({ x: bounds[i], y: slotAreaTop + slotHeight / 2, w: 6, h: slotHeight })
  }

  const walls: RectModel[] = [
    { x: wall / 2, y: height / 2, w: wall, h: height },
    { x: width - wall / 2, y: height / 2, w: wall, h: height },
    { x: width / 2, y: height - wall / 2, w: width, h: wall }
  ]

  const slots: SlotModel[] = []
  for (let i = 0; i < slotCount; i++) {
    const xMin = bounds[i]
    const xMax = bounds[i + 1]
    slots.push({ index: i, xMin, xMax, xCenter: (xMin + xMax) / 2, isSuper: i === superSlotIndex })
  }

  return {
    width,
    height,
    wall,
    slotCount,
    slotWidth: playW / slotCount,
    slotAreaTop,
    landingY,
    pegs,
    dividers,
    walls,
    slots,
    spawn: {
      xMin: wall + PHYSICS.ballRadius + 2,
      xMax: width - wall - PHYSICS.ballRadius - 2,
      y: 40
    },
    gate: board.gate?.enabled ? board.gate : null
  }
}

/** Slot index for a given x coordinate (clamped to the board). */
export function slotForX(model: BoardModel, x: number): number {
  const slots = model.slots
  for (let i = 0; i < slots.length - 1; i++) {
    if (x < slots[i].xMax) return i
  }
  return slots.length - 1
}
