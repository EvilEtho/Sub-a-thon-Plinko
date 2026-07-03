import { Bodies, Body, Composite, Engine } from 'matter-js'
import { mulberry32, nextSeed } from '../util/seededRng'
import { PHYSICS } from './constants'
import { slotForX, type BoardModel } from './boardModel'

export interface GateRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Simulation {
  engine: Engine
  model: BoardModel
  addBall: (spawnX: number, seed: number) => Body
  step: () => void
  landedSlot: (ball: Body) => number
  passedGate: () => boolean
  pegAngles: () => number[]
  currentGate: () => GateRect | null
}

interface SpinPeg {
  body: Body
  baseAngle: number
  radPerStep: number
}

const degPerSecToRadPerStep = (deg: number): number =>
  ((deg * Math.PI) / 180) * (PHYSICS.timeStepMs / 1000)

function makePegBody(peg: BoardModel['pegs'][number]): Body {
  const opts = {
    isStatic: true,
    restitution: PHYSICS.pegRestitution,
    angle: peg.angle,
    label: 'peg'
  }
  if (peg.shape === 'flat' || peg.shape === 'spinner') {
    return Bodies.rectangle(peg.x, peg.y, peg.length, Math.max(4, peg.radius), opts)
  }
  if (peg.shape === 'triangle') {
    return Bodies.polygon(peg.x, peg.y, 3, peg.radius * 1.6, opts)
  }
  return Bodies.circle(peg.x, peg.y, peg.radius, opts)
}

/**
 * Build a Matter.js world for the given board. Body creation order is fixed and all motion
 * (peg spin, gate oscillation) is a pure function of the per-ball step count, so a
 * (spawnX, seed) produces an identical trajectory + gate-passage result in the headless
 * solver (main) and the live overlay (browser).
 */
export function createSimulation(model: BoardModel): Simulation {
  const engine = Engine.create()
  engine.gravity.y = PHYSICS.gravityY

  const statics: Body[] = []
  for (const w of model.walls) {
    statics.push(
      Bodies.rectangle(w.x, w.y, w.w, w.h, { isStatic: true, restitution: PHYSICS.wallRestitution, label: 'wall' })
    )
  }
  for (const d of model.dividers) {
    statics.push(
      Bodies.rectangle(d.x, d.y, d.w, d.h, { isStatic: true, restitution: PHYSICS.wallRestitution, label: 'divider' })
    )
  }
  const pegBodies: Body[] = model.pegs.map((p) => makePegBody(p))
  const spinPegs: SpinPeg[] = []
  const oscPegs: { body: Body; baseX: number; range: number; period: number }[] = []
  model.pegs.forEach((p, i) => {
    const canSpin = (p.shape === 'spinner' || p.shape === 'triangle') && p.spin !== 0
    if (canSpin) spinPegs.push({ body: pegBodies[i], baseAngle: p.angle, radPerStep: degPerSecToRadPerStep(p.spin) })
    if (p.oscillate && p.oscillateRangePx > 0 && p.oscillatePeriodSec > 0) {
      const maxRange = (p.oscillatePeriodSec * 60 * (PHYSICS.ballRadius - 1)) / (2 * Math.PI)
      oscPegs.push({ body: pegBodies[i], baseX: p.x, range: Math.min(p.oscillateRangePx, maxRange), period: p.oscillatePeriodSec })
    }
  })
  Composite.add(engine.world, [...statics, ...pegBodies])

  let step = 0
  let ball: Body | null = null
  let passed = false
  let gateRect: GateRect | null = model.gate
    ? { x: model.gate.x, y: model.gate.y, w: model.gate.width, h: model.gate.height }
    : null

  const updateGeometry = (): void => {
    const t = (step * PHYSICS.timeStepMs) / 1000
    for (const op of oscPegs) {
      const nx = op.baseX + op.range * Math.sin((2 * Math.PI * t) / op.period)
      Body.setVelocity(op.body, { x: nx - op.body.position.x, y: 0 })
      Body.setPosition(op.body, { x: nx, y: op.body.position.y })
    }
    for (const sp of spinPegs) Body.setAngle(sp.body, sp.baseAngle + sp.radPerStep * step)
    if (model.gate) {
      let gx = model.gate.x
      if (model.gate.oscillate && model.gate.oscillatePeriodSec > 0) {
        gx = model.gate.x + model.gate.oscillateRangePx * Math.sin((2 * Math.PI * t) / model.gate.oscillatePeriodSec)
      }
      gateRect = { x: gx, y: model.gate.y, w: model.gate.width, h: model.gate.height }
    }
  }

  const checkGate = (): void => {
    if (!ball || !gateRect || passed) return
    const r = PHYSICS.ballRadius
    if (
      Math.abs(ball.position.x - gateRect.x) < gateRect.w / 2 + r &&
      Math.abs(ball.position.y - gateRect.y) < gateRect.h / 2 + r
    ) {
      passed = true
    }
  }

  return {
    engine,
    model,
    addBall(spawnX, seed) {
      // Reset per-ball deterministic state.
      step = 0
      passed = false
      for (const sp of spinPegs) Body.setAngle(sp.body, sp.baseAngle)
      for (const op of oscPegs) Body.setPosition(op.body, { x: op.baseX, y: op.body.position.y })
      const rng = mulberry32(seed)
      const vx = (rng() - 0.5) * 3
      const b = Bodies.circle(spawnX, model.spawn.y, PHYSICS.ballRadius, {
        restitution: PHYSICS.ballRestitution,
        friction: PHYSICS.friction,
        frictionAir: PHYSICS.frictionAir,
        label: 'ball'
      })
      Body.setVelocity(b, { x: vx, y: 0 })
      Composite.add(engine.world, b)
      ball = b
      return b
    },
    step() {
      step++
      updateGeometry()
      Engine.update(engine, PHYSICS.timeStepMs)
      checkGate()
    },
    landedSlot(b) {
      if (b.position.y >= model.landingY) return slotForX(model, b.position.x)
      return -1
    },
    passedGate: () => passed,
    pegAngles: () => pegBodies.map((b) => b.angle),
    currentGate: () => gateRect
  }
}

