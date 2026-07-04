import type { Profile, DropMode } from '../../shared/schema/profile.schema'
import { defaultSlots } from '../../shared/schema/slots.schema'
import type { RuntimeState, Totals } from '../../shared/schema/runtime.schema'
import type { NormalizedEvent, QueuedBall } from '../../shared/types/events'
import type {
  AlertPayload,
  BallSpawnPayload,
  BoardConfigPayload,
  BoardSettingsPayload,
  ControlStatePayload,
  DropResultPayload,
  IntegrationStatusPayload,
  OverlayConfigPayload,
  PrizeWinnersPayload,
  QueueUpdatePayload,
  TimerState
} from '../../shared/types/socket'
import { computeAward } from '../../shared/ballAward/awardRules'
import { effectiveDonationAmount } from '../../shared/schema/rules.schema'
import { resolveStages, type ReportedStage, type StagesResult } from '../../shared/game/resolveStages'
import { RANDOM_PRIZE_ID, type Prize } from '../../shared/schema/prize.schema'
import { applyTimeDelta } from '../../shared/timer/timerEngine'
import { mulberry32, nextSeed } from '../../shared/util/seededRng'
import { makeId } from '../../shared/util/id'
import type { ProfileStore } from '../persistence/ProfileStore'
import type { RuntimeStore } from '../persistence/RuntimeStore'
import type { Journal } from '../persistence/Journal'
import { log } from '../log'

/** How the engine pushes state to overlays + the panel. Implemented over Socket.IO. */
export interface Broadcaster {
  timerUpdate(timer: TimerState): void
  ballSpawn(p: BallSpawnPayload): void
  dropResult(p: DropResultPayload): void
  alert(p: AlertPayload): void
  goalUpdate(totals: Totals): void
  queueUpdate(p: QueueUpdatePayload): void
  controlState(p: ControlStatePayload): void
  boardConfig(p: BoardConfigPayload): void
  boardSettings(p: BoardSettingsPayload): void
  overlayConfig(p: OverlayConfigPayload): void
  overlayReload(): void
  integrationStatus(p: IntegrationStatusPayload): void
  prizeWinners(p: PrizeWinnersPayload): void
}

export interface GameEngineDeps {
  profile: Profile
  runtime: RuntimeState
  profileStore: ProfileStore
  runtimeStore: RuntimeStore
  journal: Journal
  broadcaster: Broadcaster
  now?: () => number
  /** Called when the timer reaches zero and the subathon ends (drives the OBS danger zone). */
  onSubathonEnd?: () => void
}

const SEEN_IDS_MAX = 500
/** If no board overlay reports a landing, credit the drop anyway after this long. */
const PENDING_FALLBACK_MS = 15000

interface PendingDrop {
  ball: QueuedBall
  stages: ReportedStage[]
  timeout: NodeJS.Timeout
}

/**
 * The single source of truth for a subathon: ingests normalized events, awards balls,
 * manages the drop queue, resolves drops via real physics, applies timer/prize effects,
 * persists, and broadcasts to all clients.
 */
export class GameEngine {
  private profile: Profile
  private runtime: RuntimeState
  private readonly profileStore: ProfileStore
  private readonly runtimeStore: RuntimeStore
  private readonly journal: Journal
  private readonly broadcaster: Broadcaster
  private readonly now: () => number
  private readonly onSubathonEnd?: () => void

  private superSlotIndex = 4

  private tickInterval: NodeJS.Timeout | null = null
  private autoDropInterval: NodeJS.Timeout | null = null
  private readonly pending = new Map<string, PendingDrop>()

  constructor(deps: GameEngineDeps) {
    this.profile = deps.profile
    this.runtime = deps.runtime
    this.profileStore = deps.profileStore
    this.runtimeStore = deps.runtimeStore
    this.journal = deps.journal
    this.onSubathonEnd = deps.onSubathonEnd
    this.broadcaster = deps.broadcaster
    this.now = deps.now ?? (() => Date.now())
    this.rebuildBoard()
  }

