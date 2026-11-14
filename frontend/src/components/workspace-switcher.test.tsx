import { useEffect } from 'react'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitcher } from './workspace-switcher'
import { DraftGuardProvider } from '@/lib/plan/draft-guard'
import { useDraftGuard } from '@/lib/plan/draft-guard-context'
import { i18n, renderWithProviders, t } from '@/test/utils'
import type { TrackzynApi } from '@/lib/platform'

const state = vi.hoisted(() => {
  const workspace = { id: 'ws-1', name: 'Synthetic workspace', role: 'owner' }
  return {
    workspace,
    workspaces: [workspace] as { id: string; name: string; role: string }[],
    user: { email: 'synthetic@example.com', is_2fa_enabled: false, is_superuser: false },
    logout: vi.fn(),
    switchWorkspace: vi.fn<(id: string) => Promise<void>>(async () => {}),
    refresh: vi.fn(async () => {}),
    create: vi.fn(),
  }
})

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: state.user, logout: state.logout }),
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({
    current: state.workspace,
    workspaces: state.workspaces,
    switchWorkspace: state.switchWorkspace,
    refresh: state.refresh,
  }),
}))
vi.mock('@/lib/api', () => ({ workspaces: { create: state.create } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function desktopApi(): TrackzynApi {
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
    getMode: vi.fn(async () => 'remote' as const),
    startLocal: vi.fn(async () => ({ ok: true as const })),
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
    onWidgetHover: vi.fn(() => () => {}),
    getCaptureShortcut: vi.fn(async () => ({ enabled: true, accelerator: 'CommandOrControl+Shift+Space' })),
    setCaptureShortcut: vi.fn(async () => ({ ok: true as const })),
    closeCapture: vi.fn(async () => undefined),
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
  Reflect.deleteProperty(window, 'trackzyn')
})

describe('WorkspaceSwitcher passkeys entry', () => {
  it('offers passkeys on the web', async () => {
    await openAccountMenu()
    expect(screen.getByText(t('auth.passkeysTitle'))).toBeInTheDocument()
  })

  it('hides the passkeys entry when running on desktop', async () => {
    Object.defineProperty(window, 'trackzyn', { value: desktopApi(), configurable: true })
    await openAccountMenu()
    expect(screen.getByText(t('auth.changePassword'))).toBeInTheDocument()
    expect(screen.queryByText(t('auth.passkeysTitle'))).not.toBeInTheDocument()
  })
})

/** The plan of a day holding an unsaved draft. */
function PlanWithDraft() {
  const { setDraftDay } = useDraftGuard()
  useEffect(() => setDraftDay('2026-11-09'), [setDraftDay])
  return null
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

/** The account menu in the shell of `route`, opened; on `/planejar/2026-11-09` the plan holds a draft. */
async function openMenuOn(route: string) {
  const rendered = renderWithProviders(
    <DraftGuardProvider>
      <WorkspaceSwitcher onChangePassword={vi.fn()} onTwoFactor={vi.fn()} onPasskeys={vi.fn()} localAuthEnabled />
      <Routes>
        <Route path="/planejar/:day" element={<PlanWithDraft />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </DraftGuardProvider>,
    { route },
  )
  await rendered.user.click(screen.getByRole('button', { name: /Synthetic workspace/ }))
  await screen.findByRole('menuitem', { name: t('auth.logout') })
  return rendered.user
}

const PLAN = '/planejar/2026-11-09'
const where = () => screen.getByTestId('where')
const leaveDialog = () => screen.findByRole('dialog', { name: 'Descartar o rascunho?' })

describe('WorkspaceSwitcher and an unsaved plan (PLAN-36)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR')
    state.workspaces = [state.workspace, { id: 'ws-2', name: 'Other workspace', role: 'editor' }]
    state.user = { ...state.user, is_superuser: true }
    state.logout.mockClear()
    state.switchWorkspace.mockClear()
    state.refresh.mockClear()
    state.create.mockReset()
  })

  afterEach(async () => {
    await i18n.changeLanguage('en')
    state.workspaces = [state.workspace]
    state.user = { ...state.user, is_superuser: false }
  })

  it.each([
    ['workspace.settingsMenu', '/workspace/settings'],
    ['nav.groupAdmin', '/admin'],
  ])('%s asks Descartar o rascunho? and goes to %s only on Descartar', async (key, to) => {
    const user = await openMenuOn(PLAN)

    await user.click(screen.getByRole('menuitem', { name: t(key) }))
    const dialog = await leaveDialog()
    expect(where()).toHaveTextContent(PLAN)
    await user.click(within(dialog).getByRole('button', { name: 'Continuar planejando' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(where()).toHaveTextContent(PLAN)

    await user.click(screen.getByRole('button', { name: /Synthetic workspace/ }))
    await user.click(await screen.findByRole('menuitem', { name: t(key) }))
    await user.click(within(await leaveDialog()).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(where()).toHaveTextContent(to))
  })

  it('switching workspace asks Descartar o rascunho? and switches only on Descartar', async () => {
    const user = await openMenuOn(PLAN)

    await user.click(screen.getByRole('menuitem', { name: /Other workspace/ }))
    const dialog = await leaveDialog()
    expect(state.switchWorkspace).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(state.switchWorkspace).toHaveBeenCalledExactlyOnceWith('ws-2'))
    expect(where()).toHaveTextContent(PLAN)
  })

  it('the active workspace is no way out: nothing asks and nothing switches', async () => {
    const user = await openMenuOn(PLAN)

    await user.click(screen.getByRole('menuitem', { name: /Synthetic workspace/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.switchWorkspace).not.toHaveBeenCalled()
  })

  it('logging out asks Descartar o rascunho? and logs out only on Descartar', async () => {
    const user = await openMenuOn(PLAN)

    await user.click(screen.getByRole('menuitem', { name: t('auth.logout') }))
    const dialog = await leaveDialog()
    expect(state.logout).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(state.logout).toHaveBeenCalledOnce())
  })

  it('a new workspace is created, then asks Descartar o rascunho? before switching to it and opening its settings', async () => {
    state.create.mockResolvedValue({ id: 'ws-new', name: 'Side project', role: 'owner' })
    const user = await openMenuOn(PLAN)

    await user.click(screen.getByRole('menuitem', { name: t('workspace.create') }))
    await user.type(await screen.findByLabelText(t('common.name')), 'Side project')
    await user.click(screen.getByRole('button', { name: t('common.create') }))
    const dialog = await leaveDialog()
    expect(state.create).toHaveBeenCalledOnce()
    expect(state.switchWorkspace).not.toHaveBeenCalled()
    expect(where()).toHaveTextContent(PLAN)

    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(where()).toHaveTextContent('/workspace/settings'))
    expect(state.switchWorkspace).toHaveBeenCalledExactlyOnceWith('ws-new')
  })

  it('without a draft, the menu leaves at once', async () => {
    const user = await openMenuOn('/agenda')

    await user.click(screen.getByRole('menuitem', { name: t('workspace.settingsMenu') }))
    await waitFor(() => expect(where()).toHaveTextContent('/workspace/settings'))
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Synthetic workspace/ }))
    await user.click(await screen.findByRole('menuitem', { name: t('auth.logout') }))
    expect(state.logout).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
