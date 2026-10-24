/**
 * macOS desktop hides the native title bar (`titleBarStyle: hiddenInset`), so
 * the app's own header must be draggable while its controls stay clickable.
 */
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from './app-layout'
import { renderWithProviders, t } from '@/test/utils'
import type { LaunchkitApi } from '@/lib/platform'

const state = vi.hoisted(() => ({
  user: {
    email: 'synthetic@example.com',
    is_2fa_enabled: true,
    is_superuser: false,
    preferences: { onboarding_completed: true },
  },
  workspace: { id: 'synthetic', name: 'Synthetic workspace', role: 'owner' },
  auth: {
    oidcConfig: vi.fn(),
    listPasskeys: vi.fn(),
    deletePasskey: vi.fn(),
    disable2fa: vi.fn(),
    setup2fa: vi.fn(),
    enable2fa: vi.fn(),
    registerPasskeyOptions: vi.fn(),
    verifyPasskeyRegistration: vi.fn(),
  },
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: state.user,
    logout: vi.fn(),
    updateUser: (user: typeof state.user) => {
      state.user = user
    },
  }),
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({
    current: state.workspace,
    workspaces: [state.workspace],
    switchWorkspace: vi.fn(),
    refresh: vi.fn(),
    canWrite: false,
    isLoading: false,
  }),
}))
vi.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({ isLoading: false, features: {}, isEnabled: () => false, updateCheckRepo: null }),
}))
vi.mock('@/lib/api', () => ({
  auth: state.auth,
  admin: {
    defaultColors: async () => ({ light: null, dark: null }),
    numberFormat: async () => ({ format: 'auto' }),
  },
  workspaces: { create: vi.fn() },
  info: { get: async () => ({ features: {} }) },
}))
vi.mock('@/lib/webauthn', () => ({
  passkeyBlocker: () => null,
  passkeyFailure: () => 'unknown',
  startPasskeyRegistration: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }))
vi.mock('@/components/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/update-available-dialog', () => ({ UpdateAvailableDialog: () => null }))

const DRAG = '[-webkit-app-region:drag]'
const NO_DRAG = '[-webkit-app-region:no-drag]'

function installDesktopApi(platform: string) {
  const api: LaunchkitApi = {
    isDesktop: true,
    platform,
    appVersion: '0.1.0',
    getServerUrl: vi.fn(async () => 'https://srv.example.com'),
    setServerUrl: vi.fn(),
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
}

afterEach(() => {
  Reflect.deleteProperty(window, 'launchkit')
})

describe('app layout title bar', () => {
  it('drag region on the header and no-drag on controls', () => {
    installDesktopApi('darwin')
    renderWithProviders(<AppLayout />)

    const header = screen.getByRole('banner')
    expect(header).toHaveClass(DRAG)
    const controls = [...within(header).getAllByRole('button'), ...within(header).getAllByRole('link')]
    expect(controls.length).toBeGreaterThan(2)
    for (const control of controls) expect(control, control.getAttribute('aria-label') ?? '').toHaveClass(NO_DRAG)

    const sidebarHeader = screen.getAllByRole('link', { name: t('app.name') })[1].parentElement!
    expect(sidebarHeader).toHaveClass(DRAG)
    for (const control of [...within(sidebarHeader).getAllByRole('button'), ...within(sidebarHeader).getAllByRole('link')]) {
      expect(control, control.getAttribute('aria-label') ?? '').toHaveClass(NO_DRAG)
    }
    expect(document.querySelector('aside > div:first-child')).toHaveClass(DRAG)
  })

  it('leaves the header alone on other systems and on the web', () => {
    for (const platform of ['win32', 'linux', null]) {
      if (platform) installDesktopApi(platform)
      const { unmount } = renderWithProviders(<AppLayout />)
      expect(document.body.innerHTML, String(platform)).not.toContain('-webkit-app-region')
      unmount()
      Reflect.deleteProperty(window, 'launchkit')
    }
  })
})
