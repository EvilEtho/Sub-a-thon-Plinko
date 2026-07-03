import type { Profile } from '../../shared/schema/profile.schema'
import { resolveTwitchClientId } from '../../shared/schema/integrations.schema'
import type { NormalizedEvent } from '../../shared/types/events'
import type { IntegrationStatusPayload } from '../../shared/types/socket'
import type { ProfileStore } from '../persistence/ProfileStore'
import { SecretKeys, type SecretStore } from '../persistence/SecretStore'
import { Integration, type IntegrationId, type StatusInfo } from './Integration'
import { StreamlabsIntegration } from './StreamlabsIntegration'
import { StreamElementsIntegration } from './StreamElementsIntegration'
import { StreamerBotIntegration } from './StreamerBotIntegration'
import { TwitchIntegration } from './TwitchIntegration'
import {
  TWITCH_SCOPES,
  pollDeviceToken,
  startDeviceCode,
  type DeviceCodeStart,
  type TwitchTokens
} from './twitchDeviceAuth'

export interface IntegrationManagerDeps {
  clientId: string
  profile: Profile
  profileStore: ProfileStore
  secrets: SecretStore
  onEvent: (e: NormalizedEvent) => void
  onStatus: (payload: IntegrationStatusPayload) => void
}

const ALL_IDS: IntegrationId[] = ['twitch', 'streamlabs', 'streamelements', 'streamerbot']

/** Owns integration adapters: lifecycle, enable/disable, status aggregation, Twitch login. */
export class IntegrationManager {
  private adapters: Partial<Record<IntegrationId, Integration>> = {}
  private lastStatus: Record<IntegrationId, StatusInfo> = {
    twitch: { id: 'twitch', status: 'disconnected' },
    streamlabs: { id: 'streamlabs', status: 'disconnected' },
    streamelements: { id: 'streamelements', status: 'disconnected' },
    streamerbot: { id: 'streamerbot', status: 'disconnected' }
  }
  private twitchLoginCancel = false

  constructor(private readonly deps: IntegrationManagerDeps) {}

  /** The Twitch client id in effect: the streamer's own (if opted in) else the built-in one. */
  private twitchClientId(): string {
    return resolveTwitchClientId(this.deps.clientId, this.deps.profile.integrations.twitch)
  }

  async init(): Promise<void> {
    for (const id of ALL_IDS) {
      if (this.isEnabled(id)) await this.connect(id)
    }
    this.emitStatus()
  }

  private isEnabled(id: IntegrationId): boolean {
    const cfg = this.deps.profile.integrations
    if (id === 'streamelements') return cfg.streamElements.enabled
    return cfg[id].enabled
  }

  getStatusPayload(): IntegrationStatusPayload {
    return {
      integrations: ALL_IDS.map((id) => ({
        id,
        enabled: this.isEnabled(id),
        status: this.lastStatus[id].status,
        detail: this.lastStatus[id].detail
      }))
    }
  }

  private emitStatus(): void {
    this.deps.onStatus(this.getStatusPayload())
  }

  private wire(adapter: Integration): Integration {
    adapter.on('event', (e: NormalizedEvent) => this.deps.onEvent(e))
    adapter.on('status', (s: StatusInfo) => {
      this.lastStatus[s.id] = s
      this.emitStatus()
    })
    return adapter
  }

  private buildAdapter(id: IntegrationId): Integration | null {
    const { secrets, profile } = this.deps
    switch (id) {
      case 'twitch': {
        const clientId = this.twitchClientId()
        const raw = secrets.get(SecretKeys.twitchTokens)
        if (!raw || !clientId) return null
        const tokens = JSON.parse(raw) as TwitchTokens
        return this.wire(
          new TwitchIntegration(clientId, tokens, (t) =>
            void secrets.set(SecretKeys.twitchTokens, JSON.stringify(t))
          )
        )
      }
      case 'streamlabs': {
        const token = secrets.get(SecretKeys.streamlabsToken)
        if (!token) return null
        return this.wire(new StreamlabsIntegration(token))
      }
      case 'streamelements': {
        const jwt = secrets.get(SecretKeys.streamElementsJwt)
        if (!jwt) return null
        return this.wire(new StreamElementsIntegration(jwt))
      }
      case 'streamerbot': {
        const c = profile.integrations.streamerbot
        return this.wire(
          new StreamerBotIntegration({ host: c.host, port: c.port, excludeSources: c.excludeSources })
        )
      }
      default:
        return null
    }
  }

