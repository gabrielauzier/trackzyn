import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transferStrings } from './menu'
import { createTransfer } from './transfer'

// What importData does is decided by each test; the messages and the restart are what is under test.
const outcome = vi.hoisted(() => ({ run: async (): Promise<unknown> => ({ ok: true }) }))
vi.mock('./export-import', async () => {
  class ImportUnsettledError extends Error {}
  return { ImportUnsettledError, exportData: vi.fn(), importData: () => outcome.run() }
})

const strings = transferStrings('en')
const messages: string[] = []
const restartApp = vi.fn()
const reload = vi.fn()

function transfer() {
  return createTransfer({
    strings,
    userData: '/unused',
    appVersion: '1',
    backend: {} as never,
    chooseSavePath: vi.fn(),
    chooseOpenPath: async () => '/some/export.zip',
    message: async ({ text }) => (messages.push(text), true),
    setExporting: vi.fn(),
    reload,
    restartApp,
  })
}

beforeEach(() => {
  messages.length = 0
  restartApp.mockClear()
  reload.mockClear()
})

describe('import messages', () => {
  it('reports a plain failure as failed and does not restart', async () => {
    outcome.run = async () => {
      throw new Error('backend died')
    }
    await transfer().importData()
    expect(messages.at(-1)).toBe(strings.importFailed)
    expect(restartApp).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('restarts the app when the folders of a failed import could not be put back', async () => {
    const { ImportUnsettledError } = await import('./export-import')
    outcome.run = async () => {
      throw new ImportUnsettledError('x')
    }
    await transfer().importData()
    expect(messages.at(-1)).toBe(strings.restart)
    expect(restartApp).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('says the import is done, and warns about the cleanup, when only the cleanup failed', async () => {
    outcome.run = async () => ({ ok: true, warning: 'cleanup' })
    await transfer().importData()
    expect(messages).toEqual([strings.importConfirm, strings.importDone, strings.cleanupWarning])
    expect(messages).not.toContain(strings.importFailed)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
