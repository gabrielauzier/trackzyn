import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ProcessAllDialog } from '@/components/inbox/process-dialog'
import { inbox, lists } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { Decision, InboxItem, ListCard } from '@/types'

vi.mock('@/lib/api', () => ({
  inbox: { list: vi.fn(), update: vi.fn(), send: vi.fn(), commit: vi.fn(), discard: vi.fn() },
  lists: { list: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ canWrite: true }) }))

const TZ = 'America/Sao_Paulo'
// Thursday, 13 November 2026, 12:00 in São Paulo.
const NOW = new Date('2026-11-13T15:00:00Z')
const ADSET = '11111111-1111-4111-8111-111111111111'
const FRETE = '22222222-2222-4222-8222-222222222222'

function list(id: string, name: string): ListCard {
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
  }
}

function item(id: string, text: string, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    text,
    source: 'app',
    created_via: null,
    list_id: null,
    estimate_minutes: null,
    draft: null,
    discarded_at: null,
    created_at: `2026-11-1${id.slice(-1)}T12:00:00Z`,
    ...extra,
  }
}

/** Atuais as the server keeps it: a PATCH of the draft changes it. */
let server: InboxItem[] = []

/** The inbox page with Processar tudo open, and a way to open it again after closing. */
function Harness() {
  const { data } = useQuery({ queryKey: ['inbox', 'current'], queryFn: () => inbox.list('current') })
  const [open, setOpen] = useState(true)
  return (
    <>
      {open && data && <ProcessAllDialog items={data.items} timeZone={TZ} onClose={() => setOpen(false)} />}
      <button type="button" onClick={() => setOpen(true)}>
        Processar tudo
      </button>
    </>
  )
}

async function renderAll(items: InboxItem[]) {
  server = items
  const rendered = renderWithProviders(<Harness />, { route: '/inbox?process=all' })
  await screen.findByRole('dialog')
  await waitFor(() => expect(lists.list).toHaveBeenCalled())
  return rendered
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await i18n.changeLanguage('pt-BR')
  vi.mocked(lists.list).mockResolvedValue({ timezone: TZ, lists: [list(ADSET, 'Work (ADSET)'), list(FRETE, 'Work (FRETE)')] })
  vi.mocked(inbox.list).mockImplementation(async () => ({ timezone: TZ, items: [...server] }))
  vi.mocked(inbox.update).mockImplementation(async (id, changes) => {
    server = server.map((it) => (it.id === id ? ({ ...it, ...changes } as InboxItem) : it))
    return server.find((it) => it.id === id)!
  })
})
afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

const dialog = () => screen.getByRole('dialog')
const button = (name: string | RegExp) => within(dialog()).getByRole('button', { name })
const nameField = () => within(dialog()).getByRole('textbox', { name: /^Nome/ })
const reviewItems = () => within(within(dialog()).getByRole('list', { name: 'Confira antes de enviar' })).getAllByRole('listitem')

const three = () => [
  item('i1', 'Primeiro item', { list_id: ADSET, estimate_minutes: 90 }),
  item('i2', 'Segundo item'),
  item('i3', 'Terceiro item'),
]

const task = (name: string, list_id: string, estimate_minutes: number | null, extra: Partial<Decision> = {}): Decision =>
  ({ type: 'task', name, list_id, priority: 'none', due_on: null, estimate_minutes, scheduled_on: null, scheduled_time: null, ...extra }) as Decision

