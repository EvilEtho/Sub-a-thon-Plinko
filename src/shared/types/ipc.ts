/**
 * Shared IPC contract between the Electron main process and the control-panel renderer.
 * Both `src/preload/panel.preload.ts` and the panel UI import from here so the surface
 * stays in sync.
 */
import type { IntegrationId, IntegrationStatusPayload } from './socket'
import type { Profile } from '../schema/profile.schema'
import type { Layout } from '../schema/layout.schema'

export const IpcChannels = {
  ping: 'app:ping',
  getVersion: 'app:getVersion',
  getServerInfo: 'server:getInfo',
  integrationsGetStatus: 'integrations:getStatus',
  integrationsSetEnabled: 'integrations:setEnabled',
  integrationsSetSecret: 'integrations:setSecret',
  integrationsSetStreamerbot: 'integrations:setStreamerbot',
  twitchStartLogin: 'twitch:startLogin',
  twitchLogout: 'twitch:logout',
  twitchSetClientId: 'twitch:setClientId',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateSkip: 'update:skip',
  updateGetStatus: 'update:getStatus',
  updateStatus: 'update:status',
  profileGet: 'profile:get',
  profileUpdate: 'profile:update',
  layoutsList: 'layouts:list',
  layoutsGetAll: 'layouts:getAll',
  layoutSave: 'layouts:save',
  layoutLoad: 'layouts:load',
  layoutDelete: 'layouts:delete',
  layoutExport: 'layouts:export',
  layoutImport: 'layouts:import',
  settingsExport: 'settings:export',
  settingsImport: 'settings:import',
  obsSetConfig: 'obs:setConfig',
  obsSetPassword: 'obs:setPassword',
  obsConnect: 'obs:connect',
  obsDisconnect: 'obs:disconnect',
  obsGetScenes: 'obs:getScenes',
  obsStatus: 'obs:status'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export interface ServerUrls {
  base: string
  panel: string
  board: string
  timer: string
  feed: string
  goals: string
}

export interface ServerInfo {
  port: number
  urls: ServerUrls
}

/** Twitch device-code info surfaced to the panel for the user to authorize. */
export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
}

export interface StreamerbotConfigInput {
  host: string
  port: number
  excludeSources: string[]
}

export interface ObsConfigInput {
  enabled: boolean
  host: string
  port: number
  fadeScenes: string[]
  autoEndStream: boolean
  autoEndDelaySec: number
}

export interface ObsStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  detail?: string
  scenes: string[]
}

/** Auto-update state pushed from main to the panel. */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error'
  /** Version of the available/downloaded update. */
  version?: string
  /** Release notes / changelog (markdown-ish text from the GitHub release body). */
  notes?: string
  /** Human message for none/error states. */
  message?: string
  /** Download progress 0–100. */
  percent?: number
  /** True if the user chose "Skip" for this exact version (suppresses the dot + auto-popup). */
  skipped?: boolean
}

/** The API surface exposed on `window.plinko` in the control panel. */
export interface PlinkoApi {
  ping: () => Promise<string>
  getVersion: () => Promise<string>
  getServerInfo: () => Promise<ServerInfo | null>
  getIntegrationStatus: () => Promise<IntegrationStatusPayload>
  setIntegrationEnabled: (id: IntegrationId, enabled: boolean) => Promise<void>
  setIntegrationSecret: (id: 'streamlabs' | 'streamelements', value: string) => Promise<void>
  setStreamerbotConfig: (cfg: StreamerbotConfigInput) => Promise<void>
  twitchStartLogin: () => Promise<DeviceCodeInfo>
  twitchLogout: () => Promise<void>
  setTwitchClientId: (useCustom: boolean, clientId: string) => Promise<void>
  checkForUpdates: () => Promise<void>
  /** Download the available update and relaunch into it. */
  downloadUpdate: () => Promise<void>
  /** Don't notify about this version again (until a newer one appears). */
  skipUpdate: (version: string) => Promise<void>
  /** Current cached update status (for the panel to read on load). */
  getUpdateStatus: () => Promise<UpdateStatus>
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => void
  getProfile: () => Promise<Profile>
  updateProfile: (profile: Profile) => Promise<Profile>
  listLayouts: () => Promise<string[]>
  getLayouts: () => Promise<Record<string, Layout>>
  saveLayout: (name: string) => Promise<void>
  loadLayout: (name: string) => Promise<Profile | null>
  deleteLayout: (name: string) => Promise<void>
  exportLayout: () => Promise<void>
  importLayout: () => Promise<Profile | null>
  exportSettings: () => Promise<void>
  importSettings: () => Promise<Profile | null>
  setObsConfig: (cfg: ObsConfigInput) => Promise<void>
  setObsPassword: (password: string) => Promise<void>
  obsConnect: () => Promise<void>
  obsDisconnect: () => Promise<void>
  obsGetScenes: () => Promise<string[]>
  onObsStatus: (cb: (s: ObsStatusPayload) => void) => void
}
