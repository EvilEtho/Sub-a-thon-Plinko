import { connectOverlay } from '../shared/connect'
import {
  ClientEvents,
  ServerEvents,
  type BallSpawnPayload,
  type BoardConfigPayload,
  type BoardSettingsPayload,
  type DropResultPayload
} from '@shared/types/socket'
import type { LogLevel } from '@shared/types/log'
import { buildBoardModel } from '@shared/physics/boardModel'
import { PHYSICS } from '@shared/physics/constants'
import { PixiStage } from './PixiStage'
import { PhysicsRunner } from './PhysicsRunner'
import { AudioFx } from './AudioFx'

const mount = document.getElementById('stage')!

const stage = new PixiStage()
const audio = new AudioFx()
let runner: PhysicsRunner | null = null

// Debug hook: lets a headless test (and the dev console) confirm the board's REAL
// landings match what the engine credits (visual == payout).
interface ReportedLanding {
  ballId: string
  stageIndex: number
  slotIndex: number
  passedGate: boolean
  t: number
}
const dbg: { reported: ReportedLanding[]; results: unknown[] } = { reported: [], results: [] }
;(window as unknown as { __plinko: typeof dbg & { activeCount: () => number } }).__plinko = {
  ...dbg,
  activeCount: () => runner?.activeCount() ?? 0
}

async function boot(): Promise<void> {
  await stage.init(mount)

  const socket = connectOverlay('board')
  const report = (level: LogLevel, message: string, data?: unknown): void => {
    socket.emit(ClientEvents.clientLog, { level, scope: 'board', message, data })
  }

  for (const evt of ['pointerdown', 'keydown']) {
    window.addEventListener(evt, () => audio.arm(), { once: true })
  }
  window.addEventListener('error', (e) => report('error', e.message, { src: e.filename, line: e.lineno }))
  window.addEventListener('unhandledrejection', (e) => report('error', 'unhandledrejection', String((e as PromiseRejectionEvent).reason)))
  socket.on('connect', () => report('info', 'board overlay connected'))

  let tickerErrors = 0
  let acc = 0
  stage.app.ticker.add((ticker) => {
    try {
      acc += ticker.deltaMS
      let steps = 0
      // Always step (even with no balls) so pegs/gate keep moving — the board is alive.
      while (acc >= PHYSICS.timeStepMs && steps < 8) {
        runner?.step()
        acc -= PHYSICS.timeStepMs
        steps++
      }
      if (runner) {
        stage.updateDynamic(runner.pegDynamics(), runner.currentGate())
        stage.renderBalls(runner.ballSnapshots())
        stage.setActive(runner.activeCount() > 0)
      }
    } catch (err) {
      // Never let one bad frame kill the render loop; report the first few.
      acc = 0
      if (tickerErrors++ < 5) report('error', 'render tick failed', String(err))
    }
  })

  socket.on(ServerEvents.boardConfig, (cfg: BoardConfigPayload) => {
    try {
      const model = buildBoardModel(cfg.board, cfg.superSlotIndex, cfg.slots.map((s) => s.widthPct))
      stage.setBoard(model, cfg.slots, cfg.theme)
      runner = new PhysicsRunner(
        model,
        {
          onGatePass: (gate) => {
            stage.gatePulse(gate)
            stage.jackpotFlash()
            audio.jackpot()
          },
          onSlotHit: (slotIndex) => {
            const geo = model.slots[slotIndex]
            stage.flashSlot(slotIndex)
            if (geo) stage.burst(geo.xCenter, model.slotAreaTop + 20, 0xffffff, 10)
            audio.land()
          },
          // Report the REAL landing → the engine credits exactly this slot (visual == payout).
          onStageLanded: (ballId, stageIndex, slotIndex, passedGate) => {
            socket.emit(ClientEvents.stageLanded, { ballId, stageIndex, slotIndex, passedGate })
            dbg.reported.push({ ballId, stageIndex, slotIndex, passedGate, t: Date.now() })
            report('info', `landed → slot ${slotIndex}`, { ballId, stageIndex, passedGate })
          }
        },
        {
          behavior: cfg.board.stuckBehavior,
          afterSteps: Math.max(6, Math.round(cfg.board.stuckAfterSeconds * 60)),
          movePx: cfg.board.stuckMovePx,
          maxSteps: Math.max(60, Math.round(cfg.board.maxBallSeconds * 60))
        }
      )
      report('info', 'board configured', { pegs: model.pegs.length, gate: !!model.gate })
    } catch (err) {
      report('error', 'boardConfig failed', String(err))
    }
  })

  socket.on(ServerEvents.ballSpawn, (p: BallSpawnPayload) => {
    audio.arm()
    stage.setActive(true) // show the board a moment before the ball reaches the pegs
    runner?.spawn(p)
  })

  socket.on(ServerEvents.boardSettings, (p: BoardSettingsPayload) => {
    stage.patchFade(p.idleFade, p.idleFadeOpacity, p.idleFadeLingerSec)
  })

  // Record what the engine actually credited so a test can prove visual == payout.
  socket.on(ServerEvents.dropResult, (p: DropResultPayload) => {
    dbg.results.push(p)
  })
}

void boot()
