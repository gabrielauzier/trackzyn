import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { AxiosError } from 'axios'

import LoginPage from '@/pages/login'
import { i18n, renderWithProviders, t } from '@/test/utils'
import type { TrackzynApi } from '@/lib/platform'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

const authContext = vi.hoisted(() => ({
  login: vi.fn(),
  verify2fa: vi.fn(),
  loginWithToken: vi.fn(),
  token: null as string | null,
}))
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => authContext }))

const api = vi.hoisted(() => ({
  setup: { status: vi.fn() },
  auth: {
    oidcConfig: vi.fn(),
    passkeyAuthenticationOptions: vi.fn(),
    verifyPasskeyAuthentication: vi.fn(),
  },
  admin: { registrationStatus: vi.fn(), defaultColors: vi.fn() },
}))
vi.mock('@/lib/api', () => ({
  setup: api.setup,
  auth: api.auth,
  admin: api.admin,
}))

const webauthn = vi.hoisted(() => ({
  isPasskeySupported: vi.fn(),
  isConditionalPasskeySupported: vi.fn(),
  passkeyFailure: vi.fn(),
  startPasskeyAuthentication: vi.fn(),
  startConditionalPasskeyAuthentication: vi.fn(),
}))
vi.mock('@/lib/webauthn', () => webauthn)

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }))

/** Build the axios-shaped rejection the page branches on. */
function httpError(status?: number): AxiosError {
  return (status === undefined
    ? { isAxiosError: true, response: undefined }
    : { isAxiosError: true, response: { status } }) as AxiosError
}

beforeEach(() => {
  vi.clearAllMocks()
  authContext.token = null
  api.setup.status.mockResolvedValue({ has_users: true })
  api.auth.oidcConfig.mockResolvedValue({
    enabled: false,
    provider_name: 'OIDC',
    local_auth_enabled: true,
  })
  api.admin.registrationStatus.mockResolvedValue({ enabled: true })
  api.admin.defaultColors.mockResolvedValue({ light: null, dark: null })
  webauthn.isPasskeySupported.mockReturnValue(false)
  webauthn.isConditionalPasskeySupported.mockResolvedValue(false)
  webauthn.passkeyFailure.mockReturnValue('unknown')
})

async function renderLogin() {
  const rendered = renderWithProviders(<LoginPage />, { route: '/login' })
  await screen.findByLabelText(t('auth.email'))
  return rendered
}

