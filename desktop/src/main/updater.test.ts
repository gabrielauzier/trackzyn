import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createUpdater, type AutoUpdaterLike } from './updater'

class FakeAutoUpdater extends EventEmitter implements AutoUpdaterLike {
  autoDownload = false
  checkForUpdates = vi.fn(async (): Promise<unknown> => null)
  quitAndInstall = vi.fn()
}

function setup(options: { signed?: boolean; packaged?: boolean } = {}) {
  const autoUpdater = new FakeAutoUpdater()
  const send = vi.fn()
  const updater = createUpdater({
    autoUpdater,
    signed: options.signed ?? true,
    packaged: options.packaged ?? true,
    send,
    intervalMs: 0,
  })
  return { autoUpdater, send, updater }
}

describe('updater', () => {
  it('forwards update-downloaded to the renderer', () => {
    const { autoUpdater, send, updater } = setup()
    updater.start()

    autoUpdater.emit('update-downloaded', { version: '0.2.0' })

    expect(send).toHaveBeenCalledWith('updater:update-available', { version: '0.2.0' })
    expect(autoUpdater.autoDownload).toBe(true)
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('swallows update check errors without dialogs', async () => {
    const { autoUpdater, send, updater } = setup()
    autoUpdater.checkForUpdates.mockRejectedValue(new Error('net::ERR_INTERNET_DISCONNECTED'))

    expect(() => updater.start()).not.toThrow()
    await Promise.resolve()
    expect(() => autoUpdater.emit('error', new Error('offline'))).not.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  // Coupled to the `.then`/`.catch` form on purpose: an `await` inside try/catch is also correct
  // but would not be seen by this spy, so refactoring `check` that way means rewriting this test.
  it('attaches a handler to the rejected check so no unhandledRejection reaches the main process', async () => {
    const { autoUpdater, updater } = setup()
    const rejection = Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED'))
    // A rejection nobody observes is what Electron turns into an error dialog.
    const observed = vi.spyOn(rejection, 'then')
    // A plain function: a vi.fn would itself call .then on the promise and hide the difference.
    autoUpdater.checkForUpdates = (() => rejection) as unknown as typeof autoUpdater.checkForUpdates

    updater.start()
    await new Promise((resolve) => setImmediate(resolve))

    expect(observed).toHaveBeenCalled()
  })

  it('does not start the autoUpdater for unsigned builds', () => {
    for (const options of [{ signed: false }, { packaged: false }]) {
      const { autoUpdater, updater } = setup(options)
      updater.start()
      autoUpdater.emit('update-downloaded', { version: '0.2.0' })
      expect(autoUpdater.checkForUpdates, JSON.stringify(options)).not.toHaveBeenCalled()
      expect(autoUpdater.listenerCount('update-downloaded'), JSON.stringify(options)).toBe(0)
      expect(autoUpdater.autoDownload).toBe(false)
    }
  })

  it('installs the downloaded update on request', () => {
    const { autoUpdater, updater } = setup()
    updater.start()
    updater.install()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('remembers the downloaded version so a reloaded page can ask again', () => {
    const { autoUpdater, updater } = setup()
    updater.start()
    expect(updater.pending()).toBeNull()
    autoUpdater.emit('update-downloaded', { version: '0.3.0' })
    expect(updater.pending()).toEqual({ version: '0.3.0' })
  })
})
