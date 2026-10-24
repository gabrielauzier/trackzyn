import { screen, waitFor } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConnectServerPage from './connect-server'
import { setup } from '@/lib/api'
import { WORKSPACE_STORAGE_KEY } from '@/lib/api'
import { i18n, renderWithProviders, t } from '@/test/utils'
import type { LaunchkitApi } from '@/lib/platform'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, setup: { ...actual.setup, status: vi.fn() } }
})

type SetServerUrl = LaunchkitApi['setServerUrl']

function installDesktopApi(setServerUrl: SetServerUrl) {
  const api: LaunchkitApi = {
    isDesktop: true,
    platform: 'darwin',
    appVersion: '0.1.0',
    getServerUrl: vi.fn(async () => null),
    setServerUrl,
    openExternal: vi.fn(async () => {}),
    onUpdateAvailable: vi.fn(() => () => {}),
    installUpdate: vi.fn(async () => {}),
    startSso: vi.fn(async () => {}),
    // select-stack:begin node
    getMode: vi.fn(async () => 'remote' as const),
    startLocal: vi.fn(async () => ({ ok: true as const })),
    openLogs: vi.fn(async () => {}),
    onExportState: vi.fn(() => () => {}),
    // select-stack:end
  }
  Object.defineProperty(window, 'launchkit', { value: api, configurable: true })
  return api
}

function Probe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/connect" element={<ConnectServerPage />} />
      <Route path="*" element={<Probe />} />
    </Routes>,
    { route: '/connect' },
  )
}

beforeEach(() => {
  vi.mocked(setup.status).mockResolvedValue({ has_users: true })
})

