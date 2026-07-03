import { connectOverlay } from '../shared/connect'
import { ServerEvents, type OverlayConfigPayload, type TimerUpdatePayload } from '@shared/types/socket'
import { applyCommon, setVars } from '../shared/overlayTheme'
import { formatDuration } from '@shared/util/time'

const appEl = document.getElementById('app')!
const timerEl = document.getElementById('timer')!
const modeEl = document.getElementById('mode')!

const socket = connectOverlay('timer')

socket.on(ServerEvents.timerUpdate, (p: TimerUpdatePayload) => {
  timerEl.textContent = formatDuration(p.timer.seconds)
  modeEl.textContent = p.timer.running ? p.timer.mode : `${p.timer.mode} · paused`
})

socket.on(ServerEvents.overlayConfig, ({ overlay }: OverlayConfigPayload) => {
  applyCommon(overlay)
  setVars({
    '--timer-color': overlay.timerColor,
    '--timer-glow': overlay.timerGlowColor,
    '--timer-size': `${overlay.timerSizeVmin}vmin`
  })
  modeEl.style.display = overlay.timerShowMode ? '' : 'none'
  appEl.classList.toggle('panel', overlay.timerPanel)
})
