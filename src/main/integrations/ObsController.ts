// Named import (not default): obs-websocket-js is externalized + CJS-required, and its default
// export doesn't survive the interop — the class is a named export, which compiles correctly.
import { OBSWebSocket } from 'obs-websocket-js'
import { log } from '../log'

export type ObsStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ObsControllerDeps {
  /** The active program scene name (fired on connect + on every scene change). */
  onScene: (scene: string) => void
  onStatus: (status: ObsStatus, detail: string | undefined, scenes: string[]) => void
}

/**
 * Thin wrapper over obs-websocket-js: connects to OBS's WebSocket server, tracks the active
 * scene (to drive the board fade), lists scenes for the picker, and can stop the stream. It
 * auto-reconnects while it is supposed to be connected.
 */
export class ObsController {
  private obs = new OBSWebSocket()
  private connected = false
  private wantConnected = false
  private url = ''
  private password = ''
  private scenes: string[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly deps: ObsControllerDeps) {
    this.obs.on('CurrentProgramSceneChanged', (d) => {
      const name = (d as { sceneName?: string }).sceneName
      if (name) this.deps.onScene(name)
    })
    this.obs.on('ConnectionClosed', () => {
      if (!this.connected) return
      this.connected = false
      this.deps.onStatus('disconnected', undefined, this.scenes)
      if (this.wantConnected) this.scheduleReconnect()
    })
  }

  async connect(host: string, port: number, password: string): Promise<void> {
    this.url = `ws://${host}:${port}`
    this.password = password
    this.wantConnected = true
    await this.open()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      if (this.wantConnected && !this.connected) void this.open()
    }, 5000)
  }

  private async open(): Promise<void> {
    if (this.connected) return
    this.deps.onStatus('connecting', undefined, this.scenes)
    try {
      await this.obs.connect(this.url, this.password || undefined)
      this.connected = true
      await this.refreshScenes()
      this.deps.onStatus('connected', undefined, this.scenes)
      try {
        const cur = await this.obs.call('GetCurrentProgramScene')
        const name =
          (cur as { currentProgramSceneName?: string; sceneName?: string }).currentProgramSceneName ??
          (cur as { sceneName?: string }).sceneName
        if (name) this.deps.onScene(name)
      } catch {
        /* ignore — scene will arrive on the next change */
      }
    } catch (e) {
      this.connected = false
      const detail = e instanceof Error ? e.message : String(e)
      this.deps.onStatus('error', detail, this.scenes)
      if (this.wantConnected) this.scheduleReconnect()
    }
  }

  private async refreshScenes(): Promise<void> {
    try {
      const r = await this.obs.call('GetSceneList')
      const list = (r as { scenes?: Array<{ sceneName?: string }> }).scenes ?? []
      this.scenes = list.map((s) => s.sceneName ?? '').filter(Boolean)
    } catch {
      this.scenes = []
    }
  }

  getScenes(): string[] {
    return this.scenes
  }
  isConnected(): boolean {
    return this.connected
  }

  async stopStream(): Promise<void> {
    if (!this.connected) return
    try {
      await this.obs.call('StopStream')
    } catch (e) {
      log.error('obs', 'stop stream failed', String(e))
    }
  }

  async disconnect(): Promise<void> {
    this.wantConnected = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    try {
      await this.obs.disconnect()
    } catch {
      /* ignore */
    }
    this.connected = false
    this.deps.onStatus('disconnected', undefined, this.scenes)
  }
}
