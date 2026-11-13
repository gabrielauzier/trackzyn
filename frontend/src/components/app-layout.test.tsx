/**
 * macOS desktop hides the native title bar (`titleBarStyle: hiddenInset`), so
 * the app's own header must be draggable while its controls stay clickable.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './app-layout'
import { DraftGuardProvider } from '@/lib/plan/draft-guard'
import { useDraftGuard } from '@/lib/plan/draft-guard-context'
import FocusPage from '@/pages/focus'
import { i18n, renderWithProviders, t } from '@/test/utils'
import { installPrintStyles } from '@/test/print-styles'
import { deviceId } from '@/lib/focus/device-id'
import type { QueuedAction } from '@/lib/focus/queue'
import type { TrackzynApi } from '@/lib/platform'
import type { FocusState } from '@/types'

const state = vi.hoisted(() => ({
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  lists: { list: vi.fn(async () => ({ timezone: 'America/Sao_Paulo', lists: [] })) },
  inbox: { count: vi.fn(async () => ({ count: 0 })) },
  user: {
    email: 'synthetic@example.com',
    is_2fa_enabled: true,
    is_superuser: false,
    preferences: { onboarding_completed: true },
  },
  workspace: { id: 'synthetic', name: 'Synthetic workspace', role: 'owner' },
  canWrite: false,
  personalTokens: false,
  accessTokens: { list: vi.fn(async () => []), create: vi.fn(), revoke: vi.fn() },
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
    canWrite: state.canWrite,
    isLoading: false,
  }),
}))
vi.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({ isLoading: false, features: {}, isEnabled: (flag: string) => flag === 'personal_tokens' && state.personalTokens, updateCheckRepo: null }),
}))
vi.mock('@/lib/api', () => ({
  auth: state.auth,
  accessTokens: state.accessTokens,
  admin: {
    defaultColors: async () => ({ light: null, dark: null }),
    numberFormat: async () => ({ format: 'auto' }),
  },
  workspaces: { create: vi.fn() },
  info: { get: async () => ({ features: {} }) },
  focus: state.focus,
  lists: state.lists,
  inbox: state.inbox,
  authHeaders: () => ({ Authorization: 'Bearer token-123' }),
}))
vi.mock('@/lib/webauthn', () => ({
  passkeyBlocker: () => null,
  passkeyFailure: () => 'unknown',
  startPasskeyRegistration: vi.fn(),
}))
vi.mock('@/lib/sounds/synth', () => ({ play: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }))
vi.mock('@/components/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))
vi.mock('@/components/update-available-dialog', () => ({ UpdateAvailableDialog: () => null }))

const DRAG = '[-webkit-app-region:drag]'
const NO_DRAG = '[-webkit-app-region:no-drag]'

function installDesktopApi(platform: string) {
  const api: TrackzynApi = {
    isDesktop: true,
    platform,
    appVersion: '0.1.0',
    getServerUrl: vi.fn(async () => 'https://srv.example.com'),
    setServerUrl: vi.fn(),
    openExternal: vi.fn(async () => {}),
    onUpdateAvailable: vi.fn(() => () => {}),
    installUpdate: vi.fn(async () => {}),
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
  }
  Object.defineProperty(window, 'trackzyn', { value: api, configurable: true })
}

const LIST = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b'

function focusState(counting: boolean): FocusState {
  const task = { id: 'task-a', title: 'Write the report', estimate_minutes: 60, spent_seconds: 600, awaiting_extend: false }
  return {
    server_now: new Date().toISOString(),
    session: counting
      ? {
          id: 'session-1',
          kind: 'task',
          task_id: task.id,
          list_id: LIST,
          device_id: deviceId(),
          started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
          deadline_at: new Date(Date.now() + 50 * 60_000).toISOString(),
          planned_seconds: null,
        }
      : null,
    task,
    today: { pending: 1, done: 0, estimate_minutes: 60, tasks: [{ ...task, position: 0 }] },
    stale: null,
  }
}

beforeEach(() => {
  state.focus.get.mockReset()
  state.focus.send.mockReset()
  state.focus.heartbeat.mockReset()
  state.focus.get.mockResolvedValue(focusState(false))
  state.focus.send.mockResolvedValue(focusState(false))
})

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
  vi.unstubAllGlobals()
  state.canWrite = false
  state.personalTokens = false
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
      Reflect.deleteProperty(window, 'trackzyn')
    }
  })
})

describe('app layout sidebar', () => {
  it('offers the list entries, with All my lists selected on the home', () => {
    state.canWrite = true
    renderWithProviders(<AppLayout />, { route: '/' })

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Create new list' })).toHaveAttribute('href', '/?new=1')
    expect(within(nav).getByRole('link', { name: 'All my lists' })).toHaveAttribute('aria-current', 'page')
    const archived = within(nav).getByRole('link', { name: 'Archived lists' })
    expect(archived).toHaveAttribute('href', '/lists/archived')
    expect(archived).not.toHaveAttribute('aria-current')
    expect(within(nav).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('offers Agenda, leading to /agenda, between the lists and Reports (AGENDA-13)', () => {
    state.canWrite = true
    renderWithProviders(<AppLayout />, { route: '/' })

    const links = within(screen.getByRole('navigation')).getAllByRole('link').map((link) => link.getAttribute('aria-label') ?? link.textContent)
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/agenda')
    expect(links.indexOf('Agenda')).toBe(links.indexOf('Archived lists') + 1)
    // `Planejar` sits between Agenda and Reports (PLAN-30).
    expect(links.indexOf('Plan')).toBe(links.indexOf('Agenda') + 1)
    expect(links.indexOf('Reports')).toBe(links.indexOf('Plan') + 1)
  })

  it('AGENDA-02 lets the agenda take the whole width, and keeps the other pages to the reading width', () => {
    const { unmount } = renderWithProviders(<AppLayout />, { route: '/agenda' })
    expect(document.querySelector('main > div')).not.toHaveClass('max-w-7xl')
    unmount()
    renderWithProviders(<AppLayout />, { route: '/' })
    expect(document.querySelector('main > div')).toHaveClass('max-w-7xl')
  })

  it('PLAN-30 offers Planejar, leading to the plan of today, for a viewer too', () => {
    state.canWrite = false
    renderWithProviders(<AppLayout />, { route: '/' })

    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Plan' })).toHaveAttribute('href', '/planejar')
  })

  it('PLAN-36 a sidebar link out of an unsaved plan asks Descartar o rascunho? and leaves only on Descartar', async () => {
    state.canWrite = true
    await i18n.changeLanguage('pt-BR')
    try {
      /** The plan of a day holding an unsaved draft. */
      function PlanWithDraft() {
        const { setDraftDay } = useDraftGuard()
        useEffect(() => setDraftDay('2026-11-09'), [setDraftDay])
        return null
      }
      function Where() {
        return <span data-testid="where">{useLocation().pathname}</span>
      }
      const { user } = renderWithProviders(
        <DraftGuardProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/planejar/:day" element={<PlanWithDraft />} />
              <Route path="/agenda" element={null} />
            </Route>
          </Routes>
          <Where />
        </DraftGuardProvider>,
        { route: '/planejar/2026-11-09' },
      )
      const agenda = within(screen.getByRole('navigation')).getByRole('link', { name: 'Agenda' })

      await user.click(agenda)
      const dialog = await screen.findByRole('dialog', { name: 'Descartar o rascunho?' })
      expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-09')
      await user.click(within(dialog).getByRole('button', { name: 'Continuar planejando' }))
      expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-09')

      await user.click(agenda)
      await user.click(within(await screen.findByRole('dialog', { name: 'Descartar o rascunho?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/agenda'))
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it.each([
    ['the mobile header', 'header'],
    ['the sidebar', 'aside'],
  ])('PLAN-36 the logo of %s, out of an unsaved plan, asks Descartar o rascunho? and leaves for the home only on Descartar', async (_where, container) => {
    state.canWrite = true
    await i18n.changeLanguage('pt-BR')
    try {
      /** The plan of a day holding an unsaved draft. */
      function PlanWithDraft() {
        const { setDraftDay } = useDraftGuard()
        useEffect(() => setDraftDay('2026-11-09'), [setDraftDay])
        return null
      }
      function Where() {
        return <span data-testid="where">{useLocation().pathname}</span>
      }
      const { user } = renderWithProviders(
        <DraftGuardProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={null} />
              <Route path="/planejar/:day" element={<PlanWithDraft />} />
            </Route>
          </Routes>
          <Where />
        </DraftGuardProvider>,
        { route: '/planejar/2026-11-09' },
      )
      const logos = screen.getAllByRole('link', { name: t('app.name') })
      expect(logos).toHaveLength(2)
      const logo = logos.find((link) => link.closest(container) !== null)!
      expect(logo).toHaveAttribute('href', '/')

      await user.click(logo)
      const dialog = await screen.findByRole('dialog', { name: 'Descartar o rascunho?' })
      expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-09')
      await user.click(within(dialog).getByRole('button', { name: 'Continuar planejando' }))
      expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-09')

      await user.click(logo)
      await user.click(within(await screen.findByRole('dialog', { name: 'Descartar o rascunho?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/))
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('selects Archived lists on its page', () => {
    state.canWrite = true
    renderWithProviders(<AppLayout />, { route: '/lists/archived' })

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Archived lists' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'All my lists' })).not.toHaveAttribute('aria-current')
  })

  it('hides Create new list from a viewer', () => {
    state.canWrite = false
    renderWithProviders(<AppLayout />, { route: '/' })

    const nav = screen.getByRole('navigation')
    expect(within(nav).queryByRole('link', { name: 'Create new list' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'All my lists' })).toBeInTheDocument()
  })
})

describe('app layout inbox (INBOX-01)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR')
  })
  afterEach(async () => {
    state.inbox.count.mockResolvedValue({ count: 0 })
    await i18n.changeLanguage('en')
  })

  it('INBOX-01 shows Caixa de entrada with 6 when six items wait, leading to /inbox', async () => {
    state.inbox.count.mockResolvedValue({ count: 6 })
    renderWithProviders(<AppLayout />, { route: '/' })

    const link = await within(screen.getByRole('navigation')).findByRole('link', { name: 'Caixa de entrada, 6 itens' })
    expect(link).toHaveAttribute('href', '/inbox')
    expect(link.querySelector('[data-inbox-badge]')).toHaveTextContent(/^6$/)
  })

  it('INBOX-01 shows no number when the inbox is empty', async () => {
    state.inbox.count.mockResolvedValue({ count: 0 })
    const { queryClient } = renderWithProviders(<AppLayout />, { route: '/' })

    await waitFor(() => expect(queryClient.getQueryState(['inbox', 'count'])?.status).toBe('success'))
    const link = within(screen.getByRole('navigation')).getByRole('link', { name: 'Caixa de entrada' })
    expect(link).toHaveTextContent(/^Caixa de entrada$/)
    expect(link.querySelector('[data-inbox-badge]')).toBeNull()
  })

  it('INBOX-01 offers the inbox to a viewer too', async () => {
    state.canWrite = false
    state.inbox.count.mockResolvedValue({ count: 1 })
    renderWithProviders(<AppLayout />, { route: '/' })

    expect(await within(screen.getByRole('navigation')).findByRole('link', { name: 'Caixa de entrada, 1 item' })).toHaveAttribute('href', '/inbox')
  })
})

describe('app layout admin links', () => {
  afterEach(() => {
    state.user = { ...state.user, is_superuser: false }
    localStorage.clear()
  })

  it('a superuser sees Files and Components with the admin badge', () => {
    state.user = { ...state.user, is_superuser: true }
    renderWithProviders(<AppLayout />, { route: '/' })

    const nav = screen.getByRole('navigation')
    const files = within(nav).getByRole('link', { name: 'Files (admin)' })
    const components = within(nav).getByRole('link', { name: 'Components (admin)' })
    expect(files).toHaveAttribute('href', '/files')
    expect(components).toHaveAttribute('href', '/components')
    for (const link of [files, components]) {
      const badge = link.querySelector('[data-admin-badge]')
      expect(badge).toHaveTextContent('admin')
      expect(badge).toHaveClass('rounded-full', 'bg-primary/10', 'text-primary')
      // The badge sits to the right of the name.
      expect(badge?.previousElementSibling?.textContent).toBe(link === files ? 'Files' : 'Components')
    }
    // Files closes the Workspace group; Components is under Developers.
    expect(within(nav).getByText('Developers')).toBeInTheDocument()
    const order = within(nav).getAllByRole('link').map((link) => link.getAttribute('aria-label'))
    expect(order.indexOf('Files (admin)')).toBe(order.indexOf('Reports') + 1)
    expect(order.at(-1)).toBe('Components (admin)')
  })

  it('the collapsed sidebar keeps a gap between the workspace switcher and the bottom of the window', async () => {
    const { user } = renderWithProviders(<AppLayout />, { route: '/' })
    const footer = document.querySelector<HTMLElement>('[data-slot="workspace-footer"]')!
    // Expanded, the version line under the switcher carries the bottom padding.
    expect(footer.className).not.toMatch(/(^|\s)lg:pb-/)

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    // Collapsed, the version line is hidden, so the switcher's own block takes the same 12 px.
    expect(screen.getByRole('note').parentElement).toHaveClass('lg:hidden')
    expect(footer).toHaveClass('lg:pb-3')
  })

  it('the collapsed sidebar marks admin links with a dot', async () => {
    state.user = { ...state.user, is_superuser: true }
    const { user } = renderWithProviders(<AppLayout />, { route: '/' })

    const nav = screen.getByRole('navigation')
    expect(nav.querySelector('[data-admin-dot]')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    for (const name of ['Files (admin)', 'Components (admin)']) {
      const link = within(nav).getByRole('link', { name })
      expect(link).toHaveAttribute('title', name)
      const dot = link.querySelector('[data-admin-dot]')
      expect(dot).toBeInTheDocument()
      expect(dot).toHaveClass('bg-primary', 'rounded-full', 'absolute')
      expect(link).toHaveClass('relative')
      // Collapsed, the badge goes with the name; only the dot is drawn.
      expect(link.querySelector('[data-admin-badge]')).toHaveClass('lg:hidden')
    }
    // Other links have no dot.
    expect(within(nav).getByRole('link', { name: 'Reports' }).querySelector('[data-admin-dot]')).not.toBeInTheDocument()
  })

  it('in Portuguese, names the admin links Arquivos (admin) and Componentes (admin)', async () => {
    state.user = { ...state.user, is_superuser: true }
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<AppLayout />, { route: '/' })
      const nav = screen.getByRole('navigation')
      expect(within(nav).getByRole('link', { name: 'Arquivos (admin)' })).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: 'Componentes (admin)' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('a user who is not a superuser sees neither link nor the Developers header', () => {
    renderWithProviders(<AppLayout />, { route: '/' })

    const nav = screen.getByRole('navigation')
    expect(within(nav).queryByRole('link', { name: /Files|Components/ })).not.toBeInTheDocument()
    expect(within(nav).queryByText('Developers')).not.toBeInTheDocument()
  })
})

describe('app layout access tokens entry', () => {
  async function openAccountMenu() {
    const { user } = renderWithProviders(<AppLayout />)
    await user.click(screen.getByRole('button', { name: 'Synthetic workspace' }))
    await screen.findByText(t('auth.twoFactorTitle'))
    return user
  }

  it('offers the entry and opens the dialog when the server has personal tokens', async () => {
    state.personalTokens = true
    const user = await openAccountMenu()

    await user.click(screen.getByRole('menuitem', { name: t('accessTokens.title') }))

    expect(await screen.findByRole('dialog', { name: t('accessTokens.title') })).toBeInTheDocument()
    await waitFor(() => expect(state.accessTokens.list).toHaveBeenCalled())
  })

  it('hides the entry when the server has them off, as in the local mode', async () => {
    await openAccountMenu()

    expect(screen.queryByRole('menuitem', { name: t('accessTokens.title') })).not.toBeInTheDocument()
    expect(screen.queryByText(t('accessTokens.title'))).not.toBeInTheDocument()
  })
})

describe('app layout when printing (REPORT-23)', () => {
  it('prints without the side menu and the mobile header, which stay on screen', () => {
    renderWithProviders(<AppLayout />, { route: '/reports' })
    const sidebar = screen.getByRole('complementary')
    const header = screen.getByRole('banner')
    expect(sidebar).toHaveClass('print-hidden')
    expect(header).toHaveClass('print-hidden')

    const removeScreen = installPrintStyles('screen')
    expect(getComputedStyle(sidebar).display).not.toBe('none')
    expect(getComputedStyle(header).display).not.toBe('none')
    removeScreen()

    const removePrint = installPrintStyles('print')
    expect(getComputedStyle(sidebar).display).toBe('none')
    expect(getComputedStyle(header).display).toBe('none')
    removePrint()
  })
})

describe('app layout focus guard', () => {
  it('SYNC-08 on the board, tells the desktop a task counts and pauses it when the desktop asks before closing', async () => {
    installDesktopApi('darwin')
    state.focus.get.mockResolvedValue(focusState(true))
    renderWithProviders(<AppLayout />, { route: `/lists/${LIST}`, path: '/lists/:listId' })

    const desktop = window.trackzyn as unknown as { reportFocusState: ReturnType<typeof vi.fn>; onPauseRequest: ReturnType<typeof vi.fn> }
    await waitFor(() => expect(desktop.reportFocusState).toHaveBeenLastCalledWith({ active: true, running: true }))
    expect(state.focus.get).toHaveBeenCalledWith(LIST)

    const requestPause = desktop.onPauseRequest.mock.calls.at(-1)![0] as () => Promise<void>
    await requestPause()

    const sent = state.focus.send.mock.calls.map(([entry]) => (entry as QueuedAction).action)
    expect(sent).toEqual([expect.objectContaining({ type: 'pause', device_id: deviceId() })])
  })

  it('SYNC-08 on the home, still tells the desktop the task counts', async () => {
    installDesktopApi('darwin')
    state.focus.get.mockResolvedValue(focusState(true))
    renderWithProviders(<AppLayout />, { route: '/' })

    const desktop = window.trackzyn as unknown as { reportFocusState: ReturnType<typeof vi.fn> }
    await waitFor(() => expect(desktop.reportFocusState).toHaveBeenLastCalledWith({ active: true, running: true }))
    expect(state.focus.get).toHaveBeenCalledWith(undefined)
  })

  const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
  const countingElsewhere = (): FocusState => ({ ...focusState(true), task: null, today: { pending: 0, done: 0, estimate_minutes: 0, tasks: [] } })

  it('SYNC-08 on the board of another list, still tells the desktop the task counts on its own list', async () => {
    installDesktopApi('darwin')
    state.focus.get.mockResolvedValue(countingElsewhere())
    renderWithProviders(<AppLayout />, { route: `/lists/${OTHER}`, path: '/lists/:listId' })

    const desktop = window.trackzyn as unknown as { reportFocusState: ReturnType<typeof vi.fn> }
    await waitFor(() => expect(desktop.reportFocusState).toHaveBeenLastCalledWith({ active: true, running: true }))
    expect(state.focus.get).toHaveBeenCalledWith(OTHER)
    expect(state.focus.get).not.toHaveBeenCalledWith(LIST)
  })

  it('SYNC-09 on the board of another list, closing the tab still shows the browser alert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    state.focus.get.mockResolvedValue(countingElsewhere())
    renderWithProviders(<AppLayout />, { route: `/lists/${OTHER}`, path: '/lists/:listId' })
    await waitFor(() => expect(state.focus.get).toHaveBeenCalledWith(OTHER))

    await waitFor(() => {
      const leaving = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(leaving)
      expect(leaving.defaultPrevented).toBe(true)
    })
  })

  it('SYNC-09 on the board, closing the tab shows the browser alert and asks the pause on leaving', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    state.focus.get.mockResolvedValue(focusState(true))
    renderWithProviders(<AppLayout />, { route: `/lists/${LIST}`, path: '/lists/:listId' })
    await waitFor(() => expect(state.focus.get).toHaveBeenCalledWith(LIST))

    await waitFor(() => {
      const leaving = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(leaving)
      expect(leaving.defaultPrevented).toBe(true)
    })
    window.dispatchEvent(new Event('pagehide'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/focus/pause')
    expect(init).toMatchObject({ method: 'POST', keepalive: true })
    expect(JSON.parse(init.body as string)).toMatchObject({ device_id: deviceId() })
  })
})

describe('app layout focus guard with the widget (WIDGET-03, Edge Case)', () => {
  const reported = () => (window.trackzyn as unknown as { reportFocusState: ReturnType<typeof vi.fn> }).reportFocusState

  it('on a board with pending tasks and no session, reports no focus, so minimizing does not open the widget', async () => {
    installDesktopApi('darwin')
    state.focus.get.mockResolvedValue(focusState(false))
    renderWithProviders(<AppLayout />, { route: `/lists/${LIST}`, path: '/lists/:listId' })

    await waitFor(() => expect(state.focus.get).toHaveBeenCalledWith(LIST))
    await act(async () => {
      await Promise.resolve()
    })
    expect(reported().mock.calls.length).toBeGreaterThan(0)
    for (const call of reported().mock.calls) expect(call).toEqual([{ active: false, running: false }])
  })

  it('on the focus screen with a paused task, reports the focus as active and not counting', async () => {
    installDesktopApi('darwin')
    state.focus.get.mockResolvedValue(focusState(false))
    renderWithProviders(<AppLayout />, { route: `/focus/${LIST}`, path: '/focus/:listId' })

    await waitFor(() => expect(reported()).toHaveBeenLastCalledWith({ active: true, running: false }))
  })

  it('on a board, a session of another device is not a task in focus here', async () => {
    installDesktopApi('darwin')
    const elsewhere = focusState(true)
    elsewhere.session!.device_id = 'other-device'
    state.focus.get.mockResolvedValue(elsewhere)
    renderWithProviders(<AppLayout />, { route: `/lists/${LIST}`, path: '/lists/:listId' })

    await waitFor(() => expect(state.focus.get).toHaveBeenCalledWith(LIST))
    await act(async () => {
      await Promise.resolve()
    })
    for (const call of reported().mock.calls) expect(call).toEqual([{ active: false, running: false }])
  })

  it('on a board, an own break is a focus in progress', async () => {
    installDesktopApi('darwin')
    const onBreak = focusState(true)
    onBreak.session = { ...onBreak.session!, kind: 'break', task_id: null }
    state.focus.get.mockResolvedValue(onBreak)
    renderWithProviders(<AppLayout />, { route: `/lists/${LIST}`, path: '/lists/:listId' })

    await waitFor(() => expect(reported()).toHaveBeenLastCalledWith({ active: true, running: false }))
  })
})

describe('app layout and the widget changing the focus (WIDGET-22)', () => {
  it('a change from the widget reads the focus and the lists again, wherever the main window is', async () => {
    installDesktopApi('darwin')
    state.focus.get.mockResolvedValue(focusState(true))
    const { queryClient } = renderWithProviders(<AppLayout />, { route: '/' })
    await waitFor(() => expect(state.focus.get).toHaveBeenCalledTimes(1))
    const desktop = window.trackzyn as unknown as { onFocusChanged: ReturnType<typeof vi.fn> }
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const changed = desktop.onFocusChanged.mock.calls.at(-1)![0] as () => void
    act(() => changed())

    await waitFor(() => expect(state.focus.get).toHaveBeenCalledTimes(2))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['focus'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lists'] })
  })
})

describe('app layout on the focus page (SYNC-10)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares the focus read of the page and sends one heartbeat per minute', async () => {
    vi.useFakeTimers()
    state.canWrite = true
    state.focus.get.mockResolvedValue(focusState(true))
    state.focus.heartbeat.mockResolvedValue(focusState(true))
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/focus/:listId" element={<FocusPage />} />
        </Route>
      </Routes>,
      { route: `/focus/${LIST}` },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByRole('timer')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(state.focus.heartbeat).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(state.focus.heartbeat).toHaveBeenCalledTimes(2)

    expect(state.focus.get).toHaveBeenCalledWith(LIST)
    expect(state.focus.get).not.toHaveBeenCalledWith(undefined)
    expect(state.focus.send).not.toHaveBeenCalled()
  })
})

describe('app layout stale session (SYNC-11)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opening on the home shows how long the session counted and waits for Keep or Cut at the last signal', async () => {
    vi.useFakeTimers()
    const stale = { ...focusState(true), stale: { session_id: 'session-1', last_seen_at: new Date(Date.now() - 754_000).toISOString(), seconds: 754 } }
    state.canWrite = true
    state.focus.get.mockResolvedValue(stale)
    state.focus.heartbeat.mockResolvedValue({ ...stale, stale: null })
    state.focus.send.mockResolvedValue({ ...stale, stale: null })
    renderWithProviders(<AppLayout />, { route: '/' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('The task kept counting for 12min since the last signal.')

    // It stays until the user picks: no signal or poll resolves it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(state.focus.heartbeat).not.toHaveBeenCalled()
    expect(state.focus.send).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cut at the last signal' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const sent = state.focus.send.mock.calls.map(([entry]) => (entry as QueuedAction).action)
    expect(sent).toEqual([expect.objectContaining({ type: 'recover', decision: 'cut', device_id: deviceId() })])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
