import { Bodies, Body, Composite, Engine } from 'matter-js'
import { slotForX, type BoardModel } from '@shared/physics/boardModel'
import type { GateRect } from '@shared/physics/simulation'
import type { StuckBehavior } from '@shared/schema/board.schema'
import { PHYSICS } from '@shared/physics/constants'
import type { BallSpawnPayload } from '@shared/types/socket'

export interface RunnerCallbacks {
  onGatePass: (gate: GateRect) => void
  onSlotHit: (slotIndex: number) => void
  /** Report where a ball's stage ACTUALLY landed — this is what the engine credits. */
  onStageLanded: (ballId: string, stageIndex: number, slotIndex: number, passedGate: boolean) => void
}

export interface BallSnapshot {
  id: string
  x: number
  y: number
  name: string
  avatarUrl?: string
}

interface ActiveBall {
  key: string
  ballId: string
  stageIndex: number
  name: string
  avatar?: string
  body: Body
  passedGate: boolean
  steps: number
  landed: boolean
  rest: number
  reported: boolean
  checkX: number // checkpoint position at the start of the current stuck window
  checkY: number
  checkStep: number
  redrops: number
  noclipped: boolean
}

/** Tunable "stuck ball" detection (from the board config). */
export interface StuckOpts {
  behavior: StuckBehavior
  /** Window length in steps (60 steps = 1s). */
  afterSteps: number
  /** Min net displacement (px) over the window to count as still moving. */
  movePx: number
  /** Hard airtime cap in steps — force-land past this even if moving. */
  maxSteps: number
}
const DEFAULT_STUCK: StuckOpts = { behavior: 'redrop', afterSteps: 90, movePx: 16, maxSteps: 900 }

const CAT_WALL = 0x0001
const CAT_PEG = 0x0002
const CAT_BALL = 0x0004
const MAX_REDROPS = 3
const MAX_ACTIVE_BALLS = 90
const degPerSecToRadPerStep = (deg: number): number => ((deg * Math.PI) / 180) * (PHYSICS.timeStepMs / 1000)

/**
 * Browser-local, multi-ball board renderer running the AUTHORITATIVE physics: balls fall
 * with real physics and NO steering, so the slot a ball lands in is exactly what the
 * engine credits (visual == payout). Balls don't collide with each other; pegs spin and
 * the gate oscillates continuously. When a ball lands it reports (ballId, stage, slot,
 * passedGate); the engine decides super re-drops by spawning the next stage.
 */
export class PhysicsRunner {
  private engine: Engine
  private pegBodies: Body[]
  private spinPegs: { body: Body; base: number; radPerStep: number }[] = []
  private oscPegs: { body: Body; baseX: number; range: number; period: number }[] = []
  private globalStep = 0
  private gateRect: GateRect | null
  private balls: ActiveBall[] = []

