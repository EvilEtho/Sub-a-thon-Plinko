import { io, type Socket } from 'socket.io-client'
import { ClientEvents, type OverlayRoom } from '@shared/types/socket'

/**
 * Connect an OBS overlay to the embedded server. Overlays are served by that same
 * server, so a same-origin `io()` connection is correct — no URL needed. Announces
 * the overlay's role on (re)connect so the server can target it by room.
 */
export function connectOverlay(role: OverlayRoom): Socket {
  const socket = io({ transports: ['websocket', 'polling'] })
  socket.on('connect', () => socket.emit(ClientEvents.hello, { role }))
  return socket
}
