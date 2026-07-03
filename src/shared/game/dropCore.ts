import type { SlotConfig } from '../schema/slots.schema'
import type { SuperSlotConfig } from '../schema/superslot.schema'
import type { TimerConfig } from '../schema/timer.schema'
import { modeSign, outcomeSeconds } from '../timer/timerEngine'

export interface CoreStage<M> {
  slotIndex: number
  /** Whether this drop passed through the super gate (triggers the super effect). */
  superTrigger: boolean
  meta: M
}

export interface CoreResult<M> {
  stages: CoreStage<M>[]
  finalSlotIndex: number
  timeDeltaSeconds: number
  superHits: number
  multiplier: number
  jackpot: boolean
  prize?: { prizeId: string; won: boolean }
}

/**
 * Shared drop resolution. `next` yields the next drop: the slot it lands in, whether it
 * passed the super gate, and any renderer metadata (spawnX/seed). The landed slot's
 * outcome is ALWAYS applied (× the accumulated super multiplier); passing the gate
 * triggers the configured super behavior (jackpot / re-drop-doubled / escalating).
 */
export function runDropCore<M>(params: {
  slots: SlotConfig[]
  superSlot: SuperSlotConfig
  timer: TimerConfig
  rng: () => number
  next: () => CoreStage<M>
}): CoreResult<M> {
  const { slots, superSlot, timer, rng, next } = params
  const sign = modeSign(timer)
  const stages: CoreStage<M>[] = []
  let timeDelta = 0
  let multiplier = 1
  let superHits = 0
  let jackpot = false
  let prize: { prizeId: string; won: boolean } | undefined

  const apply = (slot: SlotConfig): void => {
    if (!slot) return
    if (slot.outcome.kind === 'prize') {
      prize = { prizeId: slot.outcome.prizeId, won: rng() < slot.outcome.winChance }
    } else {
      timeDelta += outcomeSeconds(slot.outcome, timer) * multiplier * sign
    }
  }

  let stage = next()
  stages.push(stage)

  const guard = superSlot.maxRedrops + 2
  for (let g = 0; g < guard; g++) {
    // The landed slot's outcome always applies (at the current multiplier).
    apply(slots[stage.slotIndex])

    if (!stage.superTrigger) break

    superHits++

    if (superSlot.behavior === 'instantJackpot') {
      timeDelta += superSlot.jackpotSeconds * sign
      jackpot = true
      if (superSlot.jackpotPrizeId) prize = { prizeId: superSlot.jackpotPrizeId, won: true }
      break
    }

    if (superSlot.behavior === 'redropDoubledOnce') {
      if (superHits >= 2) break // only one re-drop
      multiplier *= superSlot.escalationFactor
      stage = next()
      stages.push(stage)
      continue
    }

    // redropDoubledEscalating
    if (superHits >= superSlot.maxRedrops) {
      jackpot = true
      break
    }
    multiplier *= superSlot.escalationFactor
    stage = next()
    stages.push(stage)
  }

  return {
    stages,
    finalSlotIndex: stages[stages.length - 1].slotIndex,
    timeDeltaSeconds: timeDelta,
    superHits,
    multiplier,
    jackpot,
    prize
  }
}
