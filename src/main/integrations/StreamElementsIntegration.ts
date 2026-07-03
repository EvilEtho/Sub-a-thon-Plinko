import { io, type Socket } from 'socket.io-client'
import { Integration } from './Integration'
import { mapStreamElementsTip } from '../../shared/integrations/normalize'
import { makeId } from '../../shared/util/id'

interface SEEvent {
  _id?: string
  type?: string
  data?: {
    tipId?: string
    username?: string
    displayName?: string
    amount?: number
    currency?: string
    message?: string
  }
}

/** StreamElements real-time adapter — tip (donation) events via JWT auth. */
export class StreamElementsIntegration extends Integration {
  readonly id = 'streamelements' as const
  private socket: Socket | null = null

  constructor(private readonly jwt: string) {
    super()
  }

  async connect(): Promise<void> {
    this.setStatus('connecting')
    this.socket = io('https://realtime.streamelements.com', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelayMax: 30000
    })
    this.socket.on('connect', () => {
      this.socket?.emit('authenticate', { method: 'jwt', token: this.jwt })
    })
    this.socket.on('authenticated', () => this.setStatus('connected'))
    this.socket.on('unauthorized', () => this.setStatus('error', 'unauthorized (bad JWT?)'))
    this.socket.on('disconnect', () => this.setStatus('disconnected'))
    this.socket.on('connect_error', (e: Error) => this.setStatus('error', e.message))
    this.socket.on('event', (ev: SEEvent) => {
      if (ev?.type === 'tip') {
        const partial = mapStreamElementsTip(ev.data ?? {})
        const sourceId = ev._id ?? ev.data?.tipId ?? makeId('se')
        this.emitEvent({ ...partial, id: `se:${sourceId}`, tsEpochMs: Date.now() })
      }
    })
  }

  async disconnect(): Promise<void> {
    this.socket?.close()
    this.socket = null
    this.setStatus('disconnected')
  }
}
