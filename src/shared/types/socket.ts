/**
 * Shared Socket.IO contract between the embedded server (Electron main) and every
 * client: the OBS overlays (board / timer / feed / goals) and the control panel.
 *
 * The server is the single source of truth; clients render broadcast state and send
 * commands.
 */
import type { Totals } from '../schema/runtime.schema'
import type { DropMode } from '../schema/profile.schema'
import type { BoardLayout } from '../schema/board.schema'
import type { Theme } from '../schema/theme.schema'
import type { OverlayTheme } from '../schema/overlay.schema'
import type { EventKind, EventSource } from './events'

/** Logical rooms a client can belong to. A client announces its role via `hello`. */
export const OverlayRooms = {
  board: 'board',
  timer: 'timer',
  feed: 'feed',
  goals: 'goals',
  panel: 'panel'
} as const
export type OverlayRoom = keyof typeof OverlayRooms

export type TimerMode = 'countdown' | 'reverse' | 'mixed'

export interface TimerState {
  seconds: number
  mode: TimerMode
  running: boolean
}

/** Server → client event names. */
export const ServerEvents = {
  timerUpdate: 'timer:update',
  ballSpawn: 'ball:spawn',
  dropResult: 'drop:result',
  alert: 'feed:alert',
  goalUpdate: 'goal:update',
  queueUpdate: 'queue:update',
  controlState: 'control:state',
  boardConfig: 'board:config',
  overlayConfig: 'overlay:config',
  integrationStatus: 'integration:status',
  prizeWinners: 'prize:winners',
  devLog: 'dev:log'
} as const

/** Client → server event names. */
export const ClientEvents = {
  hello: 'hello',
  start: 'ctrl:start',
  stop: 'ctrl:stop',
  reset: 'ctrl:reset',
  setDropMode: 'ctrl:setDropMode',
  dropNext: 'ctrl:dropNext',
  testEvent: 'ctrl:testEvent',
  clientLog: 'client:log',
  stageLanded: 'stage:landed'
} as const

export interface HelloPayload {
  role: OverlayRoom
}

export interface TimerUpdatePayload {
  timer: TimerState
}

export interface BallSpawnPayload {
  ballId: string
  /** Which drop in a super re-drop chain this is (0 = first). */
  stageIndex: number
  displayName: string
  avatarUrl?: string
  reason: string
  source: EventSource
}

export interface DropResultPayload {
  ballId: string
  finalSlotIndex: number
  timeDeltaSeconds: number
  superHits: number
  jackpot: boolean
  prizeWon: boolean
  displayName: string
  reason: string
}

/** Slot descriptor sent to the board overlay for rendering labels/colors. */
export interface BoardSlotInfo {
  index: number
  label: string
  color: string
  isSuper: boolean
}

export interface BoardConfigPayload {
  board: BoardLayout
  superSlotIndex: number
  slots: BoardSlotInfo[]
  theme: Theme
}

export interface OverlayConfigPayload {
  overlay: OverlayTheme
}

export interface QueueItem {
  id: string
  reason: string
  displayName: string
}
export interface QueueUpdatePayload {
  count: number
  items: QueueItem[]
}

export interface GoalUpdatePayload {
  totals: Totals
}

export interface ControlStatePayload {
  subathonActive: boolean
  running: boolean
  dropMode: DropMode
  queueCount: number
}

export interface AlertPayload {
  id: string
  kind: 'sub' | 'bits' | 'donation' | 'cc' | 'drop' | 'jackpot' | 'prize' | 'system'
  title: string
  detail?: string
  tsEpochMs: number
}

/** Control-panel test-event injector input (server fills id/userId/ts). */
export interface TestEventInput {
  kind: EventKind
  source?: EventSource
  displayName?: string
  tier?: 1 | 2 | 3
  giftCount?: number
  bits?: number
  amount?: number
  currency?: string
  coins?: number
}

export interface SetDropModePayload {
  mode: DropMode
}

/** Sent by the board overlay when a ball's stage physically lands (real slot + gate). */
export interface StageLandedPayload {
  ballId: string
  stageIndex: number
  slotIndex: number
  passedGate: boolean
}

export type IntegrationId = 'twitch' | 'streamlabs' | 'streamelements' | 'streamerbot'
export type IntegrationConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface IntegrationStatusEntry {
  id: IntegrationId
  enabled: boolean
  status: IntegrationConnStatus
  detail?: string
}

export interface IntegrationStatusPayload {
  integrations: IntegrationStatusEntry[]
}

export interface PrizeWinnerInfo {
  prizeId: string
  prizeName: string
  displayName: string
  tsEpochMs: number
}

export interface PrizeWinnersPayload {
  winners: PrizeWinnerInfo[]
}
