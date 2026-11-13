import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import InboxPage from '@/pages/inbox'
import { inbox } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { InboxItem } from '@/types'

vi.mock('@/lib/api', () => ({
  inbox: { list: vi.fn(), capture: vi.fn(), discard: vi.fn(), restore: vi.fn(), update: vi.fn(), send: vi.fn() },
  lists: { list: vi.fn(async () => ({ timezone: 'America/Sao_Paulo', lists: [] })) },
}))
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ canWrite: true }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const TZ = 'America/Sao_Paulo'
// 12:00 in São Paulo.
const NOW = new Date('2026-11-13T15:00:00Z')

function item(id: string, text: string, created_at: string, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    text,
    source: 'app',
    created_via: null,
    list_id: null,
    estimate_minutes: null,
    draft: null,
    discarded_at: null,
    created_at,
    ...extra,
  }
}

/** A small server: the current items and the trash, with discard and restore moving items between them. */
const server = { current: [] as InboxItem[], trash: [] as InboxItem[] }

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await i18n.changeLanguage('pt-BR')
  server.current = []
  server.trash = []
  vi.mocked(inbox.list).mockImplementation(async (tab) => ({ timezone: TZ, items: [...server[tab]] }))
  vi.mocked(inbox.discard).mockImplementation(async (id) => {
    const found = server.current.find((it) => it.id === id)!
    server.current = server.current.filter((it) => it.id !== id)
    const discarded = { ...found, discarded_at: NOW.toISOString() }
    server.trash = [discarded, ...server.trash]
    return discarded
  })
  vi.mocked(inbox.restore).mockImplementation(async (id) => {
    const found = server.trash.find((it) => it.id === id)!
    server.trash = server.trash.filter((it) => it.id !== id)
    const restored = { ...found, discarded_at: null }
    server.current = [...server.current, restored].sort((a, b) => a.created_at.localeCompare(b.created_at))
    return restored
  })
})
afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

const rows = () => within(screen.getByRole('list', { name: 'Caixa de entrada' })).getAllByRole('listitem')
const field = () => screen.getByRole('textbox', { name: 'O que está na sua cabeça?' })

