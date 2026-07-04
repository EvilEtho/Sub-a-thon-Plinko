import type { Server as HttpServer } from 'node:http'
import { Server as IOServer } from 'socket.io'
import {
  ClientEvents,
  OverlayRooms,
  ServerEvents,
  type GoalUpdatePayload,
  type HelloPayload,
  type IntegrationStatusPayload,
  type SetDropModePayload,
  type SetIdleFadePayload,
  type StageLandedPayload,
  type TestEventInput,
  type TimerUpdatePayload
} from '../../shared/types/socket'
import type { NormalizedEvent } from '../../shared/types/events'
import type { ClientLogInput } from '../../shared/types/log'
import { makeId } from '../../shared/util/id'
import { log } from '../log'
import type { Broadcaster, GameEngine } from '../game/GameEngine'

export interface SocketServer {
  io: IOServer
  broadcaster: Broadcaster
  stop: () => void
}

/** Attach Socket.IO and build a Broadcaster that fans engine state out to all clients. */
export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new IOServer(httpServer, {
    cors: { origin: true, credentials: true }
  })

  const broadcaster: Broadcaster = {
    timerUpdate: (timer) =>
      io.emit(ServerEvents.timerUpdate, { timer } satisfies TimerUpdatePayload),
    ballSpawn: (p) => io.emit(ServerEvents.ballSpawn, p),
    dropResult: (p) => io.emit(ServerEvents.dropResult, p),
    alert: (p) => io.emit(ServerEvents.alert, p),
    goalUpdate: (totals) =>
      io.emit(ServerEvents.goalUpdate, { totals } satisfies GoalUpdatePayload),
    queueUpdate: (p) => io.emit(ServerEvents.queueUpdate, p),
    controlState: (p) => io.emit(ServerEvents.controlState, p),
    boardConfig: (p) => io.emit(ServerEvents.boardConfig, p),
    boardSettings: (p) => io.emit(ServerEvents.boardSettings, p),
    overlayConfig: (p) => io.emit(ServerEvents.overlayConfig, p),
    overlayReload: () => io.emit(ServerEvents.overlayReload),
    integrationStatus: (p) => io.emit(ServerEvents.integrationStatus, p),
    prizeWinners: (p) => io.emit(ServerEvents.prizeWinners, p)
  }

  return {
    io,
    broadcaster,
    stop: () => {
      void io.close()
    }
  }
}

/** Register connection + command handlers that drive the authoritative engine. */
export function bindEngineToSocket(
  io: IOServer,
  engine: GameEngine,
  getIntegrationStatus: () => IntegrationStatusPayload
): void {
  io.on('connection', (socket) => {
    socket.on(ClientEvents.hello, (p: HelloPayload) => {
      if (p?.role && p.role in OverlayRooms) socket.join(p.role)
      log.info('socket', `client connected: ${p?.role ?? 'unknown'}`)
      // Send the full current state so a freshly-loaded client is correct immediately.
      socket.emit(ServerEvents.boardConfig, engine.boardConfigPayload())
      socket.emit(ServerEvents.overlayConfig, engine.overlayConfigPayload())
      socket.emit(ServerEvents.integrationStatus, getIntegrationStatus())
      socket.emit(ServerEvents.timerUpdate, { timer: engine.timerState() })
      socket.emit(ServerEvents.goalUpdate, { totals: engine.totals() })
      socket.emit(ServerEvents.queueUpdate, engine.queuePayload())
      socket.emit(ServerEvents.controlState, engine.controlStatePayload())
      socket.emit(ServerEvents.prizeWinners, engine.prizeWinnersPayload())
    })

    socket.on(ClientEvents.start, () => void engine.start())
    socket.on(ClientEvents.stop, () => void engine.stop())
    socket.on(ClientEvents.reset, () => void engine.reset())
    socket.on(ClientEvents.setDropMode, (p: SetDropModePayload) => {
      log.info('cmd', `set drop mode: ${p.mode}`)
      void engine.setDropMode(p.mode)
    })
    socket.on(ClientEvents.setIdleFade, (p: SetIdleFadePayload) => {
      void engine.setIdleFade(!!p?.enabled)
    })
    socket.on(ClientEvents.reloadOverlays, () => {
      log.info('cmd', 'reload overlays')
      io.emit(ServerEvents.overlayReload)
    })
    socket.on(ClientEvents.dropNext, () => engine.dropNext())
    socket.on(ClientEvents.stageLanded, (p: StageLandedPayload) => {
      if (p?.ballId) engine.onStageLanded(p.ballId, p.stageIndex, p.slotIndex, p.passedGate)
    })

    // Client (overlay/panel) log forwarding → appears in the terminal + dev console.
    socket.on(ClientEvents.clientLog, (p: ClientLogInput) => {
      const level = p?.level === 'error' ? 'error' : p?.level === 'warn' ? 'warn' : 'info'
      log[level](p?.scope || 'client', p?.message || '', p?.data)
    })

    socket.on(ClientEvents.testEvent, (input: TestEventInput) => {
      const evt: NormalizedEvent = {
        id: makeId('test'),
        source: input.source ?? 'test',
        kind: input.kind,
        userId: input.displayName || 'tester',
        displayName: input.displayName || 'Tester',
        tsEpochMs: Date.now(),
        tier: input.tier,
        giftCount: input.giftCount,
        bits: input.bits,
        amount: input.amount,
        currency: input.currency,
        coins: input.coins
      }
      engine.ingest(evt).catch((e) => log.error('engine', 'ingest failed', String(e)))
    })
  })
}
