import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createConfigStore } from './config-store'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('config store bounds', () => {
  it('keeps bounds next to the server url', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'launchkit-cfg-'))
    dirs.push(dir)
    const file = path.join(dir, 'config.json')
    const store = createConfigStore(file)
    expect(store.getBounds()).toBeNull()

    store.setServerUrl('https://srv.example.com')
    store.setBounds({ x: 1, y: 2, width: 900, height: 700 })

    const reopened = createConfigStore(file)
    expect(reopened.getBounds()).toEqual({ x: 1, y: 2, width: 900, height: 700 })
    expect(reopened.getServerUrl()).toBe('https://srv.example.com')
  })
})
