import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import App from '@/App'
import { AdminRoute } from '@/components/admin-route'
import { renderWithProviders } from '@/test/utils'

const useAuth = vi.hoisted(() => vi.fn())
// The real context stays for the app's AuthProvider; every reader of `useAuth` gets the test's user.
vi.mock('@/contexts/auth-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/auth-context')>()),
  useAuth,
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  auth: { me: vi.fn(async () => null), oidcConfig: vi.fn(async () => ({ enabled: false })), listPasskeys: vi.fn(async () => []) },
  workspaces: { list: vi.fn(async () => [{ id: 'ws', name: 'Synthetic workspace', role: 'owner', timezone: null }]), create: vi.fn() },
  admin: {
    defaultColors: vi.fn(async () => ({ light: null, dark: null })),
    numberFormat: vi.fn(async () => ({ format: 'auto' })),
    registrationStatus: vi.fn(async () => ({ enabled: false })),
  },
  info: { get: vi.fn(async () => ({ features: {} })) },
  lists: { list: vi.fn(async () => ({ timezone: 'UTC', lists: [] })), move: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  focus: { get: vi.fn(async () => ({ server_now: new Date().toISOString(), session: null, task: null, today: { pending: 0, done: 0, estimate_minutes: 0, tasks: [] }, stale: null })), send: vi.fn(), heartbeat: vi.fn() },
  today: {
    get: vi.fn(async () => ({
      server_now: new Date().toISOString(),
      day: '2026-11-11',
      tomorrow: '2026-11-12',
      timezone: 'UTC',
      now_minute: 600,
      workday: { start: '09:00', end: '18:00' },
      pending: [],
      done: [],
      plan: { saved: false, blocks: [] },
      sessions: [],
      tomorrow_plan_blocks: 0,
      tomorrow_tasks: [],
      week_unscheduled: 0,
    })),
  },
  files: { list: vi.fn(async () => []), settings: vi.fn(async () => ({ max_file_size_mb: 10, allowed_extensions: ['.pdf'] })) },
}))

function renderGuard() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<div>home</div>} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <div>admin settings</div>
          </AdminRoute>
        }
      />
    </Routes>,
    { route: '/admin' },
  )
}

describe('AdminRoute', () => {
  it('renders for a superuser', () => {
    useAuth.mockReturnValue({
      token: 'jwt',
      user: { is_superuser: true },
      isLoading: false,
    })

    renderGuard()

    expect(screen.getByText('admin settings')).toBeInTheDocument()
  })

  it('sends a signed-in non-admin home', () => {
    // Hiding the nav link is not enough: the URL is still typeable.
    useAuth.mockReturnValue({
      token: 'jwt',
      user: { is_superuser: false },
      isLoading: false,
    })

    renderGuard()

    expect(screen.getByText('home')).toBeInTheDocument()
    expect(screen.queryByText('admin settings')).not.toBeInTheDocument()
  })

  it('sends an anonymous visitor home', () => {
    useAuth.mockReturnValue({ token: null, user: null, isLoading: false })

    renderGuard()

    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('treats a missing user object as not an admin', () => {
    useAuth.mockReturnValue({ token: 'jwt', user: null, isLoading: false })

    renderGuard()

    // Assert the redirect landed, not just that the page is absent: a guard
    // that rendered nothing at all would satisfy the weaker check while the
    // user stared at a blank /admin.
    expect(screen.getByText('home')).toBeInTheDocument()
    expect(screen.queryByText('admin settings')).not.toBeInTheDocument()
  })

  it('shows a loading indicator while the session resolves', () => {
    useAuth.mockReturnValue({ token: 'jwt', user: null, isLoading: true })

    const { container } = renderGuard()

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('admin settings')).not.toBeInTheDocument()
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })
})

describe('the app routes', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    localStorage.clear()
  })

  const signedIn = (isSuperuser: boolean) =>
    useAuth.mockReturnValue({
      token: 'jwt',
      user: { id: 'user-1', email: 'ana@example.com', is_superuser: isSuperuser, preferences: { onboarding_completed: true } },
      isLoading: false,
      logout: vi.fn(),
      updateUser: vi.fn(),
    })

  it('files and components redirect a non-admin home', async () => {
    signedIn(false)
    for (const path of ['/files', '/components']) {
      window.history.replaceState(null, '', path)
      const { unmount } = render(<App />)

      // Home is the Hoje dashboard (HOJE-01).
      expect(await screen.findByRole('heading', { name: 'Pending' })).toBeInTheDocument()
      expect(window.location.pathname, path).toBe('/')
      unmount()
    }
  })

  it('opens files and components for a superuser', async () => {
    signedIn(true)
    window.history.replaceState(null, '', '/files')
    const { unmount } = render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Files' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/files')
    unmount()

    window.history.replaceState(null, '', '/components')
    render(<App />)
    // The showcase is a large lazy chunk: give it time to load.
    expect(await screen.findByRole('heading', { level: 1, name: 'Components' }, { timeout: 5000 })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/components')
    // Two app renders and the lazy showcase chunk: the 5 s the chunk alone may take is the default
    // limit of the whole test, which a slow CI runner went past.
  }, 20_000)
})
