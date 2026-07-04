import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type PlinkoApi } from '../shared/types/ipc'

const api: PlinkoApi = {
  ping: () => ipcRenderer.invoke(IpcChannels.ping),
  getVersion: () => ipcRenderer.invoke(IpcChannels.getVersion),
  getServerInfo: () => ipcRenderer.invoke(IpcChannels.getServerInfo),
  getIntegrationStatus: () => ipcRenderer.invoke(IpcChannels.integrationsGetStatus),
  setIntegrationEnabled: (id, enabled) =>
    ipcRenderer.invoke(IpcChannels.integrationsSetEnabled, id, enabled),
  setIntegrationSecret: (id, value) =>
    ipcRenderer.invoke(IpcChannels.integrationsSetSecret, id, value),
  setStreamerbotConfig: (cfg) => ipcRenderer.invoke(IpcChannels.integrationsSetStreamerbot, cfg),
  twitchStartLogin: () => ipcRenderer.invoke(IpcChannels.twitchStartLogin),
  twitchLogout: () => ipcRenderer.invoke(IpcChannels.twitchLogout),
  setTwitchClientId: (useCustom, clientId) =>
    ipcRenderer.invoke(IpcChannels.twitchSetClientId, useCustom, clientId),
  checkForUpdates: () => ipcRenderer.invoke(IpcChannels.updateCheck),
  downloadUpdate: () => ipcRenderer.invoke(IpcChannels.updateDownload),
  skipUpdate: (version) => ipcRenderer.invoke(IpcChannels.updateSkip, version),
  getUpdateStatus: () => ipcRenderer.invoke(IpcChannels.updateGetStatus),
  onUpdateStatus: (cb) => {
    ipcRenderer.on(IpcChannels.updateStatus, (_e, s) => cb(s))
  },
  getProfile: () => ipcRenderer.invoke(IpcChannels.profileGet),
  updateProfile: (profile) => ipcRenderer.invoke(IpcChannels.profileUpdate, profile),
  listLayouts: () => ipcRenderer.invoke(IpcChannels.layoutsList),
  getLayouts: () => ipcRenderer.invoke(IpcChannels.layoutsGetAll),
  saveLayout: (name) => ipcRenderer.invoke(IpcChannels.layoutSave, name),
  loadLayout: (name) => ipcRenderer.invoke(IpcChannels.layoutLoad, name),
  deleteLayout: (name) => ipcRenderer.invoke(IpcChannels.layoutDelete, name),
  exportLayout: () => ipcRenderer.invoke(IpcChannels.layoutExport),
  importLayout: () => ipcRenderer.invoke(IpcChannels.layoutImport),
  exportSettings: () => ipcRenderer.invoke(IpcChannels.settingsExport),
  importSettings: () => ipcRenderer.invoke(IpcChannels.settingsImport),
  setObsConfig: (cfg) => ipcRenderer.invoke(IpcChannels.obsSetConfig, cfg),
  setObsPassword: (password) => ipcRenderer.invoke(IpcChannels.obsSetPassword, password),
  obsConnect: () => ipcRenderer.invoke(IpcChannels.obsConnect),
  obsDisconnect: () => ipcRenderer.invoke(IpcChannels.obsDisconnect),
  obsGetScenes: () => ipcRenderer.invoke(IpcChannels.obsGetScenes),
  onObsStatus: (cb) => {
    ipcRenderer.on(IpcChannels.obsStatus, (_e, s) => cb(s))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('plinko', api)
  } catch (error) {
    console.error('Failed to expose preload API:', error)
  }
} else {
  ;(window as unknown as { plinko: PlinkoApi }).plinko = api
}
