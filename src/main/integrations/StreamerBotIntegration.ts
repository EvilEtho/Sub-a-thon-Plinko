import { StreamerbotClient } from '@streamerbot/client'
import { Integration } from './Integration'
import { makeId } from '../../shared/util/id'

/**
 * Crowd Control bridge via Streamer.bot. CC has no public coin-spend API, so the streamer
 * configures a Streamer.bot action on the CC coin-exchange trigger that does a
 * "WebSocket Broadcast (Custom)" with a payload like:
 *   { "plinko": "ccCoins", "user": "Name", "userId": "123", "coins": 500, "source": "PayPal" }
 * We filter out configured sources (e.g. "Twitch-Bits") so bit-bought coins don't count.
 */
export class StreamerBotIntegration extends Integration {
  readonly id = 'streamerbot' as const
  private client: StreamerbotClient | null = null

  constructor(
    private readonly opts: { host: string; port: number; excludeSources: string[] }
  ) {
    super()
  }

  async connect(): Promise<void> {
    this.setStatus('connecting')
    this.client = new StreamerbotClient({
      host: this.opts.host,
      port: this.opts.port,
      immediate: false,
      onConnect: () => this.setStatus('connected'),
      onDisconnect: () => this.setStatus('disconnected'),
      onError: (e: unknown) => this.setStatus('error', errorMessage(e))
    })
    // Custom WebSocket broadcasts arrive under General.Custom.
    this.client.on('General.Custom', (payload: unknown) => this.handleCustom(payload))
    await this.client.connect()
  }

  private handleCustom(payload: unknown): void {
    // payload shape: { event, data: { <custom fields> } }
    const outer = payload as { data?: Record<string, unknown> } | undefined
    const d = (outer?.data ?? payload) as Record<string, unknown>
    if (!d || d.plinko !== 'ccCoins') return

    const source = String(d.source ?? '')
    if (this.opts.excludeSources.includes(source)) return

    const coins = Number(d.coins) || 0
    if (coins <= 0) return
    const user = String(d.user ?? d.userId ?? 'viewer')
    this.emitEvent({
      id: `sb:${String(d.id ?? makeId('sb'))}`,
      source: 'streamerbot',
      kind: 'cc_coins',
      userId: String(d.userId ?? user),
      displayName: user,
      coins,
      tsEpochMs: Date.now()
    })
  }

  async disconnect(): Promise<void> {
    await this.client?.disconnect()
    this.client = null
    this.setStatus('disconnected')
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
