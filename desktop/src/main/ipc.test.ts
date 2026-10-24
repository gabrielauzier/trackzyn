import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { IPC } from '../shared/ipc'
import { trustedHandle, type IpcLike } from './ipc'

function fakeIpc() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipc: IpcLike = { handle: (channel, listener) => void handlers.set(channel, listener as never) }
  return { ipc, call: (channel: string, event: unknown, ...args: unknown[]) => handlers.get(channel)!(event, ...args) }
}

describe('trusted ipc handlers', () => {
  it('rejects calls from untrusted frames without running the handler', async () => {
    const { ipc, call } = fakeIpc()
    const handler = vi.fn(() => 'secret')
    trustedHandle(ipc, 'server:get-url', handler)
    const untrusted = [
      { senderFrame: { url: 'https://evil.example/' } },
      { senderFrame: { url: 'file:///etc/passwd' } },
      { senderFrame: { url: 'app://launchkit.evil.example/' } },
      { senderFrame: { url: 'app://other/' } },
      { senderFrame: null },
      {},
    ]
    for (const event of untrusted) {
      await expect(Promise.resolve().then(() => call('server:get-url', event)), JSON.stringify(event)).rejects.toThrow(/untrusted/i)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs the handler for frames served from app://launchkit/', async () => {
    const { ipc, call } = fakeIpc()
    const handler = vi.fn((_event: unknown, url: string) => `got ${url}`)
    trustedHandle(ipc, 'server:set-url', handler)
    const event = { senderFrame: { url: 'app://launchkit/connect' } }
    await expect(Promise.resolve(call('server:set-url', event, 'https://srv.example.com'))).resolves.toBe('got https://srv.example.com')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('every ipc channel the main process serves', () => {
  const source = readFileSync(path.resolve(__dirname, 'index.ts'), 'utf8')
  // Export and import are menu items of the main process, not channels; these two only carry events to the renderer.
  const SEND_ONLY = ['exportState', 'updateAvailable']
  const handled = Object.entries(IPC).filter(([key]) => !SEND_ONLY.includes(key))

  it('is registered through trustedHandle and never through ipcMain directly', () => {
    // The python alternatives (//~ lines) are comments in the full tree: judge the code only.
    expect(source).not.toMatch(/ipcMain\s*\.\s*(handle|handleOnce|on|once)\b/)
    // ipcMain may only be named in the electron import (plainly, no `as`) and as the first argument of
    // trustedHandle: no alias, no namespace import, no require, no destructuring, no electron.ipcMain.
    const code = source.replace(/^\s*\/\/.*$/gm, '')
    const imports = [...code.matchAll(/^import\s+(.+?)\s+from\s+'electron'$/gm)].map((match) => match[1])
    expect(imports).toHaveLength(1)
    expect(imports[0]).toMatch(/^\{[^}]*\}$/)
    expect(imports[0]).not.toMatch(/\bas\b/)
    expect(code).not.toMatch(/import\s+\*\s+as/)
    expect(code).not.toMatch(/require\s*\(/)
    expect(code).not.toMatch(/import\s*\(/)
    const rest = code.replace(/^import\s+\{.*\}\s+from\s+'electron'$/m, '').replaceAll('trustedHandle(ipcMain, ', 'trustedHandle(')
    expect(rest).not.toMatch(/\bipcMain\b/)
    for (const [key] of handled) {
      expect(source, `IPC.${key}`).toContain(`trustedHandle(ipcMain, IPC.${key},`)
    }
    for (const key of SEND_ONLY) expect(source, `IPC.${key}`).toContain(`.send(IPC.${key},`)
    // No channel is served that this list does not know.
    const served = [...source.matchAll(/trustedHandle\(ipcMain, IPC\.(\w+),/g)].map((match) => match[1]).sort()
    expect(served).toEqual(handled.map(([key]) => key).sort())
  })

  it('refuses a sender frame outside app://launchkit on each channel', () => {
    for (const [key, channel] of handled) {
      const listeners = new Map<string, (event: { senderFrame?: { url: string } | null }, ...args: unknown[]) => unknown>()
      const handler = vi.fn()
      trustedHandle({ handle: (name, listener) => listeners.set(name, listener) }, channel, handler)
      const listener = listeners.get(channel)!
      for (const frame of [{ url: 'https://evil.example/' }, { url: 'app://launchkit.evil.example/' }, { url: 'file:///x' }, null, undefined]) {
        expect(() => listener({ senderFrame: frame }), `${key} ${JSON.stringify(frame)}`).toThrow('Untrusted sender')
      }
      expect(handler).not.toHaveBeenCalled()
      listener({ senderFrame: { url: 'app://launchkit/login' } })
      expect(handler).toHaveBeenCalledTimes(1)
    }
  })

  it('is the only place in the main process and the preload that names ipcMain', () => {
    const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(ts|mts|cts|js|mjs|cjs)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path.join(dir, entry.name)] : [],
      )
    const files = [...walk(path.resolve(__dirname)), ...walk(path.resolve(__dirname, '../preload'))]
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'))
      const label = path.relative(path.resolve(__dirname, '..'), file)
      if (path.basename(file) !== 'index.ts' || !file.includes(`${path.sep}main${path.sep}`)) expect(code, label).not.toMatch(/\bipcMain\b/)
      expect(code, label).not.toMatch(/\.handle(Once)?\s*\(\s*IPC\./)
      expect(code, label).not.toMatch(/require\s*\(\s*['"]electron['"]/)
    }
  })
})
