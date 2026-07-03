import { StaticAuthProvider } from '@twurple/auth'
import { ApiClient } from '@twurple/api'
import { EventSubWsListener } from '@twurple/eventsub-ws'
import { Integration } from './Integration'
import { tierFromTwitch } from '../../shared/integrations/normalize'
import { makeId } from '../../shared/util/id'
import { TWITCH_SCOPES, refreshTwitchToken, validateToken, type TwitchTokens } from './twitchDeviceAuth'

/**
 * Twitch adapter: EventSub over WebSocket (no public server needed). Subscribes to subs,
 * resubs, gift subs, and cheers, and normalizes them. Uses a public client (Device Code
 * Flow tokens) with secretless refresh; the listener is rebuilt when the token rotates.
 */
export class TwitchIntegration extends Integration {
  readonly id = 'twitch' as const
  private listener: EventSubWsListener | null = null
  private apiClient: ApiClient | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private tokens: TwitchTokens
  private readonly avatarCache = new Map<string, string>()

  constructor(
    private readonly clientId: string,
    tokens: TwitchTokens,
    private readonly onTokens: (t: TwitchTokens) => void
  ) {
    super()
    this.tokens = tokens
  }

  async connect(): Promise<void> {
    this.setStatus('connecting')
    try {
      await this.startListener()
    } catch (e) {
      this.setStatus('error', errorMessage(e))
    }
  }

  private async startListener(): Promise<void> {
    if (Date.now() > this.tokens.expiresAt - 60_000 && this.tokens.refreshToken) {
      this.tokens = await refreshTwitchToken(this.clientId, this.tokens.refreshToken)
      this.onTokens(this.tokens)
    }

    const identity = await validateToken(this.tokens.accessToken)
    const authProvider = new StaticAuthProvider(this.clientId, this.tokens.accessToken, TWITCH_SCOPES)
    const apiClient = new ApiClient({ authProvider })
    this.apiClient = apiClient
    const listener = new EventSubWsListener({ apiClient })
    const uid = identity.userId

    listener.onChannelSubscription(uid, async (e) => {
      if (e.isGift) return // counted via the gift event instead
      this.emitEvent({
        id: `tw:sub:${makeId('e')}`,
        source: 'twitch',
        kind: 'sub',
        userId: e.userId,
        displayName: e.userDisplayName,
        avatarUrl: await this.resolveAvatar(e.userId),
        tier: tierFromTwitch(e.tier),
        tsEpochMs: Date.now()
      })
    })

    listener.onChannelSubscriptionMessage(uid, async (e) => {
      this.emitEvent({
        id: `tw:resub:${makeId('e')}`,
        source: 'twitch',
        kind: 'resub',
        userId: e.userId,
        displayName: e.userDisplayName,
        avatarUrl: await this.resolveAvatar(e.userId),
        tier: tierFromTwitch(e.tier),
        tsEpochMs: Date.now()
      })
    })

    listener.onChannelSubscriptionGift(uid, async (e) => {
      this.emitEvent({
        id: `tw:gift:${makeId('e')}`,
        source: 'twitch',
        kind: 'giftsub',
        userId: e.gifterId ?? 'anon',
        displayName: e.gifterDisplayName ?? 'Anonymous',
        avatarUrl: await this.resolveAvatar(e.gifterId ?? undefined),
        tier: tierFromTwitch(e.tier),
        giftCount: e.amount,
        tsEpochMs: Date.now()
      })
    })

    listener.onChannelCheer(uid, async (e) => {
      this.emitEvent({
        id: `tw:cheer:${makeId('e')}`,
        source: 'twitch',
        kind: 'bits',
        userId: e.userId ?? 'anon',
        displayName: e.userDisplayName ?? 'Anonymous',
        avatarUrl: await this.resolveAvatar(e.userId ?? undefined),
        bits: e.bits,
        tsEpochMs: Date.now()
      })
    })

    listener.start()
    this.listener = listener
    this.setStatus('connected', `@${identity.login}`)
    this.scheduleRefresh()
  }

  /** Resolve + cache a user's Twitch profile image URL (for avatar balls). Best-effort. */
  private async resolveAvatar(userId?: string): Promise<string | undefined> {
    if (!userId || !this.apiClient) return undefined
    const cached = this.avatarCache.get(userId)
    if (cached) return cached
    try {
      const user = await this.apiClient.users.getUserById(userId)
      const url = user?.profilePictureUrl
      if (url) this.avatarCache.set(userId, url)
      return url ?? undefined
    } catch {
      return undefined
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    const ms = Math.max(60_000, this.tokens.expiresAt - Date.now() - 120_000)
    this.refreshTimer = setTimeout(() => void this.rebuild(), ms)
  }

  private async rebuild(): Promise<void> {
    try {
      this.listener?.stop()
      this.listener = null
      await this.startListener()
    } catch (e) {
      this.setStatus('error', errorMessage(e))
    }
  }

  async disconnect(): Promise<void> {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    this.listener?.stop()
    this.listener = null
    this.setStatus('disconnected')
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
