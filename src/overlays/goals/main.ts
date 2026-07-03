import { connectOverlay } from '../shared/connect'
import {
  ServerEvents,
  type GoalUpdatePayload,
  type OverlayConfigPayload,
  type TimerUpdatePayload
} from '@shared/types/socket'
import type { GoalStatKey } from '@shared/schema/overlay.schema'
import type { Totals } from '@shared/schema/runtime.schema'
import { applyCommon, setVars } from '../shared/overlayTheme'
import { formatDuration } from '@shared/util/time'

const barEl = document.getElementById('bar')!
const socket = connectOverlay('goals')

let timerSeconds = 0
let totals: Totals = {
  subs: 0, bits: 0, dollars: 0, ccCoins: 0,
  timeAddedSeconds: 0, timeRemovedSeconds: 0, ballsDropped: 0
}
let stats: GoalStatKey[] = ['timer', 'subs', 'bits', 'dollars', 'timeAdded']
const valueEls = new Map<GoalStatKey, HTMLElement>()

const LABELS: Record<GoalStatKey, string> = {
  timer: 'Timer', subs: 'Subs', bits: 'Bits', dollars: 'Raised', ccCoins: 'CC',
  balls: 'Balls', timeAdded: 'Time +', timeRemoved: 'Time −'
}
const valueFor = (k: GoalStatKey): string => {
  switch (k) {
    case 'timer': return formatDuration(timerSeconds)
    case 'subs': return String(totals.subs)
    case 'bits': return String(totals.bits)
    case 'dollars': return `$${Math.round(totals.dollars)}`
    case 'ccCoins': return String(totals.ccCoins)
    case 'balls': return String(totals.ballsDropped)
    case 'timeAdded': return formatDuration(totals.timeAddedSeconds)
    case 'timeRemoved': return formatDuration(totals.timeRemovedSeconds)
  }
}

function rebuild(): void {
  barEl.replaceChildren()
  valueEls.clear()
  for (const k of stats) {
    const stat = document.createElement('div')
    stat.className = `stat ${k === 'timer' ? 'timer' : ''}`
    const value = document.createElement('div')
    value.className = 'value'
    const label = document.createElement('div')
    label.className = 'label'
    label.textContent = LABELS[k]
    stat.append(value, label)
    barEl.append(stat)
    valueEls.set(k, value)
  }
  render()
}
function render(): void {
  for (const [k, el] of valueEls) el.textContent = valueFor(k)
}

rebuild()

socket.on(ServerEvents.timerUpdate, (p: TimerUpdatePayload) => {
  timerSeconds = p.timer.seconds
  render()
})
socket.on(ServerEvents.goalUpdate, (p: GoalUpdatePayload) => {
  totals = p.totals
  render()
})
socket.on(ServerEvents.overlayConfig, ({ overlay }: OverlayConfigPayload) => {
  applyCommon(overlay)
  setVars({
    '--goal-value': overlay.goalValueColor,
    '--goal-size': `${overlay.goalValueSizePx}px`,
    '--goal-timer': overlay.goalTimerColor
  })
  stats = overlay.goalStats.length ? overlay.goalStats : ['timer']
  rebuild()
})