describe('LoginPage', () => {
  it('renders the credentials form', async () => {
    await renderLogin()

    expect(screen.getByLabelText(t('auth.email'))).toBeInTheDocument()
    expect(screen.getByLabelText(t('auth.password'))).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('auth.login') }),
    ).toBeInTheDocument()
  })

  it('signs in and lands on the dashboard', async () => {
    authContext.login.mockResolvedValue({ requires_2fa: false })
    const { user } = await renderLogin()

    await user.type(screen.getByLabelText(t('auth.email')), 'tassio@example.com')
    await user.type(screen.getByLabelText(t('auth.password')), 'secret')
    await user.click(screen.getByRole('button', { name: t('auth.login') }))

    await waitFor(() =>
      expect(authContext.login).toHaveBeenCalledWith(
        'tassio@example.com',
        'secret',
      ),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })

  it('asks for the second factor instead of navigating when 2FA is on', async () => {
    authContext.login.mockResolvedValue({
      requires_2fa: true,
      temp_token: 'temp',
      available_methods: ['totp'],
    })
    const { user } = await renderLogin()

    await user.type(screen.getByLabelText(t('auth.email')), 'tassio@example.com')
    await user.type(screen.getByLabelText(t('auth.password')), 'secret')
    await user.click(screen.getByRole('button', { name: t('auth.login') }))

    expect(await screen.findByText(t('auth.twoFactorTitle'))).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalledWith('/')
  })

  it('tells the user their credentials were rejected', async () => {
    authContext.login.mockRejectedValue(httpError(401))
    const { user } = await renderLogin()

    await user.type(screen.getByLabelText(t('auth.email')), 'a@b.com')
    await user.type(screen.getByLabelText(t('auth.password')), 'wrong')
    await user.click(screen.getByRole('button', { name: t('auth.login') }))

    expect(
      await screen.findByText(t('auth.invalidCredentials')),
    ).toBeInTheDocument()
  })

  it('distinguishes an outage from a wrong password', async () => {
    // Issue #318: collapsing every failure into "invalid credentials" made a
    // stopped backend look like the user's own mistake.
    authContext.login.mockRejectedValue(httpError())
    const { user } = await renderLogin()

    await user.type(screen.getByLabelText(t('auth.email')), 'a@b.com')
    await user.type(screen.getByLabelText(t('auth.password')), 'right')
    await user.click(screen.getByRole('button', { name: t('auth.login') }))

    expect(await screen.findByText(t('auth.serverError'))).toBeInTheDocument()
    expect(
      screen.queryByText(t('auth.invalidCredentials')),
    ).not.toBeInTheDocument()
  })

  it('reports a 5xx as an outage too', async () => {
    authContext.login.mockRejectedValue(httpError(502))
    const { user } = await renderLogin()

    await user.type(screen.getByLabelText(t('auth.email')), 'a@b.com')
    await user.type(screen.getByLabelText(t('auth.password')), 'right')
    await user.click(screen.getByRole('button', { name: t('auth.login') }))

    expect(await screen.findByText(t('auth.serverError'))).toBeInTheDocument()
  })

  it('names rate limiting rather than blaming the password', async () => {
    authContext.login.mockRejectedValue(httpError(429))
    const { user } = await renderLogin()

    await user.type(screen.getByLabelText(t('auth.email')), 'a@b.com')
    await user.type(screen.getByLabelText(t('auth.password')), 'right')
    await user.click(screen.getByRole('button', { name: t('auth.login') }))

    expect(await screen.findByText(t('auth.tooManyAttempts'))).toBeInTheDocument()
  })

  it('sends an already-signed-in visitor away from the login screen', async () => {
    authContext.token = 'jwt'

    renderWithProviders(<LoginPage />, { route: '/login' })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/', { replace: true }),
    )
  })

  it('redirects a fresh install to the setup wizard', async () => {
    // No users yet: sending someone to a login form they cannot pass is a
    // dead end.
    api.setup.status.mockResolvedValue({ has_users: false })

    renderWithProviders(<LoginPage />, { route: '/login' })

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/setup', { replace: true }),
    )
  })

  it('offers registration when the server allows it', async () => {
    await renderLogin()

    expect(
      await screen.findByRole('link', { name: t('auth.register') }),
    ).toBeInTheDocument()
  })

  it('does not spend the challenge when the conditional ceremony is aborted', async () => {
    // The challenge is one-shot on the server (Redis `getdel`). Verifying one
    // the user walked away from burns it, and the next attempt gets nothing.
    webauthn.isPasskeySupported.mockReturnValue(true)
    webauthn.isConditionalPasskeySupported.mockResolvedValue(true)
    api.auth.passkeyAuthenticationOptions.mockResolvedValue({
      options: {},
      challenge_id: 'challenge-1',
    })
    let handBackCredential: (credential: unknown) => void = () => {}
    webauthn.startConditionalPasskeyAuthentication.mockReturnValue(
      new Promise((resolve) => {
        handBackCredential = resolve
      }),
    )

    const { unmount } = renderWithProviders(<LoginPage />, { route: '/login' })
    await waitFor(() =>
      expect(webauthn.startConditionalPasskeyAuthentication).toHaveBeenCalled(),
    )

    // Leaving the page aborts the ceremony, but the pending browser promise
    // can still settle afterwards.
    unmount()
    handBackCredential({ id: 'credential' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(api.auth.verifyPasskeyAuthentication).not.toHaveBeenCalled()
  })

  it('hides passkey controls when running on desktop', async () => {
    // The browser could do passkeys; the desktop origin (app://trackzyn) cannot match the server's RP ID.
    webauthn.isPasskeySupported.mockReturnValue(true)
    webauthn.isConditionalPasskeySupported.mockResolvedValue(true)
    const desktopApi: TrackzynApi = {
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
    }
    Object.defineProperty(window, 'trackzyn', { value: desktopApi, configurable: true })
    try {
      authContext.login.mockResolvedValue({
        requires_2fa: true,
        temp_token: 'temp',
        available_methods: ['passkey', 'totp'],
      })
      const { user } = await renderLogin()

      expect(screen.queryByRole('button', { name: t('auth.loginWithPasskey') })).not.toBeInTheDocument()
      await user.type(screen.getByLabelText(t('auth.email')), 'tassio@example.com')
      await user.type(screen.getByLabelText(t('auth.password')), 'secret')
      await user.click(screen.getByRole('button', { name: t('auth.login') }))

      expect(await screen.findByLabelText(t('auth.twoFactor'))).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: t('auth.passkeyMethod') })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: t('auth.usePasskeySecondFactor') })).not.toBeInTheDocument()
      expect(api.auth.passkeyAuthenticationOptions).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(window, 'trackzyn')
    }
  })

  it('survives the optional config calls failing', async () => {
    // A reverse proxy that blocks /api/admin must not blank the login form.
    api.admin.registrationStatus.mockRejectedValue(new Error('403'))
    api.admin.defaultColors.mockRejectedValue(new Error('403'))
    api.auth.oidcConfig.mockRejectedValue(new Error('500'))

    await renderLogin()

    expect(screen.getByLabelText(t('auth.email'))).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('auth.login') }),
    ).toBeInTheDocument()
  })
})

