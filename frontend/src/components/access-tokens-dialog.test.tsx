import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { AccessTokensDialog } from '@/components/access-tokens-dialog'
import { accessTokens } from '@/lib/api'
import { i18n, renderWithProviders, t } from '@/test/utils'
import type { AccessToken } from '@/types'

vi.mock('@/lib/api', () => ({
  accessTokens: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}))

const active: AccessToken = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'n8n flow',
  workspace_id: 'ws-1',
  workspace_name: 'Synthetic workspace',
  scopes: ['lists:read', 'tasks:create'],
  display_hint: 'tkz_…a1b2',
  created_at: '2026-10-01T10:00:00Z',
  expires_at: '2026-12-30T10:00:00Z',
  last_used_at: '2026-10-20T15:30:00Z',
  revoked_at: null,
  status: 'active',
}
const unused: AccessToken = {
  ...active,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'CI script',
  display_hint: 'tkz_…c3d4',
  scopes: ['tasks:read'],
  last_used_at: null,
}
const revoked: AccessToken = {
  ...active,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Old leak',
  revoked_at: '2026-10-10T10:00:00Z',
  status: 'revoked',
}
const expired: AccessToken = { ...active, id: '44444444-4444-4444-8444-444444444444', name: 'Past due', status: 'expired' }

const when = (iso: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement

function renderDialog() {
  const onClose = vi.fn()
  return { ...renderWithProviders(<AccessTokensDialog open onClose={onClose} />), onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(accessTokens.list).mockResolvedValue([active, unused])
  vi.mocked(accessTokens.revoke).mockResolvedValue(undefined)
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('AccessTokensDialog list', () => {
  it('shows the name, workspace, scopes, hint, expiry, last use and state of each token', async () => {
    renderDialog()

    expect(await screen.findByText('n8n flow')).toBeInTheDocument()
    const first = within(row('n8n flow'))
    expect(first.getByText('Synthetic workspace')).toBeInTheDocument()
    expect(first.getByText('lists:read')).toBeInTheDocument()
    expect(first.getByText('tasks:create')).toBeInTheDocument()
    expect(first.getByText('tkz_…a1b2')).toBeInTheDocument()
    expect(first.getByText(`Expires: ${when(active.expires_at)}`)).toBeInTheDocument()
    expect(first.getByText(`Last used: ${when(active.last_used_at!)}`)).toBeInTheDocument()
    expect(first.getByText('Active')).toBeInTheDocument()

    expect(within(row('CI script')).getByText('Last used: Never')).toBeInTheDocument()
  })

  it('shows the revoked and expired states, without the revoke action', async () => {
    vi.mocked(accessTokens.list).mockResolvedValue([revoked, expired])
    renderDialog()

    await screen.findByText('Old leak')
    expect(within(row('Old leak')).getByText('Revoked')).toBeInTheDocument()
    expect(within(row('Past due')).getByText('Expired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Revoke/ })).not.toBeInTheDocument()
  })

  it('shows the empty state with the action to generate a token', async () => {
    vi.mocked(accessTokens.list).mockResolvedValue([])
    renderDialog()

    expect(await screen.findByText('You have no access tokens yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate token' })).toBeInTheDocument()
  })

  it('offers to generate a token next to a filled list too', async () => {
    renderDialog()

    await screen.findByText('n8n flow')
    expect(screen.getByRole('button', { name: 'Generate token' })).toBeInTheDocument()
  })

  it('shows the message of a failed load and retries', async () => {
    vi.mocked(accessTokens.list).mockRejectedValueOnce({ response: { data: { detail: 'Service unavailable' } } })
    const { user } = renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')

    await user.click(screen.getByRole('button', { name: t('common.retry') }))

    expect(await screen.findByText('n8n flow')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falls back to its own message when the network gives no detail', async () => {
    vi.mocked(accessTokens.list).mockRejectedValue(new Error('Network Error'))
    renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your tokens.')
  })
})

describe('AccessTokensDialog revocation', () => {
  it('asks for confirmation and then shows the token as revoked', async () => {
    const { user } = renderDialog()
    await screen.findByText('n8n flow')

    await user.click(screen.getByRole('button', { name: 'Revoke n8n flow' }))

    const confirm = await screen.findByRole('dialog', { name: 'Revoke token' })
    expect(confirm).toHaveTextContent('n8n flow')
    expect(accessTokens.revoke).not.toHaveBeenCalled()

    await user.click(within(confirm).getByRole('button', { name: t('common.delete') }))

    await waitFor(() => expect(within(row('n8n flow')).getByText('Revoked')).toBeInTheDocument())
    expect(accessTokens.revoke).toHaveBeenCalledWith(active.id)
    expect(within(row('n8n flow')).queryByRole('button', { name: /^Revoke/ })).not.toBeInTheDocument()
    expect(within(row('CI script')).getByText('Active')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Revoke token' })).not.toBeInTheDocument())
  })

  it('keeps the token when the confirmation is cancelled', async () => {
    const { user } = renderDialog()
    await screen.findByText('n8n flow')

    await user.click(screen.getByRole('button', { name: 'Revoke n8n flow' }))
    const confirm = await screen.findByRole('dialog', { name: 'Revoke token' })
    await user.click(within(confirm).getByRole('button', { name: t('common.cancel') }))

    expect(accessTokens.revoke).not.toHaveBeenCalled()
    expect(within(row('n8n flow')).getByText('Active')).toBeInTheDocument()
  })

  it('shows the message of a failed revocation and keeps the token active', async () => {
    vi.mocked(accessTokens.revoke).mockRejectedValue({ response: { data: { detail: 'Service unavailable' } } })
    const { user } = renderDialog()
    await screen.findByText('n8n flow')

    await user.click(screen.getByRole('button', { name: 'Revoke n8n flow' }))
    const confirm = await screen.findByRole('dialog', { name: 'Revoke token' })
    await user.click(within(confirm).getByRole('button', { name: t('common.delete') }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
    expect(within(row('n8n flow')).getByText('Active')).toBeInTheDocument()
  })
})

describe('AccessTokensDialog in Portuguese', () => {
  it('shows the list in the interface language', async () => {
    await i18n.changeLanguage('pt-BR')
    vi.mocked(accessTokens.list).mockResolvedValue([active, revoked])
    renderDialog()

    expect(await screen.findByRole('dialog', { name: 'Tokens de acesso' })).toBeInTheDocument()
    await screen.findByText('n8n flow')
    expect(screen.getByRole('button', { name: 'Gerar token' })).toBeInTheDocument()
    expect(within(row('n8n flow')).getByText('Ativo')).toBeInTheDocument()
    expect(within(row('Old leak')).getByText('Revogado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revogar n8n flow' })).toBeInTheDocument()
  })
})