describe('InboxPage', () => {
  it('INBOX-02 lists the items oldest first, each with its text, age and origin', async () => {
    server.current = [
      item('a', 'DEV-1701 sobreposição', '2026-11-10T13:00:00Z', { source: 'desktop' }),
      item('b', 'Token de senha', '2026-11-12T20:00:00Z', { source: 'mcp' }),
      item('c', 'Consultar empresas', '2026-11-13T12:12:00Z'),
      item('d', 'Pelo token', '2026-11-13T13:00:00Z', { source: 'api', created_via: 'Agente' }),
    ]
    renderWithProviders(<InboxPage />)

    await waitFor(() => expect(rows()).toHaveLength(4))
    const [first, second, third, fourth] = rows()
    expect(first).toHaveTextContent('DEV-1701 sobreposição')
    expect(first).toHaveTextContent('há 3 dias')
    expect(first).toHaveTextContent('via desktop')
    expect(second).toHaveTextContent('Token de senha')
    expect(second).toHaveTextContent('ontem')
    expect(second).toHaveTextContent('via MCP')
    expect(third).toHaveTextContent('Consultar empresas')
    expect(third).toHaveTextContent('hoje, 09:12')
    expect(third).toHaveTextContent('via Trackzyn')
    expect(fourth).toHaveTextContent('via Agente')
    expect(inbox.list).toHaveBeenCalledWith('current')
    expect(screen.getByRole('tab', { name: 'Atuais · 4' })).toHaveAttribute('aria-selected', 'true')
  })

  it('INBOX-02 tells the age by the day of the workspace: 23:00 of yesterday there is ontem', async () => {
    // 02:00 UTC of the 13th is 23:00 of the 12th in São Paulo.
    server.current = [item('a', 'Tarde da noite', '2026-11-13T02:00:00Z')]
    renderWithProviders(<InboxPage />)

    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveTextContent('ontem')
    expect(rows()[0]).not.toHaveTextContent('hoje')
  })

  it('CAP-01 Enter keeps the text with the origin app, clears the field and the item shows last', async () => {
    server.current = [item('a', 'Mais antigo', '2026-11-12T13:00:00Z')]
    vi.mocked(inbox.capture).mockImplementation(async ({ text }) => {
      const created = item('new', text, NOW.toISOString())
      server.current = [...server.current, created]
      return created
    })
    const { user } = renderWithProviders(<InboxPage />)
    await waitFor(() => expect(rows()).toHaveLength(1))

    await user.type(field(), '  Ligar para o contador  {Enter}')

    expect(inbox.capture).toHaveBeenCalledWith({ text: 'Ligar para o contador', source: 'app' })
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[1]).toHaveTextContent('Ligar para o contador')
    expect(field()).toHaveValue('')
  })

  it('CAP-02 an empty text sends nothing and keeps the focus in the field', async () => {
    const { user } = renderWithProviders(<InboxPage />)

    await user.type(field(), '   {Enter}')

    expect(inbox.capture).not.toHaveBeenCalled()
    expect(field()).toHaveFocus()
  })

  it('CAP-03 501 characters show Até 500 caracteres and keep the text', async () => {
    const { user } = renderWithProviders(<InboxPage />)
    const text = 'a'.repeat(501)

    await user.click(field())
    await user.paste(text)
    await user.keyboard('{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('Até 500 caracteres')
    expect(field()).toHaveValue(text)
    expect(inbox.capture).not.toHaveBeenCalled()
  })

  it('CAP-03 a 422 text_too_long from the server shows Até 500 caracteres and keeps the text', async () => {
    vi.mocked(inbox.capture).mockRejectedValue({ response: { status: 422, data: { detail: 'Text has more than 500 characters', code: 'text_too_long' } } })
    const { user } = renderWithProviders(<InboxPage />)

    await user.type(field(), 'Um texto{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Até 500 caracteres')
    expect(field()).toHaveValue('Um texto')
  })

  it('INBOX-04 discarding takes the item out of Atuais and shows it in Lixeira with the day of the discard', async () => {
    server.current = [item('a', 'Primeiro', '2026-11-12T13:00:00Z'), item('b', 'Segundo', '2026-11-12T14:00:00Z')]
    const { user } = renderWithProviders(<InboxPage />)
    await waitFor(() => expect(rows()).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'Descartar Primeiro' }))

    expect(inbox.discard).toHaveBeenCalledWith('a')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toHaveTextContent('Segundo')
    await user.click(screen.getByRole('tab', { name: 'Lixeira · 1' }))
    const trashed = within(screen.getByRole('list', { name: 'Lixeira · 1' })).getAllByRole('listitem')
    expect(trashed).toHaveLength(1)
    expect(trashed[0]).toHaveTextContent('Primeiro')
    expect(trashed[0]).toHaveTextContent('Descartado em 13 nov')
  })

  it('INBOX-05 restoring brings the item back to Atuais at the place of its arrival', async () => {
    server.current = [item('a', 'Primeiro', '2026-11-11T13:00:00Z'), item('c', 'Terceiro', '2026-11-12T13:00:00Z')]
    server.trash = [item('b', 'Segundo', '2026-11-11T20:00:00Z', { discarded_at: '2026-11-12T10:00:00Z' })]
    const { user } = renderWithProviders(<InboxPage />)
    await user.click(await screen.findByRole('tab', { name: 'Lixeira · 1' }))

    await user.click(await screen.findByRole('button', { name: 'Restaurar Segundo' }))

    expect(inbox.restore).toHaveBeenCalledWith('b')
    await user.click(screen.getByRole('tab', { name: /^Atuais/ }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(rows().map((row) => row.querySelector('p')?.textContent)).toEqual(['Primeiro', 'Segundo', 'Terceiro'])
    expect(screen.getByRole('tab', { name: 'Lixeira · 0' })).toBeInTheDocument()
  })

  it('INBOX-07 an empty Atuais shows Nada na caixa. Capture o que estiver na cabeça.', async () => {
    renderWithProviders(<InboxPage />)

    expect(await screen.findByText('Nada na caixa. Capture o que estiver na cabeça.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Caixa de entrada' })).not.toBeInTheDocument()
  })
})