export interface LandingResult {
  slot: number
  passedGate: boolean
}

/** Headlessly simulate a single drop; returns the landed slot and whether it passed the gate. */
export function simulateLanding(model: BoardModel, spawnX: number, seed: number): LandingResult {
  const sim = createSimulation(model)
  const ball = sim.addBall(spawnX, seed)
  for (let i = 0; i < PHYSICS.maxSteps; i++) {
    sim.step()
    const s = sim.landedSlot(ball)
    if (s >= 0) return { slot: s, passedGate: sim.passedGate() }
  }
  return { slot: slotForX(model, ball.position.x), passedGate: sim.passedGate() }
}

export interface LaunchSample {
  spawnX: number
  seed: number
  slotIndex: number
  passedGate: boolean
}

/**
 * Precompute a table of (spawnX, seed) → landing by sweeping spawn positions across the
 * top. Built once per board; drops pick from it in O(1) so the main thread never blocks.
 */
export function buildLaunchTable(model: BoardModel, samples = 220, baseSeed = 0x51ed): LaunchSample[] {
  const out: LaunchSample[] = []
  const { xMin, xMax } = model.spawn
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0.5 : i / (samples - 1)
    const spawnX = xMin + (xMax - xMin) * t
    const seed = nextSeed((baseSeed + i * 0x9e37) >>> 0)
    const r = simulateLanding(model, spawnX, seed)
    out.push({ spawnX, seed, slotIndex: r.slot, passedGate: r.passedGate })
  }
  return out
}

/** Distinct slot indices covered by a launch table (for diagnostics/tests). */
export function tableCoverage(table: LaunchSample[]): Set<number> {
  return new Set(table.map((s) => s.slotIndex))
}

/** Pick a launch from the table (physics-distributed). Deterministic given rng. */
export function pickLaunch(table: LaunchSample[], rng: () => number): LaunchSample {
  return table[Math.floor(rng() * table.length)]
}

/** Pick a launch that lands in a specific slot, or the nearest available slot. */
export function pickLaunchForSlot(
  table: LaunchSample[],
  slot: number,
  rng: () => number
): LaunchSample {
  const matches = table.filter((s) => s.slotIndex === slot)
  if (matches.length > 0) return matches[Math.floor(rng() * matches.length)]
  let best = table[0]
  let bestDist = Infinity
  for (const s of table) {
    const d = Math.abs(s.slotIndex - slot)
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  return best
}