afterEach(async () => {
  Reflect.deleteProperty(window, 'launchkit')
  await i18n.changeLanguage('en')
  vi.clearAllMocks()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('connect to a server screen', () => {
  it('confirm is disabled while the url is empty', async () => {
    installDesktopApi(vi.fn())
    const { user } = renderPage()
    const button = screen.getByRole('button', { name: t('desktop.connect.confirm') })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'https://srv.example.com')
    expect(button).toBeEnabled()
    await user.clear(screen.getByLabelText(t('desktop.connect.urlLabel')))
    expect(button).toBeDisabled()
  })

  it('shows a disabled Checking button while connecting', async () => {
    for (const [language, checking] of [['en', 'Checking…'], ['pt-BR', 'Verificando…']] as const) {
      await i18n.changeLanguage(language)
      const pending = deferred<Awaited<ReturnType<SetServerUrl>>>()
      installDesktopApi(vi.fn(() => pending.promise))
      const { user, unmount } = renderPage()
      await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'https://srv.example.com')
      await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
      const button = await screen.findByRole('button', { name: checking })
      expect(button).toBeDisabled()
      pending.resolve({ ok: false, reason: 'unreachable' })
      await waitFor(() => expect(screen.getByRole('button', { name: t('desktop.connect.confirm') })).toBeEnabled())
      unmount()
    }
  })

  it('goes to /setup when the server has no users', async () => {
    const api = installDesktopApi(vi.fn(async () => ({ ok: true as const, url: 'https://srv.example.com' })))
    vi.mocked(setup.status).mockResolvedValue({ has_users: false })
    const { user } = renderPage()
    await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'https://srv.example.com')
    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/setup'))
    expect(api.setServerUrl).toHaveBeenCalledWith('https://srv.example.com', { allowInsecure: false })
  })

  it('goes to /login when the server has users', async () => {
    installDesktopApi(vi.fn(async () => ({ ok: true as const, url: 'https://srv.example.com' })))
    vi.mocked(setup.status).mockResolvedValue({ has_users: true })
    const { user } = renderPage()
    await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'https://srv.example.com')
    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })

  it('shows the unreachable message in en and pt-BR', async () => {
    for (const [language, message] of [
      ['en', 'Could not reach the server'],
      ['pt-BR', 'Não foi possível conectar ao servidor'],
    ] as const) {
      await i18n.changeLanguage(language)
      installDesktopApi(vi.fn(async () => ({ ok: false as const, reason: 'unreachable' as const })))
      const { user, unmount } = renderPage()
      await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'https://srv.example.com')
      await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.queryByTestId("location")).toBeNull()
      unmount()
    }
  })

  it('shows the protocol hint for invalid-url', async () => {
    installDesktopApi(vi.fn(async () => ({ ok: false as const, reason: 'invalid-url' as const })))
    const { user } = renderPage()
    await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'srv.example.com')
    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
    expect(await screen.findByText('Enter a URL starting with http:// or https://')).toBeInTheDocument()
  })

  it('warns on insecure http and confirms on the second click', async () => {
    const setServerUrl = vi
      .fn<SetServerUrl>()
      .mockResolvedValueOnce({ ok: false, reason: 'insecure' })
      .mockResolvedValueOnce({ ok: true, url: 'http://remote.example' })
    installDesktopApi(setServerUrl)
    const { user } = renderPage()
    await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'http://remote.example')
    const confirm = screen.getByRole('button', { name: t('desktop.connect.confirm') })
    await user.click(confirm)
    expect(await screen.findByText(t('desktop.connect.insecureWarning'))).toBeInTheDocument()
    expect(setServerUrl).toHaveBeenLastCalledWith('http://remote.example', { allowInsecure: false })
    expect(screen.queryByTestId('location')).toBeNull()

    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
    await waitFor(() => expect(screen.getByTestId('location')).toBeInTheDocument())
    expect(setServerUrl).toHaveBeenLastCalledWith('http://remote.example', { allowInsecure: true })
    expect(setServerUrl).toHaveBeenCalledTimes(2)
  })

  it('asks again for confirmation when the url changes after the warning', async () => {
    const setServerUrl = vi.fn<SetServerUrl>().mockResolvedValue({ ok: false, reason: 'insecure' })
    installDesktopApi(setServerUrl)
    const { user } = renderPage()
    const input = screen.getByLabelText(t('desktop.connect.urlLabel'))
    await user.type(input, 'http://remote.example')
    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
    await screen.findByText(t('desktop.connect.insecureWarning'))
    await user.type(input, '2')
    expect(screen.queryByText(t('desktop.connect.insecureWarning'))).toBeNull()
    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
    expect(setServerUrl).toHaveBeenLastCalledWith('http://remote.example2', { allowInsecure: false })
  })

  it('wipes the session only after the new server validates', async () => {
    const pending = deferred<Awaited<ReturnType<SetServerUrl>>>()
    const setServerUrl = vi.fn<SetServerUrl>(() => pending.promise)
    installDesktopApi(setServerUrl)
    localStorage.setItem('token', 'old-token')
    localStorage.setItem(WORKSPACE_STORAGE_KEY, 'old-workspace')
    vi.mocked(setup.status).mockImplementation(async () => {
      // No call to the new server may still carry the old session.
      expect(localStorage.getItem('token')).toBeNull()
      expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull()
      return { has_users: true }
    })
    const { user } = renderPage()
    await user.type(screen.getByLabelText(t('desktop.connect.urlLabel')), 'https://new.example.com')
    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))

    expect(localStorage.getItem('token')).toBe('old-token')
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe('old-workspace')

    pending.resolve({ ok: false, reason: 'unreachable' })
    await screen.findByText(t('desktop.connect.unreachable'))
    expect(localStorage.getItem('token')).toBe('old-token')
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe('old-workspace')
    expect(setup.status).not.toHaveBeenCalled()

    setServerUrl.mockResolvedValueOnce({ ok: true, url: 'https://new.example.com' })
    await user.click(screen.getByRole('button', { name: t('desktop.connect.confirm') }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull()
    expect(setup.status).toHaveBeenCalledTimes(1)
  })

  it('shows Sign-in did not complete when sso=failed', async () => {
    for (const [language, message] of [
      ['en', 'Sign-in did not complete'],
      ['pt-BR', 'O login não foi concluído'],
    ] as const) {
      await i18n.changeLanguage(language)
      installDesktopApi(vi.fn())
      const { unmount } = renderWithProviders(
        <Routes>
          <Route path="/connect" element={<ConnectServerPage />} />
        </Routes>,
        { route: '/connect?sso=failed' },
      )
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      unmount()
    }
  })
})
