import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import updater from 'electron-updater'
import { IpcChannels, type UpdateStatus } from '../../shared/types/ipc'
import { readJsonFile, writeJsonFileAtomic } from '../persistence/jsonFile'

const { autoUpdater } = updater

let last: UpdateStatus = { state: 'idle' }
/** The available-update payload, kept across transient checking/downloading states. */
let availableInfo: UpdateStatus | null = null
let skippedVersion = ''
const statePath = (): string => join(app.getPath('userData'), 'updater.json')

function send(s: UpdateStatus): void {
  last = s
  BrowserWindow.getAllWindows()[0]?.webContents.send(IpcChannels.updateStatus, s)
}

function availablePayload(version: string, releaseNotes: unknown): UpdateStatus {
  const notes =
    typeof releaseNotes === 'string'
      ? releaseNotes
      : Array.isArray(releaseNotes)
        ? releaseNotes.map((n) => (typeof n === 'string' ? n : String((n as { note?: string }).note ?? ''))).join('\n\n')
        : ''
  return { state: 'available', version, notes, skipped: version === skippedVersion }
}

/**
 * Auto-update wiring. Downloads are user-driven (autoDownload off) so nothing installs behind
 * the streamer's back — the panel drives check / download+relaunch / skip. On startup we check
 * once and, if an un-skipped update exists, the panel auto-opens its update dialog.
 */
export async function setupAutoUpdate(): Promise<void> {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  const raw = await readJsonFile(statePath()).catch(() => null)
  if (raw && typeof raw === 'object') skippedVersion = String((raw as { skippedVersion?: string }).skippedVersion ?? '')

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => {
    availableInfo = availablePayload(i.version, i.releaseNotes)
    send(availableInfo)
  })
  autoUpdater.on('update-not-available', () => {
    availableInfo = null
    send({ state: 'none' })
  })
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent), version: availableInfo?.version }))
  autoUpdater.on('update-downloaded', (i) => {
    availableInfo = null
    send({ state: 'downloaded', version: i.version })
  })
  autoUpdater.on('error', (e) => {
    const message = e instanceof Error ? e.message : String(e)
    send({ state: 'error', message })
    console.error('[updater]', message)
  })

  if (!app.isPackaged) return
  void autoUpdater.checkForUpdates().catch(() => {})
  // Re-check periodically for long-running sessions.
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}

/** Manual "check for updates". */
export async function triggerUpdateCheck(): Promise<void> {
  if (!app.isPackaged) {
    send({ state: 'none', message: 'Updates only run in the installed app.' })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    send({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** Download the pending update and relaunch into it. */
export async function downloadAndInstall(): Promise<void> {
  if (!app.isPackaged) {
    send({ state: 'error', message: 'Installing updates only works in the installed app.' })
    return
  }
  try {
    await autoUpdater.downloadUpdate()
    // Give the renderer a tick to show "downloaded", then quit → install → relaunch. The
    // deferred call needs its own try/catch — a synchronous quitAndInstall throw would
    // otherwise escape as an uncaught main-process exception and dead-end the modal.
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(true, true)
      } catch (e) {
        send({ state: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    }, 400)
  } catch (e) {
    send({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** Suppress notifications for this exact version (until a newer one appears). */
export async function skipUpdate(version: string): Promise<void> {
  skippedVersion = version
  await writeJsonFileAtomic(statePath(), { skippedVersion }).catch(() => {})
  if (availableInfo && availableInfo.version === version) availableInfo = { ...availableInfo, skipped: true }
  if (last.state === 'available' && last.version === version) send({ ...last, skipped: true })
}

/**
 * The update status for a freshly-loaded panel. During a transient re-check we surface the
 * cached available update (so a panel remount mid-check doesn't briefly lose the dot/notice).
 */
export function getUpdateStatus(): UpdateStatus {
  return last.state === 'checking' && availableInfo ? availableInfo : last
}