  async connect(id: IntegrationId): Promise<void> {
    await this.disconnect(id)
    const adapter = this.buildAdapter(id)
    if (!adapter) {
      this.lastStatus[id] = { id, status: 'error', detail: 'missing credentials' }
      this.emitStatus()
      return
    }
    this.adapters[id] = adapter
    await adapter.connect()
  }

  async disconnect(id: IntegrationId): Promise<void> {
    const adapter = this.adapters[id]
    if (adapter) {
      await adapter.disconnect()
      delete this.adapters[id]
    }
  }

  async setEnabled(id: IntegrationId, enabled: boolean): Promise<void> {
    const cfg = this.deps.profile.integrations
    if (id === 'streamelements') cfg.streamElements.enabled = enabled
    else cfg[id].enabled = enabled
    await this.deps.profileStore.save(this.deps.profile)
    if (enabled) await this.connect(id)
    else {
      await this.disconnect(id)
      this.lastStatus[id] = { id, status: 'disconnected' }
    }
    this.emitStatus()
  }

  async setSecret(id: 'streamlabs' | 'streamelements', value: string): Promise<void> {
    const key = id === 'streamlabs' ? SecretKeys.streamlabsToken : SecretKeys.streamElementsJwt
    await this.deps.secrets.set(key, value)
    if (this.isEnabled(id)) await this.connect(id)
  }

  async setStreamerbotConfig(host: string, port: number, excludeSources: string[]): Promise<void> {
    const c = this.deps.profile.integrations.streamerbot
    c.host = host
    c.port = port
    c.excludeSources = excludeSources
    await this.deps.profileStore.save(this.deps.profile)
    if (c.enabled) await this.connect('streamerbot')
  }

  /** Begin Twitch device-code login. Returns the code/URL to show; polling runs in background. */
  async twitchStartLogin(): Promise<DeviceCodeStart> {
    const clientId = this.twitchClientId()
    if (!clientId) throw new Error('No Twitch client ID configured. Add your own in Advanced, or use a build with one baked in.')
    this.twitchLoginCancel = false
    const start = await startDeviceCode(clientId, TWITCH_SCOPES)
    void this.pollTwitchLogin(start)
    return start
  }

  private async pollTwitchLogin(start: DeviceCodeStart): Promise<void> {
    try {
      const tokens = await pollDeviceToken(
        this.twitchClientId(),
        TWITCH_SCOPES,
        start,
        () => this.twitchLoginCancel
      )
      await this.deps.secrets.set(SecretKeys.twitchTokens, JSON.stringify(tokens))
      await this.setEnabled('twitch', true)
    } catch (e) {
      this.lastStatus.twitch = {
        id: 'twitch',
        status: 'error',
        detail: e instanceof Error ? e.message : String(e)
      }
      this.emitStatus()
    }
  }

  async twitchLogout(): Promise<void> {
    this.twitchLoginCancel = true
    await this.disconnect('twitch')
    await this.deps.secrets.delete(SecretKeys.twitchTokens)
    await this.setEnabled('twitch', false)
  }

  /**
   * Switch between the built-in Twitch app and the streamer's own client id. Existing tokens
   * are bound to the previous app, so this logs the user out — they re-authorize under the new app.
   */
  async setTwitchClientId(useCustom: boolean, clientId: string): Promise<void> {
    const t = this.deps.profile.integrations.twitch
    t.useCustomClientId = useCustom
    t.customClientId = clientId.trim()
    await this.deps.profileStore.save(this.deps.profile)
    await this.twitchLogout()
  }

  async dispose(): Promise<void> {
    for (const id of ALL_IDS) await this.disconnect(id)
  }
}
