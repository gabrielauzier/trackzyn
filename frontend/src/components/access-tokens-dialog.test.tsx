import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { AccessTokensDialog } from '@/components/access-tokens-dialog'
import { accessTokens } from '@/lib/api'
import { i18n, renderWithProviders, t } from '@/test/utils'
import type { AccessToken } from '@/types'

vi.mock('@/lib/api', () => ({
  accessTokens: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}))

const workspace = { id: 'ws-1', name: 'Synthetic workspace', role: 'owner' }
const otherWorkspace = { id: 'ws-2', name: 'Second workspace', role: 'editor' }

vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: workspace, workspaces: [workspace, otherWorkspace] }),
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

async function openForm(user: ReturnType<typeof renderDialog>['user']) {
  await screen.findByRole('button', { name: 'Generate token' })
  await waitFor(() => expect(screen.queryByText(t('common.loading'))).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Generate token' }))
  await screen.findByLabelText('Name')
}

const serverError = (detail: string) => ({ response: { data: { detail } } })

describe('AccessTokensDialog form', () => {
  beforeEach(() => {
    vi.mocked(accessTokens.create).mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      token: 'tkz_synthetic',
      expires_at: '2027-01-30T10:00:00Z',
    })
  })

  it('opens from the empty state too', async () => {
    vi.mocked(accessTokens.list).mockResolvedValue([])
    const { user } = renderDialog()

    await screen.findByText('You have no access tokens yet.')
    await user.click(screen.getByRole('button', { name: 'Generate token' }))

    expect(await screen.findByLabelText('Name')).toBeInTheDocument()
  })

  it('starts on the current workspace, with lists:read, tasks:create and 90 days', async () => {
    const { user } = renderDialog()
    await openForm(user)

    expect(screen.getByRole('combobox', { name: 'Workspace' })).toHaveTextContent('Synthetic workspace')
    expect(screen.getByRole('combobox', { name: 'Expires in' })).toHaveTextContent('90 days')
    const checks = Object.fromEntries(
      ['lists:read', 'tasks:read', 'tasks:create', 'tasks:write', 'tasks:delete'].map((scope) => [
        scope,
        screen.getByRole('checkbox', { name: new RegExp(`^${scope}`) }).getAttribute('aria-checked'),
      ]),
    )
    expect(checks).toEqual({
      'lists:read': 'true',
      'tasks:read': 'false',
      'tasks:create': 'true',
      'tasks:write': 'false',
      'tasks:delete': 'false',
    })
  })

  it('warns that the token name is visible to the workspace members', async () => {
    const { user } = renderDialog()
    await openForm(user)

    expect(screen.getByText("The token's name is visible to workspace members on the tasks it creates.")).toBeInTheDocument()
  })

  it('sends the defaults as they are', async () => {
    const { user } = renderDialog()
    await openForm(user)

    await user.type(screen.getByLabelText('Name'), '  n8n flow  ')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() =>
      expect(accessTokens.create).toHaveBeenCalledWith({
        name: 'n8n flow',
        workspace_id: 'ws-1',
        scopes: ['lists:read', 'tasks:create'],
        expires_in_days: 90,
      }),
    )
  })

  it('sends the workspace, scopes and validity the user picked', async () => {
    const { user } = renderDialog()
    await openForm(user)

    await user.type(screen.getByLabelText('Name'), 'CI script')
    await user.click(screen.getByRole('combobox', { name: 'Workspace' }))
    await user.click(await screen.findByRole('option', { name: 'Second workspace' }))
    await user.click(screen.getByRole('combobox', { name: 'Expires in' }))
    await user.click(await screen.findByRole('option', { name: '365 days' }))
    await user.click(screen.getByRole('checkbox', { name: /^tasks:create/ }))
    await user.click(screen.getByRole('checkbox', { name: /^tasks:delete/ }))
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() =>
      expect(accessTokens.create).toHaveBeenCalledWith({
        name: 'CI script',
        workspace_id: 'ws-2',
        scopes: ['lists:read', 'tasks:delete'],
        expires_in_days: 365,
      }),
    )
  })

  it('offers only the validities the spec allows', async () => {
    const { user } = renderDialog()
    await openForm(user)

    await user.click(screen.getByRole('combobox', { name: 'Expires in' }))

    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['30 days', '90 days', '365 days'])
  })

  it('disables the submit without any scope', async () => {
    const { user } = renderDialog()
    await openForm(user)

    await user.type(screen.getByLabelText('Name'), 'n8n flow')
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()

    await user.click(screen.getByRole('checkbox', { name: /^lists:read/ }))
    await user.click(screen.getByRole('checkbox', { name: /^tasks:create/ }))

    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it('disables the submit without a name', async () => {
    const { user } = renderDialog()
    await openForm(user)

    await user.type(screen.getByLabelText('Name'), '   ')

    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  it.each([
    ['Token name already in use', 'A token with this name already exists.', 'Já existe um token com este nome.'],
    ['Token limit reached', 'You reached the limit of 50 active tokens.', 'Você chegou ao limite de 50 tokens ativos.'],
    ['Read-only role', 'Your role in this workspace is read-only: choose only read scopes.', 'Seu papel neste workspace é só de leitura: escolha apenas escopos de leitura.'],
    ['Workspace not found', 'You are not a member of this workspace.', 'Você não é membro deste workspace.'],
  ])('shows %s in the form, in both languages, and stays open', async (detail, english, portuguese) => {
    vi.mocked(accessTokens.create).mockRejectedValue(serverError(detail))
    const { user } = renderDialog()
    await openForm(user)

    await user.type(screen.getByLabelText('Name'), 'n8n flow')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(english)
    expect(screen.getByLabelText('Name')).toHaveValue('n8n flow')
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()

    await i18n.changeLanguage('pt-BR')
    await user.click(screen.getByRole('button', { name: 'Gerar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(portuguese))
  })

  it('shows any other server message as it came', async () => {
    vi.mocked(accessTokens.create).mockRejectedValue(serverError('Something else'))
    const { user } = renderDialog()
    await openForm(user)

    await user.type(screen.getByLabelText('Name'), 'n8n flow')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something else')
  })

  it('goes back to the list on cancel without creating anything', async () => {
    const { user } = renderDialog()
    await openForm(user)

    await user.click(screen.getByRole('button', { name: t('common.cancel') }))

    expect(await screen.findByText('n8n flow')).toBeInTheDocument()
    expect(accessTokens.create).not.toHaveBeenCalled()
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

  it('shows the form in the interface language', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = renderDialog()

    await screen.findByText('n8n flow')
    await user.click(screen.getByRole('button', { name: 'Gerar token' }))

    expect(await screen.findByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Validade' })).toHaveTextContent('90 dias')
    expect(screen.getByText('O nome do token fica visível aos membros do workspace nas tarefas criadas por ele.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /^tasks:delete Excluir/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerar' })).toBeDisabled()
  })
})
