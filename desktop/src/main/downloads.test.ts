import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDownloadHandler } from './downloads'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'launchkit-dl-'))
  dirs.push(dir)
  return dir
}

class FakeItem extends EventEmitter {
  savePath: string | null = null
  cancel = vi.fn(() => this.emit('done', {}, 'cancelled'))
  getFilename = () => 'report.pdf'
  setSavePath(target: string) {
    this.savePath = target
  }
}

function setup(dialogResult: { canceled: boolean; filePath?: string }) {
  const dir = workspace()
  const item = new FakeItem()
  const showSaveDialog = vi.fn(async () => dialogResult)
  const handler = createDownloadHandler({ showSaveDialog, tempPath: () => path.join(dir, 'partial'), getWindow: () => null })
  return { dir, item, showSaveDialog, handler }
}

describe('downloads', () => {
  it('saves the same bytes at the chosen path', async () => {
    const chosen = path.join(workspace(), 'report.pdf')
    const { item, showSaveDialog, handler } = setup({ canceled: false, filePath: chosen })
    const bytes = Buffer.from([0, 255, 1, 2, 3, 128, 10, 13])

    const done = handler({}, item)
    expect(item.savePath).not.toBeNull()
    expect(showSaveDialog).toHaveBeenCalledWith(null, expect.objectContaining({ defaultPath: 'report.pdf' }))
    // The download streams into the temporary file while the dialog is open.
    writeFileSync(item.savePath!, bytes)
    item.emit('done', {}, 'completed')
    await done

    expect(readFileSync(chosen).equals(bytes)).toBe(true)
    expect(existsSync(item.savePath!)).toBe(false)
  })

  it('waits for a download that finishes after the dialog closes', async () => {
    const chosen = path.join(workspace(), 'late.pdf')
    const { item, handler } = setup({ canceled: false, filePath: chosen })
    const done = handler({}, item)
    writeFileSync(item.savePath!, 'late bytes')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(existsSync(chosen)).toBe(false)
    item.emit('done', {}, 'completed')
    await done
    expect(readFileSync(chosen, 'utf8')).toBe('late bytes')
  })

  it('writes nothing when the dialog is cancelled', async () => {
    const target = path.join(workspace(), 'never.pdf')
    const { item, handler } = setup({ canceled: true })
    const done = handler({}, item)
    writeFileSync(item.savePath!, 'partial')
    await done

    expect(item.cancel).toHaveBeenCalledTimes(1)
    expect(existsSync(target)).toBe(false)
    expect(existsSync(item.savePath!)).toBe(false)
  })

  it('writes nothing when the download itself fails', async () => {
    const chosen = path.join(workspace(), 'broken.pdf')
    const { item, handler } = setup({ canceled: false, filePath: chosen })
    const done = handler({}, item)
    item.emit('done', {}, 'interrupted')
    await done
    expect(existsSync(chosen)).toBe(false)
  })
})