  /**
   * Recompute the super-slot highlight index. The overlay now runs the authoritative
   * physics (visual == payout), so the engine no longer simulates or pre-picks slots.
   */
  rebuildBoard(): void {
    this.superSlotIndex = this.profile.slots.findIndex((s) => s.isSuper)
  }

  // ---- lifecycle ---------------------------------------------------------

  async init(): Promise<void> {
    this.runtime.timer.mode = this.profile.timer.mode

    if (
      this.runtime.subathonActive &&
      this.runtime.timer.running &&
      this.profile.timer.realtimeTick
    ) {
      const elapsedSec = Math.max(
        0,
        Math.floor((this.now() - this.runtime.timer.lastTickEpochMs) / 1000)
      )
      if (elapsedSec > 0) {
        this.runtime.timer.seconds = applyTimeDelta(
          this.runtime.timer.seconds,
          -elapsedSec,
          this.profile.timer
        )
      }
      this.runtime.timer.lastTickEpochMs = this.now()
      await this.runtimeStore.saveNow(this.runtime)
    }

    this.startClocks()
    this.broadcastSnapshot()
  }

  private startClocks(): void {
    this.stopClocks()
    this.tickInterval = setInterval(() => this.tick(), 1000)
    this.autoDropInterval = setInterval(() => {
      if (this.runtime.timer.running && this.profile.dropMode === 'auto') this.drainQueue()
    }, this.profile.autoDropGapMs)
  }

