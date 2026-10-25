/**
 * macOS desktop hides the native title bar (`titleBarStyle: hiddenInset`), so
 * the app's own header must be draggable while its controls stay clickable.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './app-layout'
import FocusPage from '@/pages/focus'
import { renderWithProviders, t } from '@/test/utils'
import { deviceId } from '@/lib/focus/device-id'
import type { QueuedAction } from '@/lib/focus/queue'
import type { TrackzynApi } from '@/lib/platform'
import type { FocusState } from '@/types'

const state = vi.hoisted(() => ({
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  lists: { list: vi.fn(async () => ({ timezone: 'America/Sao_Paulo', lists: [] })) },
  user: {
    email: 'synthetic@example.com',
    is_2fa_enabled: true,
    is_superuser: false,
    preferences: { onboarding_completed: true },
  },
  workspace: { id: 'synthetic', name: 'Synthetic workspace', role: 'owner' },
  canWrite: false,
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
  focus: state.focus,
  lists: state.lists,
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