  constructor(
    private readonly model: BoardModel,
    private readonly cb: RunnerCallbacks,
    private readonly stuck: StuckOpts = DEFAULT_STUCK
  ) {
    this.engine = Engine.create()
    this.engine.gravity.y = PHYSICS.gravityY

    const wallFilter = { category: CAT_WALL, mask: CAT_BALL }
    const pegFilter = { category: CAT_PEG, mask: CAT_BALL }
    const statics: Body[] = []
    for (const w of model.walls) {
      statics.push(Bodies.rectangle(w.x, w.y, w.w, w.h, { isStatic: true, restitution: PHYSICS.wallRestitution, collisionFilter: wallFilter }))
    }
    for (const d of model.dividers) {
      statics.push(Bodies.rectangle(d.x, d.y, d.w, d.h, { isStatic: true, restitution: PHYSICS.wallRestitution, collisionFilter: wallFilter }))
    }
    this.pegBodies = model.pegs.map((p) => {
      const opts = { isStatic: true, restitution: PHYSICS.pegRestitution, angle: p.angle, collisionFilter: pegFilter }
      if (p.shape === 'flat' || p.shape === 'spinner') return Bodies.rectangle(p.x, p.y, p.length, Math.max(4, p.radius), opts)
      if (p.shape === 'triangle') return Bodies.polygon(p.x, p.y, 3, p.radius * 1.6, opts)
      return Bodies.circle(p.x, p.y, p.radius, opts)
    })
    model.pegs.forEach((p, i) => {
      if ((p.shape === 'spinner' || p.shape === 'triangle') && p.spin !== 0) {
        this.spinPegs.push({ body: this.pegBodies[i], base: p.angle, radPerStep: degPerSecToRadPerStep(p.spin) })
      }
      if (p.oscillate && p.oscillateRangePx > 0 && p.oscillatePeriodSec > 0) {
        // Cap the amplitude so peak per-step motion stays under a ball radius — otherwise a
        // fast/wide swing can teleport the peg past (or deep into) a ball and eject it.
        const maxRange = (p.oscillatePeriodSec * 60 * (PHYSICS.ballRadius - 1)) / (2 * Math.PI)
        this.oscPegs.push({ body: this.pegBodies[i], baseX: p.x, range: Math.min(p.oscillateRangePx, maxRange), period: p.oscillatePeriodSec })
      }
    })
    Composite.add(this.engine.world, [...statics, ...this.pegBodies])
    this.gateRect = model.gate ? { x: model.gate.x, y: model.gate.y, w: model.gate.width, h: model.gate.height } : null
  }

  /** Spawn a real physics ball for a drop stage at a random entry x. */
  spawn(payload: BallSpawnPayload): void {
    while (this.balls.length >= MAX_ACTIVE_BALLS) this.remove(this.balls[0])
    const spawnX = this.model.spawn.xMin + Math.random() * (this.model.spawn.xMax - this.model.spawn.xMin)
    const body = this.makeBall(spawnX)
    this.balls.push({
      key: `${payload.ballId}#${payload.stageIndex}`,
      ballId: payload.ballId,
      stageIndex: payload.stageIndex,
      name: payload.displayName,
      avatar: payload.avatarUrl,
      body,
      passedGate: false,
      steps: 0,
      landed: false,
      rest: 0,
      reported: false,
      checkX: spawnX,
      checkY: this.model.spawn.y,
      checkStep: 0,
      redrops: 0,
      noclipped: false
    })
  }

