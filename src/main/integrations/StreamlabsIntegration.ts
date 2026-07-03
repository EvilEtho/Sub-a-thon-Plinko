import { io, type Socket } from 'socket.io-client'
import { Integration } from './Integration'
import { mapStreamlabsDonation } from '../../shared/integrations/normalize'
import { makeId } from '../../shared/util/id'

interface StreamlabsEvent {
  type?: string
  message?: Array<{ id?: string; name?: string; amount?: string | number; currency?: string; message?: string }>
}

/** Streamlabs Socket API adapter — real-time donation events. */
export class StreamlabsIntegration extends Integration {
  readonly id = 'streamlabs' as const
  private socket: Socket | null = null

  constructor(private readonly token: string) {
    super()
  }

  async connect(): Promise<void> {
    this.setStatus('connecting')
    this.socket = io(`https://sockets.streamlabs.com?token=${encodeURIComponent(this.token)}`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelayMax: 30000
    })
    this.socket.on('connect', () => this.setStatus('connected'))
    this.socket.on('disconnect', () => this.setStatus('disconnected'))
    this.socket.on('connect_error', (e: Error) => this.setStatus('error', e.message))
    this.socket.on('event', (payload: StreamlabsEvent) => {
      if (payload?.type === 'donation' && Array.isArray(payload.message)) {
        for (const m of payload.message) {
          const partial = mapStreamlabsDonation(m)
          this.emitEvent({ ...partial, id: `sl:${m.id ?? makeId('sl')}`, tsEpochMs: Date.now() })
        }
      }
    })
  }

  async disconnect(): Promise<void> {
    this.socket?.close()
    this.socket = null
    this.setStatus('disconnected')
  }
}
