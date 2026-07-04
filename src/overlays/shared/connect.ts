import { io, type Socket } from 'socket.io-client'
import { ClientEvents, ServerEvents, type OverlayConfigPayload, type OverlayRoom } from '@shared/types/socket'

/**
 * Connect an OBS overlay to the embedded server. Overlays are served by that same
 * server, so a same-origin `io()` connection is correct — no URL needed. Announces
 * the overlay's role on (re)connect so the server can target it by room.
 *
 * Also handles two cross-overlay behaviors: a panel-triggered hard refresh, and an
 * optional "hide when the app is offline" so a closed app doesn't leave a frozen frame.
 */
export function connectOverlay(role: OverlayRoom): Socket {
  const socket = io({ transports: ['websocket', 'polling'] })
  let hideWhenOffline = false
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  socket.on('connect', () => {
    socket.emit(ClientEvents.hello, { role })
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = undefined
    }
    document.body.style.opacity = '1'
  })

  // #35: the control panel can force every overlay to hard-refresh (e.g. after an app update).
  socket.on(ServerEvents.overlayReload, () => location.reload())

  // #36: optionally fade the overlay out when the app/server disconnects (no frozen frame).
  socket.on(ServerEvents.overlayConfig, (p: OverlayConfigPayload) => {
    hideWhenOffline = !!p?.overlay?.hideWhenOffline
  })
  socket.on('disconnect', () => {
    if (!hideWhenOffline) return
    hideTimer = setTimeout(() => {
      document.body.style.transition = 'opacity .3s'
      document.body.style.opacity = '0'
    }, 1200)
  })
  return socket
}
