import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopGate } from './desktop-gate'
import { i18n, renderWithProviders } from '@/test/utils'
import type { TrackzynApi } from '@/lib/platform'

function installDesktopApi(serverUrl: string | null, mode: 'remote' | 'local' | null = 'remote') {
  const api: TrackzynApi = {
    isDesktop: true,
    platform: 'darwin',
    appVersion: '0.1.0',
    getServerUrl: vi.fn(async () => serverUrl),
    setServerUrl: vi.fn(),
    openExternal: vi.fn(async () => {}),
    onUpdateAvailable: vi.fn(() => () => {}),
    installUpdate: vi.fn(async () => {}),
    startSso: vi.fn(async () => {}),
    getMode: vi.fn(async () => mode),
    startLocal: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: true })),
    openLogs: vi.fn(async () => {}),
    onExportState: vi.fn(() => () => {}),
    reportFocusState: vi.fn(),
    onPauseRequest: vi.fn(() => () => {}),
    windowRole: 'main' as const,
    collapseFocus: vi.fn(async () => {}),
    expandFocus: vi.fn(async () => {}),
    resizeWidget: vi.fn(async () => {}),
    notifyFocusChanged: vi.fn(),
    onFocusChanged: vi.fn(() => () => {}),
    onWidgetState: vi.fn(() => () => {}),
  }
  Object.defineProperty(window, 'trackzyn', { value: api, configurable: true })
  return api
}

function renderGate(route: string) {
  return renderWithProviders(
    <DesktopGate>
      <Routes>
        <Route path="/setup" element={<div>setup page</div>} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </DesktopGate>,
    { route },
  )
}

afterEach(async () => {
  Reflect.deleteProperty(window, 'trackzyn')
  await i18n.changeLanguage('en')
})

describe('desktop gate', () => {
  it('shows the connect screen instead of setup and login', async () => {
    for (const [language, title] of [
      ['en', 'Connect to a server'],
      ['pt-BR', 'Conectar a um servidor'],
    ] as const) {
      await i18n.changeLanguage(language)
      for (const route of ['/setup', '/login']) {
        installDesktopApi(null)
        const { unmount } = renderGate(route)
        expect(await screen.findByRole('heading', { name: title }), `${language} ${route}`).toBeInTheDocument()
        expect(screen.queryByText('setup page')).toBeNull()
        expect(screen.queryByText('login page')).toBeNull()
        unmount()
      }
    }
  })

  it('renders the app when a server is configured', async () => {
    installDesktopApi('https://srv.example.com')
    renderGate('/login')
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Connect to a server' })).toBeNull()
  })

  it('opens the connect screen on /connect even with a saved server', async () => {
    installDesktopApi('https://srv.example.com')
    renderGate('/connect')
    expect(await screen.findByRole('heading', { name: 'Connect to a server' })).toBeInTheDocument()
  })

  it('goes on to the app once a server is connected', async () => {
    const api = installDesktopApi(null)
    vi.mocked(api.setServerUrl).mockResolvedValue({ ok: true, url: 'https://srv.example.com' })
    const { user } = renderGate('/login')
    await user.type(await screen.findByLabelText('Server URL'), 'https://srv.example.com')
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(api.setServerUrl).toHaveBeenCalled())
  })

  it('renders the app untouched on the web, where window.trackzyn does not exist', async () => {
    renderGate('/login')
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('shows the mode choice before anything else on first use', async () => {
    for (const [language, connect, local] of [
      ['en', 'Connect to a server', 'Use this computer'],
      ['pt-BR', 'Conectar a um servidor', 'Usar neste computador'],
    ] as const) {
      await i18n.changeLanguage(language)
      for (const route of ['/', '/setup', '/login']) {
        installDesktopApi(null, null)
        const { unmount } = renderGate(route)
        expect(await screen.findByRole('button', { name: connect }), `${language} ${route}`).toBeInTheDocument()
        expect(screen.getByRole('button', { name: local })).toBeInTheDocument()
        expect(screen.queryByText('setup page')).toBeNull()
        expect(screen.queryByText('login page')).toBeNull()
        unmount()
      }
    }
  })

  it('opens the mode choice on /mode even when a mode is set', async () => {
    installDesktopApi(null, 'local')
    renderGate('/mode')
    expect(await screen.findByRole('button', { name: 'Use this computer' })).toBeInTheDocument()
  })

  it('starts the local backend before it renders the app in local mode', async () => {
    const api = installDesktopApi(null, 'local')
    let finish: (value: { ok: boolean }) => void = () => {}
    vi.mocked(api.startLocal).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderGate('/login')
    expect(await screen.findByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('login page')).toBeNull()
    finish({ ok: true })
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('shows the failure and retries when the local backend does not start', async () => {
    const api = installDesktopApi(null, 'local')
    vi.mocked(api.startLocal).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true })
    const { user } = renderGate('/login')
    expect(await screen.findByText('Could not start the local backend')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })
})
