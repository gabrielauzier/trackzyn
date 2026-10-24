import { IPC } from '../shared/ipc'

export interface AutoUpdaterLike {
  autoDownload: boolean
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

interface Options {
  autoUpdater: AutoUpdaterLike
  /** The build was code-signed (macOS auto-update refuses unsigned apps). */
  signed: boolean
  packaged: boolean
  send: (channel: string, payload: { version: string }) => void
  /** Delay between checks; 0 checks only once. */
  intervalMs?: number
}

const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Wraps electron-updater: a downloaded update is announced to the renderer
 * (which shows the banner), and every failure is swallowed so being offline
 * never produces a dialog. Unsigned or unpackaged builds never start it.
 */
export function createUpdater({ autoUpdater, signed, packaged, send, intervalMs = SIX_HOURS }: Options) {
  let downloaded: { version: string } | null = null

  function check() {
    autoUpdater.checkForUpdates().catch(() => {})
  }

  return {
    start() {
      if (!signed || !packaged) return
      autoUpdater.autoDownload = true
      autoUpdater.on('error', () => {})
      autoUpdater.on('update-downloaded', (info) => {
        downloaded = { version: info.version }
        send(IPC.updateAvailable, downloaded)
      })
      check()
      if (intervalMs > 0) setInterval(check, intervalMs).unref()
    },
    install() {
      autoUpdater.quitAndInstall()
    },
    /** The version already downloaded, for a page that loaded after the event. */
    pending() {
      return downloaded
    },
  }
}
