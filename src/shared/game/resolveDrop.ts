import type { SlotConfig } from '../schema/slots.schema'
import type { SuperSlotConfig } from '../schema/superslot.schema'
import type { TimerConfig } from '../schema/timer.schema'
import type { DropResult } from '../types/events'
import { randomInt } from '../util/seededRng'
import { runDropCore } from './dropCore'

export interface ResolveDropParams {
  ballId: string
  slots: SlotConfig[]
  superSlot: SuperSlotConfig
  timer: TimerConfig
  rng: () => number
}

/**
 * Logical (physics-free) drop resolution: pick a slot uniformly and apply its outcome
 * plus super-slot behavior. Used for tests and any non-visual resolution path.
 */
export function resolveDrop(params: ResolveDropParams): DropResult {
  const { ballId, slots, superSlot, timer, rng } = params
  const core = runDropCore<undefined>({
    slots,
    superSlot,
    timer,
    rng,
    next: () => {
      const idx = randomInt(rng, slots.length)
      return { slotIndex: idx, superTrigger: !!slots[idx]?.isSuper, meta: undefined }
    }
  })
  return {
    ballId,
    path: core.stages.map((s) => s.slotIndex),
    finalSlotIndex: core.finalSlotIndex,
    outcome: slots[core.finalSlotIndex].outcome,
    timeDeltaSeconds: core.timeDeltaSeconds,
    superHits: core.superHits,
    multiplier: core.multiplier,
    jackpot: core.jackpot,
    prize: core.prize
  }
}
