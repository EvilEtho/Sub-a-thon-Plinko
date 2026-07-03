import type { TimerConfig } from '../schema/timer.schema'
import type { SlotOutcome } from '../schema/slots.schema'

/**
 * Natural (unsigned-by-mode) time value of a slot outcome, in seconds. Positive extends,
 * negative shortens. Prizes contribute no time here.
 */
export function outcomeSeconds(outcome: SlotOutcome, cfg: TimerConfig): number {
  switch (outcome.kind) {
    case 'addTime':
      return outcome.seconds
    case 'removeTime':
      return -outcome.seconds
    case 'multiplier':
      return cfg.baseSecondsPerBall * outcome.factor
    case 'prize':
      return 0
    default:
      return 0
  }
}

/** In `reverse` mode ball time effects are negated (viewers race the timer down). */
export function modeSign(cfg: TimerConfig): 1 | -1 {
  return cfg.mode === 'reverse' ? -1 : 1
}

/** Clamp a timer value to the configured floor and optional cap. Guards against NaN. */
export function clampTimer(seconds: number, cfg: TimerConfig): number {
  let s = Number.isFinite(seconds) ? seconds : cfg.minFloorSeconds
  if (typeof cfg.maxCapSeconds === 'number') s = Math.min(s, cfg.maxCapSeconds)
  if (!cfg.allowNegative) s = Math.max(s, cfg.minFloorSeconds)
  return s
}

/**
 * Apply a signed time delta (already mode-signed) to the current timer value, returning
 * the clamped result. A non-finite delta is ignored so one bad value can't freeze the
 * timer at NaN.
 */
export function applyTimeDelta(currentSeconds: number, deltaSeconds: number, cfg: TimerConfig): number {
  const delta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0
  const base = Number.isFinite(currentSeconds) ? currentSeconds : cfg.minFloorSeconds
  return clampTimer(base + delta, cfg)
}

/** Real-time tick: subtract `elapsedSeconds` while running (subathon countdown). */
export function applyRealtimeTick(
  currentSeconds: number,
  elapsedSeconds: number,
  cfg: TimerConfig
): number {
  if (!cfg.realtimeTick || elapsedSeconds <= 0) return currentSeconds
  return clampTimer(currentSeconds - elapsedSeconds, cfg)
}
