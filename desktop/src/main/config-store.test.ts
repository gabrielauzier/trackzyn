import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConfigStore } from './config-store'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'trackzyn-config-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('config store', () => {
  it('starts without a server when the file does not exist', () => {
    expect(createConfigStore(path.join(dir, 'config.json')).getServerUrl()).toBeNull()
  })

  it('persists the server url to config.json and reads it back', () => {
    const file = path.join(dir, 'config.json')
    createConfigStore(file).setServerUrl('https://srv.example.com')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ serverUrl: 'https://srv.example.com' })
    expect(createConfigStore(file).getServerUrl()).toBe('https://srv.example.com')
  })

  it('keeps unrelated keys when saving the server url', () => {
    const file = path.join(dir, 'config.json')
    writeFileSync(file, JSON.stringify({ bounds: { x: 1, y: 2, width: 3, height: 4 } }))
    createConfigStore(file).setServerUrl('https://srv.example.com')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      bounds: { x: 1, y: 2, width: 3, height: 4 },
      serverUrl: 'https://srv.example.com',
    })
  })

  it('treats a corrupt file or a non-string url as not configured', () => {
    const file = path.join(dir, 'config.json')
    writeFileSync(file, '{not json')
    expect(createConfigStore(file).getServerUrl()).toBeNull()
    writeFileSync(file, JSON.stringify({ serverUrl: 42 }))
    expect(createConfigStore(file).getServerUrl()).toBeNull()
  })

  it('writes atomically and leaves no temporary file behind', () => {
    const file = path.join(dir, 'nested', 'config.json')
    createConfigStore(file).setServerUrl('https://srv.example.com')
    expect(existsSync(file)).toBe(true)
    expect(readdirSync(path.dirname(file))).toEqual(['config.json'])
  })

  it('mode defaults to remote when a server url exists', () => {
    const file = path.join(dir, 'config.json')
    const store = createConfigStore(file)
    expect(store.getMode()).toBeNull()
    store.setServerUrl('https://srv.example.com')
    expect(store.getMode()).toBe('remote')
  })

  it('an explicit mode wins, including a reopened choice', () => {
    const file = path.join(dir, 'config.json')
    const store = createConfigStore(file)
    store.setServerUrl('https://srv.example.com')
    store.setMode('local')
    expect(createConfigStore(file).getMode()).toBe('local')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ mode: 'local', serverUrl: 'https://srv.example.com' })
    store.setMode(null)
    expect(createConfigStore(file).getMode()).toBeNull()
    expect(createConfigStore(file).getServerUrl()).toBe('https://srv.example.com')
  })

  it('ignores a mode that is neither remote nor local', () => {
    const file = path.join(dir, 'config.json')
    writeFileSync(file, JSON.stringify({ mode: 'cloud' }))
    expect(createConfigStore(file).getMode()).toBeNull()
  })
})
