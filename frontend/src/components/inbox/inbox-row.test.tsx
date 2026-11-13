import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { InboxRow } from '@/components/inbox/inbox-row'
import { inbox, lists } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { InboxItem, ListCard } from '@/types'

vi.mock('@/lib/api', () => ({
  inbox: { list: vi.fn(), update: vi.fn(), send: vi.fn() },
  lists: { list: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
const workspace = vi.hoisted(() => ({ canWrite: true }))
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => workspace }))

const TZ = 'America/Sao_Paulo'
const ADSET = '11111111-1111-4111-8111-111111111111'
const FRETE = '22222222-2222-4222-8222-222222222222'

function list(id: string, name: string, extra: Partial<ListCard> = {}): ListCard {
  return {
    id,
    workspace_id: 'w',
    name,
    color: 1,
    position: 0,
    is_archived: false,
    created_by_user_id: null,
    created_at: '2026-11-01T00:00:00Z',
    pending_count: 0,
    preview: [],
    ...extra,
  }
}

const base: InboxItem = {
  id: 'item-1',
  text: 'DEV-1701 sobreposição',
  source: 'app',
  created_via: null,
  list_id: null,
  estimate_minutes: null,
  draft: null,
  discarded_at: null,
  created_at: '2026-11-13T12:00:00Z',
}

/** The item as the server keeps it: a send refused for an archived list clears its list (QUICK-06). */
let stored: InboxItem
const onDiscard = vi.fn()

function Harness() {
  const { data } = useQuery({ queryKey: ['inbox', 'current'], queryFn: () => inbox.list('current') })
  const location = useLocation()
  return (
    <>
      <ul>
        {data?.items.map((item) => (
          <InboxRow key={item.id} item={item} timeZone={TZ} onDiscard={onDiscard} />
        ))}
      </ul>
      <output data-testid="where">{location.search}</output>
    </>
  )
}

async function renderRow(item: Partial<InboxItem> = {}) {
  stored = { ...base, ...item }
  const rendered = renderWithProviders(<Harness />, { route: '/inbox' })
  await screen.findByRole('link', { name: stored.text })
  return rendered
}

beforeEach(async () => {
  vi.clearAllMocks()
  workspace.canWrite = true
  await i18n.changeLanguage('pt-BR')
  vi.mocked(inbox.list).mockImplementation(async () => ({ timezone: TZ, items: [stored] }))
  vi.mocked(lists.list).mockResolvedValue({ timezone: TZ, lists: [list(ADSET, 'Work (ADSET)'), list(FRETE, 'Work (FRETE)')] })
  vi.mocked(inbox.update).mockImplementation(async (_id, changes) => {
    stored = { ...stored, ...changes } as InboxItem
    return stored
  })
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

const listSelect = () => screen.getByRole('combobox', { name: `Lista de ${stored.text}` })
const estimateField = () => screen.getByRole('textbox', { name: `Estimativa de ${stored.text}` })
const where = () => screen.getByTestId('where')

describe('InboxRow', () => {
  it('QUICK-01 the list select offers the active lists the user writes in', async () => {
    vi.mocked(lists.list).mockResolvedValue({
      timezone: TZ,
      lists: [list(ADSET, 'Work (ADSET)'), list('33333333-3333-4333-8333-333333333333', 'Antiga', { is_archived: true }), list(FRETE, 'Work (FRETE)')],
    })
    const { user } = await renderRow()

    await waitFor(() => expect(lists.list).toHaveBeenCalledWith({ archived: false }))
    expect(listSelect()).toHaveTextContent('Lista')
    expect(estimateField()).toHaveAttribute('placeholder', 'Est.')
    expect(screen.getByRole('button', { name: `Descartar ${stored.text}` })).toBeInTheDocument()
    await user.click(listSelect())
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Work (ADSET)', 'Work (FRETE)'])
  })

  it('QUICK-01 a viewer, who writes in no list, gets no list to pick', async () => {
    workspace.canWrite = false
    const { user } = await renderRow()

    await user.click(listSelect())

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(lists.list).not.toHaveBeenCalled()
  })

  it('QUICK-03 hides Enviar while the item has no list', async () => {
    await renderRow()

    expect(screen.queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument()
  })

  it('QUICK-02 picking a list keeps it on the item and shows Enviar', async () => {
    const { user } = await renderRow()

    await user.click(listSelect())
    await user.click(await screen.findByRole('option', { name: 'Work (ADSET)' }))

    expect(inbox.update).toHaveBeenCalledWith('item-1', { list_id: ADSET })
    expect(listSelect()).toHaveTextContent('Work (ADSET)')
    expect(await screen.findByRole('button', { name: 'Enviar para Work (ADSET) › Backlog' })).toHaveTextContent('Enviar')
  })

  it('QUICK-02 a typed estimate is kept on the item as minutes', async () => {
    const { user } = await renderRow()

    await user.type(estimateField(), '0130')
    await user.tab()

    expect(inbox.update).toHaveBeenCalledWith('item-1', { estimate_minutes: 90 })
    expect(estimateField()).toHaveValue('01:30')
    expect(estimateField()).not.toHaveAttribute('aria-invalid')
  })

  it('QUICK-05 the estimate 25:00 is marked invalid and not kept', async () => {
    const { user } = await renderRow()

    await user.type(estimateField(), '2500')
    await user.tab()

    expect(estimateField()).toHaveValue('25:00')
    expect(estimateField()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Use de 00:01 a 24:00')
    expect(inbox.update).not.toHaveBeenCalled()
  })

  it('QUICK-07 a text of 256 characters does not show Enviar, even with a list', async () => {
    await renderRow({ text: 'a'.repeat(256), list_id: ADSET })
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))

    expect(screen.queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument()
  })

  it('QUICK-07 a text of 255 characters shows Enviar with a list', async () => {
    await renderRow({ text: 'a'.repeat(255), list_id: ADSET })

    expect(await screen.findByRole('button', { name: 'Enviar para Work (ADSET) › Backlog' })).toBeInTheDocument()
  })

  it('QUICK-04 Enviar sends the item as a task of the chosen list, with the text and the row estimate left to the item', async () => {
    vi.mocked(inbox.send).mockResolvedValue({ tasks: [], group: null })
    const { user } = await renderRow({ list_id: ADSET, estimate_minutes: 90 })

    await user.click(await screen.findByRole('button', { name: 'Enviar para Work (ADSET) › Backlog' }))

    expect(inbox.send).toHaveBeenCalledWith('item-1', { type: 'task', list_id: ADSET })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Enviado para Work (ADSET) › Backlog'))
  })

  it('QUICK-06 a 409 for an archived list shows the toast and clears the select', async () => {
    vi.mocked(inbox.send).mockImplementation(async () => {
      stored = { ...stored, list_id: null }
      throw { response: { status: 409, data: { detail: 'List archived', reason: 'list_archived' } } }
    })
    const { user } = await renderRow({ list_id: ADSET })

    await user.click(await screen.findByRole('button', { name: 'Enviar para Work (ADSET) › Backlog' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A lista foi arquivada. Escolha outra lista.'))
    await waitFor(() => expect(listSelect()).toHaveTextContent('Lista'))
    expect(listSelect()).not.toHaveTextContent('Work (ADSET)')
    expect(screen.queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument()
  })

  it('QUICK-08 a click on the row, through its stretched title, opens the Processar of the item', async () => {
    const { user } = await renderRow()
    const link = screen.getByRole('link', { name: stored.text })

    // The link covers the whole row: its ::after is stretched over it.
    expect(link).toHaveClass('after:absolute', 'after:inset-0')
    await user.click(link)

    expect(where()).toHaveTextContent('?process=item-1')
  })

  it('QUICK-08 a click on the select, the estimate, Enviar or the discard does not open the Processar', async () => {
    vi.mocked(inbox.send).mockReturnValue(new Promise(() => {}))
    const { user } = await renderRow({ list_id: ADSET })
    const row = screen.getByRole('listitem')

    await user.click(listSelect())
    await user.keyboard('{Escape}')
    await user.click(estimateField())
    await user.click(await within(row).findByRole('button', { name: 'Enviar para Work (ADSET) › Backlog' }))
    await user.click(within(row).getByRole('button', { name: `Descartar ${stored.text}` }))

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(inbox.send).toHaveBeenCalledTimes(1)
    expect(where()).toBeEmptyDOMElement()
    // The controls sit above the stretched link.
    for (const control of row.querySelectorAll('[data-row-control]')) expect(control).toHaveClass('relative', 'z-10')
  })

  it('QUICK-09 the border and the title light up over the row and not over its controls', async () => {
    await renderRow()
    const row = screen.getByRole('listitem')
    const link = screen.getByRole('link', { name: stored.text })

    expect(row).toHaveClass('hover:border-primary', 'has-[[data-row-control]:hover]:border-border')
    expect(link).toHaveClass('group-hover/row:underline', 'group-has-[[data-row-control]:hover]/row:no-underline')
  })
})