  private stopClocks(): void {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.autoDropInterval) clearInterval(this.autoDropInterval)
    this.tickInterval = null
    this.autoDropInterval = null
  }

  async stopEngine(): Promise<void> {
    this.stopClocks()
    this.clearPending()
    await this.runtimeStore.flush()
  }

  private clearPending(): void {
    for (const p of this.pending.values()) clearTimeout(p.timeout)
    this.pending.clear()
  }

  // ---- state accessors (for snapshot on connect) -------------------------

  timerState(): TimerState {
    return {
      seconds: this.runtime.timer.seconds,
      mode: this.runtime.timer.mode,
      running: this.runtime.timer.running
    }
  }

  totals(): Totals {
    return this.runtime.totals
  }

  queuePayload(): QueueUpdatePayload {
    return {
      count: this.runtime.queue.length,
      items: this.runtime.queue.slice(0, 20).map((b) => ({
        id: b.id,
        reason: b.reason,
        displayName: b.displayName
      }))
    }
  }

  controlStatePayload(): ControlStatePayload {
    return {
      subathonActive: this.runtime.subathonActive,
      running: this.runtime.timer.running,
      dropMode: this.profile.dropMode,
      queueCount: this.runtime.queue.length,
      idleFade: this.profile.theme.idleFade
    }
  }

  boardConfigPayload(): BoardConfigPayload {
    return {
      board: this.profile.board,
      superSlotIndex: this.superSlotIndex,
      theme: this.profile.theme,
      slots: this.profile.slots.map((s) => ({
        index: s.index,
        label: s.label,
        color: s.color,
        isSuper: s.isSuper,
        widthPct: s.widthPct
      }))
    }
  }

  overlayConfigPayload(): OverlayConfigPayload {
    return { overlay: this.profile.overlayTheme }
  }

  getProfile(): Profile {
    return this.profile
  }

  /** Apply an edited profile: update in place (keeps shared refs), rebuild board, persist. */
  async applyProfile(next: Profile): Promise<void> {
    Object.assign(this.profile, next)
    // A profile with zero slots would desync the physics slot count from the outcome list
    // (a ball lands in a bin that credits nothing) — fall back to the default set.
    if (this.profile.slots.length === 0) this.profile.slots = defaultSlots()
    // Cancel in-flight drops: the overlay rebuilds its physics on the new board, so a pending
    // ball would otherwise be force-credited to a random slot after its fallback timeout.
    this.clearPending()
    this.runtime.timer.mode = this.profile.timer.mode
    this.rebuildBoard()
    await this.profileStore.save(this.profile)
    this.startClocks() // pick up autoDropGapMs / dropMode changes
    this.broadcastSnapshot()
  }

  prizeWinnersPayload(): PrizeWinnersPayload {
    return {
      winners: this.runtime.prizeWinners.slice(-20).map((w) => ({
        prizeId: w.prizeId,
        prizeName: this.profile.prizes.find((p) => p.id === w.prizeId)?.name ?? w.prizeId,
        displayName: w.displayName,
        tsEpochMs: w.tsEpochMs
      }))
    }
  }

  private broadcastSnapshot(): void {
    this.broadcaster.boardConfig(this.boardConfigPayload())
    this.broadcaster.boardSettings(this.boardSettingsPayload())
    this.broadcaster.overlayConfig(this.overlayConfigPayload())
    this.broadcaster.timerUpdate(this.timerState())
    this.broadcaster.goalUpdate(this.totals())
    this.broadcaster.queueUpdate(this.queuePayload())
    this.broadcaster.controlState(this.controlStatePayload())
    this.broadcaster.prizeWinners(this.prizeWinnersPayload())
  }

  // ---- controls ----------------------------------------------------------

  async start(): Promise<void> {
    this.runtime.subathonActive = true
    this.runtime.timer.running = true
    this.runtime.timer.mode = this.profile.timer.mode
    this.runtime.timer.lastTickEpochMs = this.now()
    await this.runtimeStore.saveNow(this.runtime)
    this.broadcaster.timerUpdate(this.timerState())
    this.broadcaster.controlState(this.controlStatePayload())
    log.info('engine', 'start', { seconds: Math.round(this.runtime.timer.seconds), mode: this.runtime.timer.mode })
    if (this.profile.dropMode === 'auto') this.drainQueue()
  }

  async stop(): Promise<void> {
    this.runtime.timer.running = false
    await this.runtimeStore.saveNow(this.runtime)
    this.broadcaster.timerUpdate(this.timerState())
    this.broadcaster.controlState(this.controlStatePayload())
    log.info('engine', 'stop', { seconds: Math.round(this.runtime.timer.seconds) })
  }

  async reset(): Promise<void> {
    this.clearPending()
    this.runtime.subathonActive = false
    this.runtime.timer.running = false
    this.runtime.timer.seconds = this.profile.timer.startSeconds
    this.runtime.timer.mode = this.profile.timer.mode
    this.runtime.accumulators = {}
    this.runtime.queue = []
    this.runtime.prizeWinners = []
    this.runtime.totals = {
      subs: 0,
      bits: 0,
      dollars: 0,
      ccCoins: 0,
      timeAddedSeconds: 0,
      timeRemovedSeconds: 0,
      ballsDropped: 0
    }
    await this.runtimeStore.saveNow(this.runtime)
    this.broadcastSnapshot()
    log.info('engine', 'reset', { startSeconds: this.profile.timer.startSeconds })
  }

  async setDropMode(mode: DropMode): Promise<void> {
    this.profile.dropMode = mode
    await this.profileStore.save(this.profile)
    this.startClocks()
    this.broadcaster.controlState(this.controlStatePayload())
  }

  boardSettingsPayload(): BoardSettingsPayload {
    return {
      idleFade: this.profile.theme.idleFade,
      idleFadeOpacity: this.profile.theme.idleFadeOpacity,
      idleFadeLingerSec: this.profile.theme.idleFadeLingerSec
    }
  }

  /** Live idle-fade toggle from the Live tab — patches the overlay without a board rebuild. */
  async setIdleFade(enabled: boolean): Promise<void> {
    this.profile.theme.idleFade = enabled
    await this.profileStore.save(this.profile)
    this.broadcaster.boardSettings(this.boardSettingsPayload())
    this.broadcaster.controlState(this.controlStatePayload())
  }

  async setObsConfig(cfg: {
    enabled: boolean
    host: string
    port: number
    fadeScenes: string[]
    autoEndStream: boolean
    autoEndDelaySec: number
  }): Promise<void> {
    Object.assign(this.profile.integrations.obs, cfg)
    await this.profileStore.save(this.profile)
  }

  // ---- ingest ------------------------------------------------------------

  async ingest(evt: NormalizedEvent): Promise<void> {
    if (this.runtime.seenEventIds.includes(evt.id)) return
    this.runtime.seenEventIds.push(evt.id)
    if (this.runtime.seenEventIds.length > SEEN_IDS_MAX) {
      this.runtime.seenEventIds.splice(0, this.runtime.seenEventIds.length - SEEN_IDS_MAX)
    }

    await this.journal.append({ tsEpochMs: this.now(), type: 'event', evt })

    const acc = this.runtime.accumulators[evt.userId]
    const award = computeAward(evt, acc, this.profile.rules)
    this.runtime.accumulators[evt.userId] = award.accumulator

    this.applyTotalsForEvent(evt)

    for (let i = 0; i < award.balls; i++) {
      this.runtime.queue.push({
        id: makeId('ball'),
        source: evt.source,
        reason: award.reason,
        userId: evt.userId,
        displayName: evt.displayName,
        avatarUrl: evt.avatarUrl,
        awardedAtEpochMs: this.now()
      })
    }

    this.broadcaster.alert({
      id: makeId('alert'),
      kind: alertKindForEvent(evt.kind),
      title: evt.displayName,
      detail: `${award.reason}${award.balls ? ` → ${award.balls} ball${award.balls > 1 ? 's' : ''}` : ''}`,
      tsEpochMs: this.now()
    })
    this.broadcaster.goalUpdate(this.totals())
    this.broadcaster.queueUpdate(this.queuePayload())
    this.broadcaster.controlState(this.controlStatePayload())
    this.runtimeStore.scheduleSave(this.runtime)

    log.info('ingest', `${evt.kind} from ${evt.displayName}`, {
      balls: award.balls,
      reason: award.reason,
      queue: this.runtime.queue.length
    })

    // In auto mode, drop all newly-earned balls immediately (they animate concurrently).
    if (this.profile.dropMode === 'auto' && this.runtime.timer.running) this.drainQueue()
  }

  /** Drop every queued ball right now (concurrent animation on the overlay). */
  private drainQueue(): void {
    let ball = this.runtime.queue.shift()
    while (ball) {
      this.drop(ball)
      ball = this.runtime.queue.shift()
    }
  }

  private applyTotalsForEvent(evt: NormalizedEvent): void {
    const t = this.runtime.totals
    switch (evt.kind) {
      case 'sub':
      case 'resub':
        t.subs += 1
        break
      case 'giftsub':
        t.subs += Math.max(1, evt.giftCount ?? 1)
        break
      case 'bits':
        t.bits += Math.max(0, evt.bits ?? 0)
        break
      case 'donation': {
        const eff = effectiveDonationAmount(this.profile.rules, Math.max(0, evt.amount ?? 0), evt.currency)
        if (eff !== null) t.dollars += eff
        break
      }
      case 'cc_coins':
        t.ccCoins += Math.max(0, evt.coins ?? 0)
        break
    }
  }

  // ---- drops -------------------------------------------------------------

  dropNext(): void {
    const ball = this.runtime.queue.shift()
    if (!ball) return
    this.drop(ball)
  }

  /**
   * Start a drop's FIRST stage: tell the overlay to drop a real physics ball. The overlay
   * reports where it actually lands (onStageLanded); we credit exactly that slot. Nothing
   * is pre-decided here — visual == payout.
   */
  private drop(ball: QueuedBall): void {
    try {
      const timeout = setTimeout(() => this.forceFinalize(ball.id), PENDING_FALLBACK_MS)
      this.pending.set(ball.id, { ball, stages: [], timeout })
      this.spawnStage(ball, 0)
      this.broadcaster.queueUpdate(this.queuePayload())
      this.broadcaster.controlState(this.controlStatePayload())
      this.runtimeStore.scheduleSave(this.runtime)
      log.info('drop', `${ball.displayName} dropping`, { inFlight: this.pending.size })
    } catch (e) {
      log.error('drop', 'spawn failed', String(e))
    }
  }

  private spawnStage(ball: QueuedBall, stageIndex: number): void {
    this.broadcaster.ballSpawn({
      ballId: ball.id,
      stageIndex,
      displayName: ball.displayName,
      avatarUrl: ball.avatarUrl,
      reason: ball.reason,
      source: ball.source
    })
  }

  /** The overlay reports where a ball's stage actually landed. Drives super re-drops + credit. */
  onStageLanded(ballId: string, stageIndex: number, slotIndex: number, passedGate: boolean): void {
    const p = this.pending.get(ballId)
    if (!p) return
    if (stageIndex !== p.stages.length) return // out-of-order / duplicate (e.g. 2nd board source)
    p.stages.push({ slotIndex, passedGate })

    const r = this.resolve(p.stages)
    if (r.needsMore) {
      // Super gate re-drop: ask the overlay to drop the next real ball.
      clearTimeout(p.timeout)
      p.timeout = setTimeout(() => this.forceFinalize(ballId), PENDING_FALLBACK_MS)
      this.spawnStage(p.ball, p.stages.length)
      log.info('drop', `${p.ball.displayName} super re-drop → stage ${p.stages.length}`)
      return
    }
    this.finalize(ballId, r)
  }

  private resolve(stages: ReportedStage[]): StagesResult {
    return resolveStages({
      stages,
      slots: this.profile.slots,
      superSlot: this.profile.superSlot,
      timer: this.profile.timer,
      rng: mulberry32(this.runtime.rngSeed)
    })
  }

  /** No overlay reported (no board source?) — credit best-effort so time isn't lost. */
  private forceFinalize(ballId: string): void {
    const p = this.pending.get(ballId)
    if (!p) return
    if (p.stages.length === 0) {
      p.stages.push({ slotIndex: Math.floor(Math.random() * this.profile.slots.length), passedGate: false })
    }
    log.warn('drop', `${p.ball.displayName} finalized via fallback (no landing report)`)
    this.finalize(ballId, this.resolve(p.stages))
  }

  /** Resolve a slot's prizeId to an actual in-stock prize (handles the Random sentinel). */
  private resolvePrize(prizeId: string): Prize | null {
    const inStock = (pz: Prize): boolean => pz.stock === undefined || pz.stock > 0
    if (prizeId === RANDOM_PRIZE_ID) {
      const pool = this.profile.prizes.filter(inStock)
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
    }
    return this.profile.prizes.find((pz) => pz.id === prizeId) ?? null
  }

  /** Credit a resolved drop (timer/totals/prize) — exactly the slot(s) the ball landed in. */
  private finalize(ballId: string, r: StagesResult): void {
    const p = this.pending.get(ballId)
    if (!p) return
    clearTimeout(p.timeout)
    this.pending.delete(ballId)
    this.runtime.rngSeed = nextSeed(this.runtime.rngSeed)
    const ball = p.ball

    try {
      const before = this.runtime.timer.seconds
      this.runtime.timer.seconds = applyTimeDelta(before, r.timeDeltaSeconds, this.profile.timer)
      const appliedDelta = this.runtime.timer.seconds - before

      const t = this.runtime.totals
      t.ballsDropped += 1
      if (appliedDelta >= 0) t.timeAddedSeconds += appliedDelta
      else t.timeRemovedSeconds += -appliedDelta

      let prizeWon = false
      if (r.prize?.won) {
        // Resolve Random → an actual prize, then gate on remaining stock + the prize's win chance.
        const chosen = this.resolvePrize(r.prize.prizeId)
        if (chosen && (chosen.stock === undefined || chosen.stock > 0) && Math.random() < chosen.winChance) {
          prizeWon = true
          this.runtime.prizeWinners.push({
            prizeId: chosen.id,
            userId: ball.userId,
            displayName: ball.displayName,
            ballId: ball.id,
            tsEpochMs: this.now()
          })
          if (typeof chosen.stock === 'number') {
            chosen.stock = Math.max(0, chosen.stock - 1)
            this.profileStore.save(this.profile).catch((e) => log.error('drop', 'prize save failed', String(e)))
          }
        }
      }

      void this.journal.append({ tsEpochMs: this.now(), type: 'drop', ballId, stages: p.stages, r })

      this.broadcaster.dropResult({
        ballId,
        finalSlotIndex: r.finalSlotIndex,
        timeDeltaSeconds: r.timeDeltaSeconds,
        superHits: r.superHits,
        jackpot: r.jackpot,
        prizeWon,
        displayName: ball.displayName,
        reason: ball.reason
      })
      this.broadcaster.timerUpdate(this.timerState())
      this.broadcaster.goalUpdate(this.totals())
      this.broadcaster.controlState(this.controlStatePayload())
      this.broadcaster.alert(this.dropAlert(ball, appliedDelta, r.jackpot, prizeWon))
      if (prizeWon) this.broadcaster.prizeWinners(this.prizeWinnersPayload())

      log.info('drop', `${ball.displayName} credited → slot ${r.finalSlotIndex}`, {
        applied: appliedDelta,
        timer: Math.round(this.runtime.timer.seconds),
        superHits: r.superHits,
        balls: this.runtime.totals.ballsDropped
      })
      this.runtimeStore.scheduleSave(this.runtime)
    } catch (e) {
      log.error('drop', 'finalize failed', String(e))
    }
  }

  private dropAlert(
    ball: QueuedBall,
    delta: number,
    jackpot: boolean,
    prizeWon: boolean
  ): AlertPayload {
    const sign = delta >= 0 ? '+' : '−'
    const mag = Math.abs(Math.round(delta))
    return {
      id: makeId('alert'),
      kind: prizeWon ? 'prize' : jackpot ? 'jackpot' : 'drop',
      title: ball.displayName,
      detail: prizeWon ? 'won a prize!' : jackpot ? `SUPER SLOT! ${sign}${mag}s` : `${sign}${mag}s`,
      tsEpochMs: this.now()
    }
  }

  // ---- tick --------------------------------------------------------------

  private tick(): void {
    const t = this.runtime.timer
    if (!t.running) return
    const elapsedSec = Math.floor((this.now() - t.lastTickEpochMs) / 1000)
    if (elapsedSec <= 0) return
    t.lastTickEpochMs += elapsedSec * 1000
    if (!this.profile.timer.realtimeTick) return

    const before = t.seconds
    t.seconds = applyTimeDelta(before, -elapsedSec, this.profile.timer)
    if (t.seconds === before) return

    this.runtimeStore.scheduleSave(this.runtime)
    this.broadcaster.timerUpdate(this.timerState())

    if (t.seconds <= this.profile.timer.minFloorSeconds && !this.profile.timer.allowNegative) {
      this.endSubathon()
    }
  }

  private endSubathon(): void {
    this.runtime.timer.running = false
    this.runtime.subathonActive = false
    log.warn('engine', 'subathon ended (timer reached floor)', {
      seconds: Math.round(this.runtime.timer.seconds)
    })
    void this.runtimeStore.saveNow(this.runtime)
    this.broadcaster.alert({
      id: makeId('alert'),
      kind: 'system',
      title: 'Subathon ended',
      detail: 'The timer reached zero.',
      tsEpochMs: this.now()
    })
    this.onSubathonEnd?.()
    this.broadcaster.controlState(this.controlStatePayload())
  }
}

function alertKindForEvent(kind: NormalizedEvent['kind']): AlertPayload['kind'] {
  switch (kind) {
    case 'sub':
    case 'resub':
    case 'giftsub':
      return 'sub'
    case 'bits':
      return 'bits'
    case 'donation':
      return 'donation'
    case 'cc_coins':
      return 'cc'
    default:
      return 'system'
  }
}