describe('LoginPage SSO', () => {
  function installDesktopApi(serverUrl: string | null) {
    const desktopApi: TrackzynApi = {
      isDesktop: true,
      platform: 'darwin',
      appVersion: '0.1.0',
      getServerUrl: vi.fn(async () => serverUrl),
      setServerUrl: vi.fn(),
      openExternal: vi.fn(async () => {}),
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
    }
    Object.defineProperty(window, 'trackzyn', { value: desktopApi, configurable: true })
    return desktopApi
  }

  function stubLocation() {
    const original = window.location
    const stub = { ...original, href: 'app://trackzyn/login' } as Location
    Object.defineProperty(window, 'location', { value: stub, configurable: true, writable: true })
    return { stub, restore: () => Object.defineProperty(window, 'location', { value: original, configurable: true, writable: true }) }
  }

  beforeEach(() => {
    api.auth.oidcConfig.mockResolvedValue({ enabled: true, provider_name: 'Pocket ID', local_auth_enabled: true })
  })

  it('starts SSO in the system browser on desktop', async () => {
    const desktopApi = installDesktopApi('https://srv.example.com')
    const location = stubLocation()
    try {
      const { user } = await renderLogin()
      await user.click(await screen.findByRole('button', { name: t('auth.loginWithProvider', { provider: 'Pocket ID' }) }))

      await waitFor(() => expect(desktopApi.startSso).toHaveBeenCalledTimes(1))
      expect(location.stub.href).toBe('app://trackzyn/login')
    } finally {
      location.restore()
      Reflect.deleteProperty(window, 'trackzyn')
    }
  })

  it('web SSO button still goes to /api/auth/oidc/login', async () => {
    const location = stubLocation()
    try {
      const { user } = await renderLogin()
      await user.click(await screen.findByRole('button', { name: t('auth.loginWithProvider', { provider: 'Pocket ID' }) }))

      expect(location.stub.href).toBe('/api/auth/oidc/login')
    } finally {
      location.restore()
    }
  })

  it('shows Sign-in did not complete when sso=failed', async () => {
    for (const [language, message] of [
      ['en', 'Sign-in did not complete'],
      ['pt-BR', 'O login não foi concluído'],
    ] as const) {
      await i18n.changeLanguage(language)
      try {
        const { unmount } = renderWithProviders(<LoginPage />, { route: '/login?sso=failed' })
        expect(await screen.findByRole('alert')).toHaveTextContent(message)
        unmount()
      } finally {
        await i18n.changeLanguage('en')
      }
    }
  })
})
