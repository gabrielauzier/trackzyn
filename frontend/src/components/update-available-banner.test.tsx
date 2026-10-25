import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateAvailableBanner } from './update-available-banner'
import { i18n, renderWithProviders } from '@/test/utils'
import type { TrackzynApi } from '@/lib/platform'

vi.mock('@/lib/api', () => ({ info: { get: vi.fn(async () => ({ features: {}, update_check_repo: null })) } }))

function installDesktopApi() {
  let listener: ((info: { version: string }) => void) | null = null
  const api: TrackzynApi = {
    isDesktop: true,
    platform: 'darwin',
    appVersion: '0.1.0',
    getServerUrl: vi.fn(async () => 'https://srv.example.com'),
    setServerUrl: vi.fn(),
    openExternal: vi.fn(async () => {}),
    onUpdateAvailable: vi.fn((callback) => {
      listener = callback
      return () => {
        listener = null
      }
    }),
    installUpdate: vi.fn(async () => {}),
    startSso: vi.fn(async () => {}),
    getMode: vi.fn(async () => 'remote' as const),
    startLocal: vi.fn(async () => ({ ok: true as const })),
    openLogs: vi.fn(async () => {}),
    onExportState: vi.fn(() => () => {}),
    reportFocusState: vi.fn(),
    onPauseRequest: vi.fn(() => () => {}),
  }
  Object.defineProperty(window, 'trackzyn', { value: api, configurable: true })
  return { api, emit: (version: string) => listener?.({ version }) }
}

afterEach(async () => {
  Reflect.deleteProperty(window, 'trackzyn')
  await i18n.changeLanguage('en')
})

describe('update available banner on desktop', () => {
  it('shows the desktop update banner and installs on click', async () => {
    const { api, emit } = installDesktopApi()
    renderWithProviders(<UpdateAvailableBanner onOpen={vi.fn()} />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(api.onUpdateAvailable).toHaveBeenCalledTimes(1)

    act(() => emit('0.2.0'))
    const button = await screen.findByRole('button', { name: /restart to update to 0\.2\.0/i })
    await userEvent.click(button)

    expect(api.installUpdate).toHaveBeenCalledTimes(1)
  })

  it('stops listening when it unmounts', () => {
    const { emit } = installDesktopApi()
    const { unmount } = renderWithProviders(<UpdateAvailableBanner onOpen={vi.fn()} />)
    unmount()
    act(() => emit('0.2.0'))
    expect(screen.queryByRole('button')).toBeNull()
  })
})
