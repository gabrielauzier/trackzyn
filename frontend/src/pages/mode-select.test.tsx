import { screen, waitFor } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ModeSelectPage from './mode-select'
import { i18n, renderWithProviders } from '@/test/utils'
import type { TrackzynApi } from '@/lib/platform'

function installDesktopApi(startLocal: TrackzynApi['startLocal']) {
  const api: TrackzynApi = {
    isDesktop: true,
    platform: 'darwin',
    appVersion: '0.1.0',
    getServerUrl: vi.fn(async () => null),
    setServerUrl: vi.fn(),
    openExternal: vi.fn(async () => {}),
    onUpdateAvailable: vi.fn(() => () => {}),
    installUpdate: vi.fn(async () => {}),
    startSso: vi.fn(async () => {}),
    getMode: vi.fn(async () => null),
    startLocal,
    openLogs: vi.fn(async () => {}),
    onExportState: vi.fn(() => () => {}),
    reportFocusState: vi.fn(),
    onPauseRequest: vi.fn(() => () => {}),
  }
  Object.defineProperty(window, 'trackzyn', { value: api, configurable: true })
  return api
}

function Probe() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

function renderPage(onLocalReady?: () => void) {
  return renderWithProviders(
    <Routes>
      <Route path="/mode" element={<ModeSelectPage onLocalReady={onLocalReady} />} />
      <Route path="*" element={<Probe />} />
    </Routes>,
    { route: '/mode' },
  )
}

afterEach(async () => {
  Reflect.deleteProperty(window, 'trackzyn')
  await i18n.changeLanguage('en')
})

describe('mode choice screen', () => {
  it('shows a progressbar while the local backend starts', async () => {
    let finish: (value: { ok: boolean }) => void = () => {}
    const api = installDesktopApi(vi.fn(() => new Promise<{ ok: boolean }>((resolve) => (finish = resolve))))
    const onReady = vi.fn()
    const { user } = renderPage(onReady)
    await user.click(screen.getByRole('button', { name: 'Use this computer' }))
    expect(await screen.findByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this computer' })).toBeNull()
    expect(api.startLocal).toHaveBeenCalledTimes(1)

    finish({ ok: true })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/setup'))
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('shows the local backend failure with retry and logs actions', async () => {
    for (const [language, title, retry, logs] of [
      ['en', 'Could not start the local backend', 'Try again', 'Open logs'],
      ['pt-BR', 'Não foi possível iniciar o backend local', 'Tentar de novo', 'Abrir logs'],
    ] as const) {
      await i18n.changeLanguage(language)
      const api = installDesktopApi(vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true }))
      const { user, unmount } = renderPage()
      await user.click(screen.getByRole('button', { name: language === 'en' ? 'Use this computer' : 'Usar neste computador' }))
      expect(await screen.findByText(title)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: logs }))
      expect(api.openLogs).toHaveBeenCalledTimes(1)

      await user.click(screen.getByRole('button', { name: retry }))
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/setup'))
      expect(api.startLocal).toHaveBeenCalledTimes(2)
      unmount()
    }
  })

  it('explains an unreadable import journal on the failure screen, with the logs action, and not otherwise', async () => {
    for (const [language, text, logs] of [
      ['en', /import\.journal\.json/, 'Open logs'],
      ['pt-BR', /import\.journal\.json/, 'Abrir logs'],
    ] as const) {
      await i18n.changeLanguage(language)
      const api = installDesktopApi(vi.fn().mockResolvedValueOnce({ ok: false, reason: 'import-journal' }).mockResolvedValueOnce({ ok: false }))
      const { user, unmount } = renderPage()
      await user.click(screen.getByRole('button', { name: language === 'en' ? 'Use this computer' : 'Usar neste computador' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(text)
      await user.click(screen.getByRole('button', { name: logs }))
      expect(api.openLogs).toHaveBeenCalledTimes(1)
      // A failure without that reason shows no such line.
      await user.click(screen.getByRole('button', { name: language === 'en' ? 'Try again' : 'Tentar de novo' }))
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
      unmount()
    }
  })

  it('connect to a server leads to the connect screen', async () => {
    installDesktopApi(vi.fn())
    const { user } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Connect to a server' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/connect')
  })
})
