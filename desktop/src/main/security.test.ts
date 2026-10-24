import { describe, expect, it, vi } from 'vitest'
import { hardenWebContents, isAllowedExternalUrl, openExternalSafely } from './security'

type WindowOpenHandler = (details: { url: string }) => { action: 'deny' }
type Listener = (event: { preventDefault(): void }, url: string) => void

function fakeWebContents() {
  let windowOpen: WindowOpenHandler | undefined
  const listeners = new Map<string, Listener>()
  return {
    webContents: {
      setWindowOpenHandler: (handler: WindowOpenHandler) => {
        windowOpen = handler
      },
      on: (event: string, listener: Listener) => {
        listeners.set(event, listener)
      },
    },
    windowOpen: (url: string) => windowOpen!({ url }),
    navigate: (event: string, url: string) => {
      const preventDefault = vi.fn()
      listeners.get(event)!({ preventDefault }, url)
      return preventDefault
    },
    events: () => [...listeners.keys()],
  }
}

describe('external links', () => {
  it('opens https links externally', async () => {
    const openExternal = vi.fn(async () => {})
    const fake = fakeWebContents()
    hardenWebContents(fake.webContents, { openExternal })

    expect(fake.windowOpen('https://example.com/docs')).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/docs')

    await openExternalSafely('https://example.com', openExternal)
    expect(openExternal).toHaveBeenLastCalledWith('https://example.com')
    expect(isAllowedExternalUrl('http://example.com')).toBe(true)
    expect(isAllowedExternalUrl('mailto:someone@example.com')).toBe(true)
  })

  it('never opens javascript, file or launchkit urls', async () => {
    const openExternal = vi.fn(async () => {})
    const fake = fakeWebContents()
    hardenWebContents(fake.webContents, { openExternal })
    const blocked = ['javascript:alert(1)', 'file:///etc/passwd', 'launchkit://open', 'app://launchkit/files', 'data:text/html,hi', 'not a url', '']

    for (const url of blocked) {
      expect(fake.windowOpen(url), url).toEqual({ action: 'deny' })
      await expect(openExternalSafely(url, openExternal), url).rejects.toThrow(/blocked/i)
    }
    await expect(openExternalSafely(42, openExternal)).rejects.toThrow(/blocked/i)
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe('navigation', () => {
  it('blocks navigation away from app://launchkit', () => {
    const openExternal = vi.fn(async () => {})
    const fake = fakeWebContents()
    hardenWebContents(fake.webContents, { openExternal })

    for (const event of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
      for (const url of ['https://evil.example/', 'file:///etc/passwd', 'app://launchkit.evil.example/', 'app://other/', 'javascript:alert(1)']) {
        expect(fake.navigate(event, url), `${event} ${url}`).toHaveBeenCalledOnce()
      }
      for (const url of ['app://launchkit/files', 'app://launchkit/']) {
        expect(fake.navigate(event, url), `${event} ${url}`).not.toHaveBeenCalled()
      }
    }
    // Navigating away never turns into opening the system browser: a script could do that without a click.
    expect(openExternal).not.toHaveBeenCalled()
    expect(fake.windowOpen('file:///etc/passwd')).toEqual({ action: 'deny' })
    expect(fake.windowOpen('app://launchkit/files')).toEqual({ action: 'deny' })
    expect(fake.navigate('will-attach-webview', 'app://launchkit/')).toHaveBeenCalledOnce()
  })
})
