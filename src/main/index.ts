import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IpcChannels, type ObsConfigInput, type ObsStatusPayload } from '../shared/types/ipc'
import { ServerEvents } from '../shared/types/socket'
import { log, setLogSink } from './log'
import { profileSchema } from '../shared/schema/profile.schema'
import { applyLayoutToProfile, extractLayout, type Layout } from '../shared/schema/layout.schema'
import { defaultRuntimeState } from '../shared/schema/runtime.schema'
import { LayoutStore } from './persistence/LayoutStore'
import { createHttpServer, type ServerHandle } from './server/httpServer'
import { createSocketServer, bindEngineToSocket, type SocketServer } from './server/socketServer'
import { DEFAULT_PORT } from './server/ports'
import { GameEngine } from './game/GameEngine'
import { ProfileStore } from './persistence/ProfileStore'
import { RuntimeStore } from './persistence/RuntimeStore'
import { Journal } from './persistence/Journal'
import { SecretStore, SecretKeys } from './persistence/SecretStore'
import { IntegrationManager } from './integrations/IntegrationManager'
import { ObsController } from './integrations/ObsController'
import { setupAutoUpdate, triggerUpdateCheck, downloadAndInstall, skipUpdate, getUpdateStatus } from './updater/autoUpdate'

let mainWindow: BrowserWindow | null = null
let server: ServerHandle | null = null
let socketServer: SocketServer | null = null
let engine: GameEngine | null = null
let manager: IntegrationManager | null = null
let layoutStore: LayoutStore | null = null
let obs: ObsController | null = null
let secrets: SecretStore | null = null

