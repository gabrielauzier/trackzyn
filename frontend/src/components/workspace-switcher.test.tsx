import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitcher } from './workspace-switcher'
import { renderWithProviders, t } from '@/test/utils'
import type { LaunchkitApi } from '@/lib/platform'

const workspace = { id: 'ws-1', name: 'Synthetic workspace', role: 'owner' }

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { email: 'synthetic@example.com', is_2fa_enabled: false, is_superuser: false }, logout: vi.fn() }),
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: workspace, workspaces: [workspace], switchWorkspace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/api', () => ({ workspaces: { create: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function desktopApi(): LaunchkitApi {
  return {
    isDesktop: true,
    platform: 'darwin',
    appVersion: '0.1.0',
    getServerUrl: vi.fn(),
    setServerUrl: vi.fn(),
    openExternal: vi.fn(),
    onUpdateAvailable: vi.fn(() => () => {}),
    installUpdate: vi.fn(),
    startSso: vi.fn(async () => {}),
    // select-stack:begin node
    getMode: vi.fn(async () => 'remote' as const),
    startLocal: vi.fn(async () => ({ ok: true as const })),
    openLogs: vi.fn(async () => {}),
    onExportState: vi.fn(() => () => {}),
    // select-stack:end
  }
}

async function openAccountMenu() {
  const rendered = renderWithProviders(
    <WorkspaceSwitcher onChangePassword={vi.fn()} onTwoFactor={vi.fn()} onPasskeys={vi.fn()} localAuthEnabled />,
  )
  await rendered.user.click(screen.getByRole('button', { name: /Synthetic workspace/ }))
  await screen.findByText(t('auth.twoFactorTitle'))
}

afterEach(() => {
  Reflect.deleteProperty(window, 'launchkit')
})

describe('WorkspaceSwitcher passkeys entry', () => {
  it('offers passkeys on the web', async () => {
    await openAccountMenu()
    expect(screen.getByText(t('auth.passkeysTitle'))).toBeInTheDocument()
  })

  it('hides the passkeys entry when running on desktop', async () => {
    Object.defineProperty(window, 'launchkit', { value: desktopApi(), configurable: true })
    await openAccountMenu()
    expect(screen.getByText(t('auth.changePassword'))).toBeInTheDocument()
    expect(screen.queryByText(t('auth.passkeysTitle'))).not.toBeInTheDocument()
  })
})
