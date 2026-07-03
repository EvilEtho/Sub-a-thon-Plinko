import type { SlotConfig } from '../schema/slots.schema'
import type { SuperSlotConfig } from '../schema/superslot.schema'
import type { TimerConfig } from '../schema/timer.schema'
import { modeSign, outcomeSeconds } from '../timer/timerEngine'

/** One real landing reported by the overlay: which slot, and whether it passed the gate. */
export interface ReportedStage {
  slotIndex: number
  passedGate: boolean
}

export interface StagesResult {
  finalSlotIndex: number
  timeDeltaSeconds: number
  superHits: number
  multiplier: number
  jackpot: boolean
  prize?: { prizeId: string; won: boolean }
  /** True when the super behavior requires another (not-yet-reported) re-drop. */
  needsMore: boolean
}

/**
 * Compute a drop's reward from the ACTUAL slots the ball landed in (reported by the
 * overlay's real physics). The engine calls this each time a stage lands: if `needsMore`
 * is true it asks the overlay to re-drop (super gate re-drop); otherwise it credits the
 * result. This guarantees the credited outcome matches exactly what the viewer saw.
 */
export function resolveStages(params: {
  stages: ReportedStage[]
  slots: SlotConfig[]
  superSlot: SuperSlotConfig
  timer: TimerConfig
  rng: () => number
}): StagesResult {
  const { stages, slots, superSlot, timer, rng } = params
  const sign = modeSign(timer)
  let timeDelta = 0
  let multiplier = 1
  let superHits = 0
  let jackpot = false
  let prize: { prizeId: string; won: boolean } | undefined
  let needsMore = false

  const apply = (slot: SlotConfig | undefined): void => {
    if (!slot) return
    if (slot.outcome.kind === 'prize') {
      prize = { prizeId: slot.outcome.prizeId, won: rng() < slot.outcome.winChance }
    } else {
      timeDelta += outcomeSeconds(slot.outcome, timer) * multiplier * sign
    }
  }

  let idx = 0
  const take = (): ReportedStage | null => (idx < stages.length ? stages[idx++] : null)

  let cur = take()
  if (!cur) {
    return { finalSlotIndex: -1, timeDeltaSeconds: 0, superHits: 0, multiplier: 1, jackpot: false, needsMore: true }
  }

  let last = cur
  const guard = superSlot.maxRedrops + 2
  for (let g = 0; g < guard; g++) {
    last = cur
    apply(slots[cur.slotIndex])

    if (!cur.passedGate) break

    superHits++

    if (superSlot.behavior === 'instantJackpot') {
      timeDelta += superSlot.jackpotSeconds * sign
      jackpot = true
      if (superSlot.jackpotPrizeId) prize = { prizeId: superSlot.jackpotPrizeId, won: true }
      break
    }

    if (superSlot.behavior === 'redropDoubledOnce') {
      if (superHits >= 2) break // already did the single re-drop
      multiplier *= superSlot.escalationFactor
      const nx = take()
      if (!nx) {
        needsMore = true
        break
      }
      cur = nx
      continue
    }

    // redropDoubledEscalating
    if (superHits >= superSlot.maxRedrops) {
      timeDelta += superSlot.jackpotSeconds * multiplier * sign
      jackpot = true
      break
    }
    multiplier *= superSlot.escalationFactor
    const nx = take()
    if (!nx) {
      needsMore = true
      break
    }
    cur = nx
  }

  return {
    finalSlotIndex: last.slotIndex,
    timeDeltaSeconds: timeDelta,
    superHits,
    multiplier,
    jackpot,
    prize,
    needsMore
  }
}