const rendererDir = join(__dirname, '../renderer')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Subathon Plinko',
    backgroundColor: '#0e0b16',
    // Packaged Windows uses the exe icon (win.icon); set it explicitly for dev/preview windows.
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'resources', 'icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/panel.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(`${devUrl}/panel/index.html`)
  } else if (server) {
    void mainWindow.loadURL(server.urls.panel)
  } else {
    void mainWindow.loadFile(join(rendererDir, 'panel/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.ping, () => 'pong')
  ipcMain.handle(IpcChannels.getVersion, () => app.getVersion())
  ipcMain.handle(IpcChannels.getServerInfo, () =>
    server ? { port: server.port, urls: server.urls } : null
  )

  ipcMain.handle(IpcChannels.integrationsGetStatus, () =>
    manager ? manager.getStatusPayload() : { integrations: [] }
  )
  ipcMain.handle(IpcChannels.integrationsSetEnabled, (_e, id, enabled) =>
    manager?.setEnabled(id, enabled)
  )
  ipcMain.handle(IpcChannels.integrationsSetSecret, (_e, id, value) =>
    manager?.setSecret(id, value)
  )
  ipcMain.handle(IpcChannels.integrationsSetStreamerbot, (_e, cfg) =>
    manager?.setStreamerbotConfig(cfg.host, cfg.port, cfg.excludeSources)
  )
  ipcMain.handle(IpcChannels.twitchStartLogin, async () => {
    if (!manager) throw new Error('not ready')
    const s = await manager.twitchStartLogin()
    return { userCode: s.userCode, verificationUri: s.verificationUri, expiresIn: s.expiresIn }
  })
  ipcMain.handle(IpcChannels.twitchLogout, () => manager?.twitchLogout())
  ipcMain.handle(IpcChannels.twitchSetClientId, (_e, useCustom: boolean, clientId: string) =>
    manager?.setTwitchClientId(useCustom, clientId)
  )
  ipcMain.handle(IpcChannels.updateCheck, () => triggerUpdateCheck())
  ipcMain.handle(IpcChannels.updateDownload, () => downloadAndInstall())
  ipcMain.handle(IpcChannels.updateSkip, (_e, version: string) => skipUpdate(version))
  ipcMain.handle(IpcChannels.updateGetStatus, () => getUpdateStatus())

  ipcMain.handle(IpcChannels.profileGet, () => engine?.getProfile())
  ipcMain.handle(IpcChannels.profileUpdate, async (_e, raw) => {
    const result = profileSchema.safeParse(raw)
    if (!result.success) {
      const issue = result.error.issues[0]
      throw new Error(`Invalid ${issue?.path.join('.') || 'value'}: ${issue?.message ?? 'validation failed'}`)
    }
    await engine?.applyProfile(result.data)
    return engine?.getProfile()
  })

  ipcMain.handle(IpcChannels.layoutsList, () => layoutStore?.list() ?? [])
  ipcMain.handle(IpcChannels.layoutsGetAll, () => layoutStore?.all() ?? {})
  ipcMain.handle(IpcChannels.layoutSave, async (_e, name: string) => {
    if (engine && layoutStore) await layoutStore.save(name, extractLayout(engine.getProfile()))
  })
  ipcMain.handle(IpcChannels.layoutLoad, async (_e, name: string) => {
    if (!engine || !layoutStore) return null
    const layout = layoutStore.get(name)
    if (!layout) return null
    await engine.applyProfile(applyLayoutToProfile(engine.getProfile(), layout))
    return engine.getProfile()
  })
  ipcMain.handle(IpcChannels.layoutDelete, async (_e, name: string) => {
    await layoutStore?.delete(name)
  })
  ipcMain.handle(IpcChannels.layoutExport, async () => {
    if (!engine || !mainWindow) return
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'plinko-layout.json',
      filters: [{ name: 'Plinko layout', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return
    await fs.writeFile(res.filePath, JSON.stringify(extractLayout(engine.getProfile()), null, 2))
  })
  ipcMain.handle(IpcChannels.layoutImport, async () => {
    if (!engine || !mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Plinko layout', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const raw = JSON.parse(await fs.readFile(res.filePaths[0], 'utf8')) as Partial<Layout>
    await engine.applyProfile(applyLayoutToProfile(engine.getProfile(), raw))
    return engine.getProfile()
  })
  ipcMain.handle(IpcChannels.settingsExport, async () => {
    if (!engine || !mainWindow) return
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'plinko-settings.json',
      filters: [{ name: 'Plinko settings', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return
    // Full profile; secrets/tokens are stored separately and are NOT included.
    await fs.writeFile(res.filePath, JSON.stringify(engine.getProfile(), null, 2))
  })
  ipcMain.handle(IpcChannels.settingsImport, async () => {
    if (!engine || !mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Plinko settings', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const raw = JSON.parse(await fs.readFile(res.filePaths[0], 'utf8'))
    await engine.applyProfile(profileSchema.parse(raw))
    return engine.getProfile()
  })

  ipcMain.handle(IpcChannels.obsSetConfig, async (_e, cfg: ObsConfigInput) => {
    if (!engine || !obs) return
    await engine.setObsConfig(cfg)
    await obs.disconnect()
    if (cfg.enabled) await obs.connect(cfg.host, cfg.port, secrets?.get(SecretKeys.obsPassword) ?? '')
  })
  ipcMain.handle(IpcChannels.obsSetPassword, (_e, pw: string) => secrets?.set(SecretKeys.obsPassword, pw))
  ipcMain.handle(IpcChannels.obsConnect, async () => {
    if (!engine || !obs) return
    const o = engine.getProfile().integrations.obs
    await obs.connect(o.host, o.port, secrets?.get(SecretKeys.obsPassword) ?? '')
  })
  ipcMain.handle(IpcChannels.obsDisconnect, () => obs?.disconnect())
  ipcMain.handle(IpcChannels.obsGetScenes, () => obs?.getScenes() ?? [])
}

async function bootstrap(): Promise<void> {
  server = await createHttpServer({ rendererDir, preferredPort: DEFAULT_PORT })

  const dataDir = app.getPath('userData')
  const profileStore = new ProfileStore(dataDir)
  const runtimeStore = new RuntimeStore(dataDir)
  const journal = new Journal(dataDir)

  const profile = await profileStore.load()
  let runtime = await runtimeStore.load()
  if (!runtime) {
    runtime = defaultRuntimeState()
    runtime.profileId = profile.id
    runtime.timer.seconds = profile.timer.startSeconds
    runtime.timer.mode = profile.timer.mode
  }

  secrets = new SecretStore(dataDir)
  await secrets.load()

  layoutStore = new LayoutStore(dataDir)
  await layoutStore.load()

  socketServer = createSocketServer(server.httpServer)
  // Broadcast every log entry to connected dev consoles.
  setLogSink((entry) => socketServer?.io.emit(ServerEvents.devLog, entry))
  engine = new GameEngine({
    profile,
    runtime,
    profileStore,
    runtimeStore,
    journal,
    broadcaster: socketServer.broadcaster,
    onSubathonEnd: () => {
      const o = engine?.getProfile().integrations.obs
      if (o?.enabled && o.autoEndStream && obs?.isConnected()) {
        log.warn('obs', `timer hit zero — auto-ending stream in ${o.autoEndDelaySec}s`)
        setTimeout(() => void obs?.stopStream(), o.autoEndDelaySec * 1000)
      }
    }
  })

  manager = new IntegrationManager({
    clientId: __TWITCH_CLIENT_ID__,
    profile,
    profileStore,
    secrets,
    onEvent: (e) => {
      engine?.ingest(e).catch((err) => console.error('[engine] ingest failed:', err))
    },
    onStatus: (p) => socketServer?.broadcaster.integrationStatus(p)
  })

  try {
    obs = new ObsController({
      onScene: (scene) => {
        const o = engine?.getProfile().integrations.obs
        if (!o?.enabled) return
        // Scenes in fadeScenes fade the board when idle; every other scene keeps it always shown.
        void engine?.setIdleFade(o.fadeScenes.includes(scene))
      },
      onStatus: (status, detail, scenes) => {
        const payload: ObsStatusPayload = { status, detail, scenes }
        mainWindow?.webContents.send(IpcChannels.obsStatus, payload)
      }
    })
    if (profile.integrations.obs.enabled) {
      const o = profile.integrations.obs
      void obs.connect(o.host, o.port, secrets.get(SecretKeys.obsPassword) ?? '')
    }
  } catch (e) {
    log.error('obs', 'OBS init failed — continuing without it', String(e))
  }

  bindEngineToSocket(socketServer.io, engine, () => manager!.getStatusPayload())
  await engine.init()
  await manager.init()

  log.info('server', 'listening', { url: server.urls.base })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    registerIpcHandlers()
    // A failure in one integration must never prevent the window from opening.
    try {
      await bootstrap()
    } catch (e) {
      log.error('server', 'bootstrap failed — opening the window anyway', String(e))
    }
    createWindow()
    void setupAutoUpdate()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    void manager?.dispose()
    void engine?.stopEngine()
    socketServer?.stop()
    server?.httpServer.close()
  })
}
