import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import App from '@/App'
import { focus, lists } from '@/lib/api'
import type { FocusState, ListCard } from '@/types'

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  auth: {
    me: vi.fn(async () => ({
      id: 'user-1',
      email: 'ana@example.com',
      is_2fa_enabled: true,
      is_superuser: false,
      preferences: { onboarding_completed: true, display_name: 'Ana' },
    })),
    oidcConfig: vi.fn(async () => ({ enabled: false })),
    listPasskeys: vi.fn(async () => []),
  },
  workspaces: { list: vi.fn(async () => [{ id: 'ws', name: 'Synthetic workspace', role: 'owner', timezone: null }]), create: vi.fn() },
  admin: {
    defaultColors: vi.fn(async () => ({ light: null, dark: null })),
    numberFormat: vi.fn(async () => ({ format: 'auto' })),
    registrationStatus: vi.fn(async () => ({ enabled: false })),
  },
  info: { get: vi.fn(async () => ({ features: {} })) },
  lists: { list: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
}))

const LIST = '11111111-1111-4111-8111-111111111111'
const task = { id: 'task-a', title: 'DEV-1725', estimate_minutes: 60, spent_seconds: 600, awaiting_extend: false }

/** The task was paused before the app closed: no session is open. */
function paused(listId: string | undefined): FocusState {
  const today = listId
    ? { pending: 1, done: 0, estimate_minutes: 60, tasks: [{ ...task, position: 0 }] }
    : { pending: 0, done: 0, estimate_minutes: 0, tasks: [] }
  return { server_now: new Date().toISOString(), session: null, task: listId ? task : null, today, stale: null }
}

const week: ListCard = {
  id: LIST,
  workspace_id: 'ws',
  name: 'Week',
  color: 3,
  position: 0,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-24T10:00:00Z',
  pending_count: 1,
  preview: [],
}

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('Reopening the app (SYNC-12)', () => {
  it('starts on the home with a paused task, without reaching the focus page or its actions', async () => {
    localStorage.setItem('token', 'token-123')
    vi.mocked(lists.list).mockResolvedValue({ timezone: 'America/Sao_Paulo', lists: [week] })
    vi.mocked(focus.get).mockImplementation(async (listId) => paused(listId))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Your lists' })).toBeInTheDocument()
    expect(await screen.findByText('Week')).toBeInTheDocument()
    await waitFor(() => expect(focus.get).toHaveBeenCalled())
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
    // Only the app's guard reads the focus, with no list; nothing reads the list's focus or acts on it.
    expect(focus.get).not.toHaveBeenCalledWith(LIST)
    for (const call of vi.mocked(focus.get).mock.calls) expect(call).toEqual([undefined])
    expect(focus.send).not.toHaveBeenCalled()
  })
})

describe('The focus widget route (WIDGET-06)', () => {
  it('/widget shows the widget alone, without the sidebar or the app guard', async () => {
    localStorage.setItem('token', 'token-123')
    vi.mocked(focus.get).mockImplementation(async (listId) => paused(listId))
    window.history.replaceState(null, '', '/widget')

    render(<App />)

    expect(await screen.findByRole('group', { name: 'Focus widget' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your lists' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/widget')
  })

  it('/widget without a session goes to the login', async () => {
    localStorage.removeItem('token')
    window.history.replaceState(null, '', '/widget')

    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(screen.queryByRole('group', { name: 'Focus widget' })).not.toBeInTheDocument()
  })
})