  private makeBall(spawnX: number): Body {
    const body = Bodies.circle(spawnX, this.model.spawn.y, PHYSICS.ballRadius, {
      restitution: PHYSICS.ballRestitution,
      friction: PHYSICS.friction,
      frictionAir: PHYSICS.frictionAir,
      collisionFilter: { group: -1, category: CAT_BALL, mask: CAT_WALL | CAT_PEG }
    })
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 3, y: 0 })
    Composite.add(this.engine.world, body)
    return body
  }

  step(): void {
    this.globalStep++
    this.updateGeometry()
    if (this.balls.length === 0) return
    Engine.update(this.engine, PHYSICS.timeStepMs)
    for (const ball of [...this.balls]) this.updateBall(ball)
  }

  private updateGeometry(): void {
    const t = (this.globalStep * PHYSICS.timeStepMs) / 1000
    for (const op of this.oscPegs) {
      // Set velocity to the frame delta so the moving peg transfers momentum to balls it hits.
      const nx = op.baseX + op.range * Math.sin((2 * Math.PI * t) / op.period)
      Body.setVelocity(op.body, { x: nx - op.body.position.x, y: 0 })
      Body.setPosition(op.body, { x: nx, y: op.body.position.y })
    }
    for (const sp of this.spinPegs) Body.setAngle(sp.body, sp.base + sp.radPerStep * this.globalStep)
    if (this.model.gate) {
      let gx = this.model.gate.x
      if (this.model.gate.oscillate && this.model.gate.oscillatePeriodSec > 0) {
        gx = this.model.gate.x + this.model.gate.oscillateRangePx * Math.sin((2 * Math.PI * t) / this.model.gate.oscillatePeriodSec)
      }
      this.gateRect = { x: gx, y: this.model.gate.y, w: this.model.gate.width, h: this.model.gate.height }
    }
  }

  private updateBall(ball: ActiveBall): void {
    if (ball.landed) {
      if (--ball.rest <= 0) this.remove(ball)
      return
    }
    ball.steps++

    // Real gate passage (no steering — the ball goes where physics takes it).
    if (this.gateRect && !ball.passedGate) {
      const r = PHYSICS.ballRadius
      if (
        Math.abs(ball.body.position.x - this.gateRect.x) < this.gateRect.w / 2 + r &&
        Math.abs(ball.body.position.y - this.gateRect.y) < this.gateRect.h / 2 + r
      ) {
        ball.passedGate = true
        this.cb.onGatePass(this.gateRect)
      }
    }

    // Stuck detection: at the end of each window, if the ball's NET displacement was tiny it's
    // wedged (a ball weaving through a hard map still covers ground, so it isn't flagged).
    if (ball.steps - ball.checkStep >= this.stuck.afterSteps) {
      const moved = Math.hypot(ball.body.position.x - ball.checkX, ball.body.position.y - ball.checkY)
      ball.checkX = ball.body.position.x
      ball.checkY = ball.body.position.y
      ball.checkStep = ball.steps
      if (moved < this.stuck.movePx) {
        this.handleStuck(ball)
        if (ball.landed) return
      }
    }

    // Hard cap: even a ball that keeps moving is force-landed once it exceeds max airtime.
    if (ball.body.position.y >= this.model.landingY || ball.steps > this.stuck.maxSteps) {
      this.land(ball)
    }
  }

  private handleStuck(ball: ActiveBall): void {
    if (this.stuck.behavior === 'noclip' && !ball.noclipped) {
      ball.noclipped = true
      ball.body.collisionFilter.mask = CAT_WALL
      Body.setVelocity(ball.body, { x: ball.body.velocity.x, y: Math.max(ball.body.velocity.y, 4) })
    } else if (this.stuck.behavior === 'redrop' && ball.redrops < MAX_REDROPS) {
      // Re-drop the SAME stage locally (engine still awaits this stage's landing).
      ball.redrops++
      const sx = this.model.spawn.xMin + Math.random() * (this.model.spawn.xMax - this.model.spawn.xMin)
      Body.setPosition(ball.body, { x: sx, y: this.model.spawn.y })
      Body.setVelocity(ball.body, { x: (Math.random() - 0.5) * 3, y: 0 })
      ball.steps = 0
      ball.checkStep = 0
      ball.checkX = sx
      ball.checkY = this.model.spawn.y
      ball.passedGate = false
    } else if (this.stuck.behavior !== 'noclip') {
      // 'remove' (or redrop exhausted): settle it where it is.
      this.land(ball)
    }
  }

  private land(ball: ActiveBall): void {
    ball.landed = true
    ball.rest = 26
    const slotIndex = slotForX(this.model, ball.body.position.x)
    this.report(ball, slotIndex)
    this.cb.onSlotHit(slotIndex)
  }

  private report(ball: ActiveBall, slotIndex: number): void {
    if (ball.reported) return
    ball.reported = true
    this.cb.onStageLanded(ball.ballId, ball.stageIndex, slotIndex, ball.passedGate)
  }

  private remove(ball: ActiveBall): void {
    // Safety net: ensure the engine hears about every ball, even if force-removed.
    if (!ball.reported) this.report(ball, slotForX(this.model, ball.body.position.x))
    Composite.remove(this.engine.world, ball.body)
    this.balls = this.balls.filter((b) => b !== ball)
  }

  /** Live peg transforms (position + angle) so the renderer can follow spinning/oscillating pegs. */
  pegDynamics(): { x: number; y: number; angle: number }[] {
    return this.pegBodies.map((b) => ({ x: b.position.x, y: b.position.y, angle: b.angle }))
  }
  currentGate(): GateRect | null {
    return this.gateRect
  }
  activeCount(): number {
    return this.balls.length
  }
  ballSnapshots(): BallSnapshot[] {
    return this.balls.map((b) => ({ id: b.key, x: b.body.position.x, y: b.body.position.y, name: b.name, avatarUrl: b.avatar }))
  }
}