describe('Processar tudo', () => {
  it('ALL-01 opens on the first item without a draft, with Processar · 1 de 3 and the progress bar', async () => {
    await renderAll(three())

    expect(screen.getByRole('dialog', { name: 'Processar · 1 de 3' })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('“Primeiro item”')
    expect(within(dialog()).getByRole('progressbar')).toBeInTheDocument()
  })

  it('ALL-01 ALL-08 an item with a draft kept before is not asked again: it opens on the 2nd', async () => {
    const items = three()
    items[0]!.draft = task('Primeiro item', ADSET, 90)
    await renderAll(items)

    expect(screen.getByRole('dialog', { name: 'Processar · 2 de 3' })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('“Segundo item”')
  })

  it('ALL-02 Salvar e próximo keeps the decision as a draft, creates nothing, and opens the next item', async () => {
    const { user } = await renderAll(three())
    await waitFor(() => expect(within(dialog()).getByRole('combobox', { name: /^Lista/ })).toHaveTextContent('Work (ADSET)'))

    await user.click(button('Salvar e próximo'))

    expect(inbox.update).toHaveBeenCalledWith('i1', {
      draft: { type: 'task', name: 'Primeiro item', list_id: ADSET, priority: 'none', due_on: null, estimate_minutes: 90, scheduled_on: null, scheduled_time: null },
    })
    expect(inbox.send).not.toHaveBeenCalled()
    expect(inbox.commit).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Processar · 2 de 3' })).toHaveTextContent('“Segundo item”')
  })

  it('ALL-03 Pular opens the next item without keeping a decision', async () => {
    const { user } = await renderAll(three())

    await user.click(button('Pular'))

    expect(await screen.findByRole('dialog', { name: 'Processar · 2 de 3' })).toHaveTextContent('“Segundo item”')
    expect(inbox.update).not.toHaveBeenCalled()
  })

  it('ALL-04 after the last item, the review shows each item with its type, name, priority and destination', async () => {
    const { user } = await renderAll(three())
    await waitFor(() => expect(within(dialog()).getByRole('combobox', { name: /^Lista/ })).toHaveTextContent('Work (ADSET)'))
    await user.click(within(dialog()).getByRole('combobox', { name: 'Prioridade' }))
    await user.click(await screen.findByRole('option', { name: 'Alta' }))
    await user.click(button('Salvar e próximo'))
    await screen.findByRole('dialog', { name: 'Processar · 2 de 3' })
    await user.click(button('Pular'))
    await screen.findByRole('dialog', { name: 'Processar · 3 de 3' })
    await user.click(button('Descartar'))

    expect(await screen.findByRole('dialog', { name: 'Processar · Revisão' })).toBeInTheDocument()
    const [first, second, third] = reviewItems()
    expect(first).toHaveTextContent('Tarefa')
    expect(within(first!).getByRole('button', { name: 'Corrigir Primeiro item' })).toBeInTheDocument()
    expect(within(first!).getByRole('img', { name: 'Prioridade alta' })).toBeInTheDocument()
    expect(first).toHaveTextContent('Work (ADSET) › Backlog')
    expect(second).toHaveTextContent('Pulado')
    expect(second).toHaveTextContent('Fica na caixa de entrada')
    expect(third).toHaveTextContent('Descartado')
    expect(third).toHaveTextContent('Lixeira')
    expect(button('Confirmar e enviar 2 itens')).toBeEnabled()
  })

  it('ALL-04 the review sums, per list, the items and the estimates each column gains', async () => {
    await renderAll([
      item('i1', 'Um', { draft: task('Um', ADSET, 60) }),
      item('i2', 'Dois', { draft: task('Dois', ADSET, 30) }),
      item('i3', 'Três', { draft: { type: 'reminder', name: 'Três', list_id: ADSET, scheduled_on: '2026-11-13', scheduled_time: '10:00' } }),
      item('i4', 'Quatro', {
        draft: { type: 'group', name: 'Quatro', list_id: FRETE, column: 'this_week', tasks: [{ title: 'a', estimate_minutes: 60 }, { title: 'b', estimate_minutes: 30 }] },
      }),
    ])

    const adset = within(dialog()).getByRole('region', { name: 'Work (ADSET)' })
    expect(adset.querySelector('[data-column="backlog"]')).toHaveTextContent(/Backlog\s*\+2 itens\s*1h 30min/)
    expect(adset.querySelector('[data-column="today"]')).toHaveTextContent(/Hoje\s*\+1 item/)
    const frete = within(dialog()).getByRole('region', { name: 'Work (FRETE)' })
    expect(frete.querySelector('[data-column="this_week"]')).toHaveTextContent(/Esta semana\s*\+1 item\s*1h 30min/)
    expect(reviewItems()[3]).toHaveTextContent('2 tarefas')
  })

  it('ALL-05 a click on an item of the review opens its form with the draft, and saving goes back to the review', async () => {
    const { user } = await renderAll([item('i1', 'Um', { draft: task('Nome guardado', ADSET, 60) }), item('i2', 'Dois', { draft: { type: 'discard' } })])

    await user.click(button('Corrigir Nome guardado'))

    expect(nameField()).toHaveValue('Nome guardado')
    expect(within(dialog()).getByRole('textbox', { name: 'Estimativa' })).toHaveValue('01:00')
    expect(within(dialog()).queryByRole('button', { name: 'Pular' })).not.toBeInTheDocument()
    await user.clear(nameField())
    await user.type(nameField(), 'Nome corrigido')
    await user.click(button('Salvar e próximo'))

    expect(inbox.update).toHaveBeenCalledWith('i1', { draft: expect.objectContaining({ type: 'task', name: 'Nome corrigido' }) })
    expect(await screen.findByRole('dialog', { name: 'Processar · Revisão' })).toBeInTheDocument()
    expect(button('Corrigir Nome corrigido')).toBeInTheDocument()
  })

  it('ALL-06 Confirmar e enviar sends the drafts shown, leaving the skipped item, and closes', async () => {
    vi.mocked(inbox.commit).mockResolvedValue({ tasks: [], groups: [], discarded: ['i3'] })
    const { user } = await renderAll([
      item('i1', 'Um', { draft: task('Um', ADSET, 60) }),
      item('i2', 'Dois'),
      item('i3', 'Três', { draft: { type: 'discard' } }),
    ])
    // Dois has no draft: it opens first; skipping it leads to the review.
    await user.click(button('Pular'))

    await user.click(await within(dialog()).findByRole('button', { name: 'Confirmar e enviar 2 itens' }))

    expect(inbox.commit).toHaveBeenCalledWith(['i1', 'i3'])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('ALL-07 EDGE-02 a 409 marks each refused item with its reason and closes nothing', async () => {
    vi.mocked(inbox.commit).mockRejectedValue({
      response: {
        status: 409,
        data: {
          detail: 'Some items cannot be sent',
          items: [
            { item_id: 'i1', reason: 'list_archived' },
            { item_id: 'i2', reason: 'already_processed' },
          ],
        },
      },
    })
    const { user } = await renderAll([
      item('i1', 'Um', { draft: task('Um', ADSET, 60) }),
      item('i2', 'Dois', { draft: task('Dois', FRETE, null) }),
      item('i3', 'Três', { draft: task('Três', FRETE, null) }),
    ])

    await user.click(button('Confirmar e enviar 3 itens'))

    await waitFor(() => expect(reviewItems()[0]).toHaveTextContent('Lista arquivada'))
    expect(reviewItems()[1]).toHaveTextContent('Já processado em outra janela')
    expect(reviewItems()[2]).not.toHaveTextContent('Lista arquivada')
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Nenhum item foi enviado. Corrija os itens marcados.')
    expect(screen.getByRole('dialog', { name: 'Processar · Revisão' })).toBeInTheDocument()
  })

  it('ALL-08 Terminar depois closes keeping the drafts, and the next Processar tudo opens on the first item without one', async () => {
    const { user } = await renderAll(three())
    await waitFor(() => expect(within(dialog()).getByRole('combobox', { name: /^Lista/ })).toHaveTextContent('Work (ADSET)'))
    await user.click(button('Salvar e próximo'))
    await screen.findByRole('dialog', { name: 'Processar · 2 de 3' })
    await user.click(button('Pular'))
    await user.click(await within(screen.getByRole('dialog', { name: 'Processar · 3 de 3' })).findByRole('button', { name: 'Pular' }))

    await user.click(await within(screen.getByRole('dialog', { name: 'Processar · Revisão' })).findByRole('button', { name: 'Terminar depois' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(inbox.commit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Processar tudo' }))
    expect(await screen.findByRole('dialog', { name: 'Processar · 2 de 3' })).toHaveTextContent('“Segundo item”')
  })
})
