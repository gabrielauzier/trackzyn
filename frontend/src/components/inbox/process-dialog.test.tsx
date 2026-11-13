import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'

import { ProcessDialog } from '@/components/inbox/process-dialog'
import { inbox, lists } from '@/lib/api'
import { i18n, PLAIN_TASK_FIELDS, renderWithProviders } from '@/test/utils'
import type { InboxItem, ListCard, Task } from '@/types'

vi.mock('@/lib/api', () => ({
  inbox: { send: vi.fn(), discard: vi.fn() },
  lists: { list: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/contexts/workspace-context', () => ({ useWorkspace: () => ({ canWrite: true }) }))

const TZ = 'America/Sao_Paulo'
// Thursday, 13 November 2026, 12:00 in São Paulo: the week runs to Sunday the 15th.
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

const ITEM: InboxItem = {
  id: 'item-1',
  text: 'DEV-1701 - UMUARAMA - sobreposição das integrações',
  source: 'desktop',
  created_via: null,
  list_id: ADSET,
  estimate_minutes: 90,
  draft: null,
  discarded_at: null,
  created_at: '2026-11-10T13:00:00Z',
}

function createdTask(column: Task['column']): Task {
  return { id: 't', list_id: ADSET, title: 'x', column, ...PLAIN_TASK_FIELDS } as Task
}

const onClose = vi.fn()
const onNext = vi.fn()

async function renderDialog(item: Partial<InboxItem> = {}) {
  const rendered = renderWithProviders(<ProcessDialog item={{ ...ITEM, ...item }} timeZone={TZ} onClose={onClose} onNext={onNext} />)
  // The lists arrive: the list of the row shows in the select.
  await waitFor(() => expect(lists.list).toHaveBeenCalled())
  return rendered
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await i18n.changeLanguage('pt-BR')
  vi.mocked(lists.list).mockResolvedValue({ timezone: TZ, lists: [list(ADSET, 'Work (ADSET)'), list(FRETE, 'Work (FRETE)')] })
  vi.mocked(inbox.send).mockResolvedValue({ tasks: [createdTask('backlog')], group: null })
  vi.mocked(inbox.discard).mockResolvedValue({ ...ITEM, discarded_at: NOW.toISOString() })
})
afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

const dialog = () => screen.getByRole('dialog', { name: 'Processar' })
const nameField = () => within(dialog()).getByRole('textbox', { name: /^Nome/ })
const listSelect = () => within(dialog()).getByRole('combobox', { name: /^Lista/ })
const saveButton = () => within(dialog()).getByRole('button', { name: 'Salvar e próximo' })
const goesTo = () => within(dialog()).getByRole('status')
const kind = (name: string) => within(dialog()).getByRole('button', { name: new RegExp(`^${name}`) })

async function pickList(user: ReturnType<typeof renderWithProviders>['user'], name: string) {
  await user.click(listSelect())
  await user.click(await screen.findByRole('option', { name }))
}

describe('ProcessDialog', () => {
  it('PROC-01 opens with the text, its origin and age, the type Tarefa and the list and estimate of the row', async () => {
    await renderDialog()

    expect(dialog()).toHaveTextContent('Capturado há 3 dias via desktop:')
    expect(dialog()).toHaveTextContent('“DEV-1701 - UMUARAMA - sobreposição das integrações”')
    expect(kind('Tarefa')).toHaveAttribute('aria-pressed', 'true')
    expect(kind('Lembrete')).toHaveAttribute('aria-pressed', 'false')
    expect(nameField()).toHaveValue('DEV-1701 - UMUARAMA - sobreposição das integrações')
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))
    expect(within(dialog()).getByRole('textbox', { name: 'Estimativa' })).toHaveValue('01:30')
    expect(saveButton()).toBeEnabled()
  })

  it('PROC-01 a text over 255 characters opens as a name of 255', async () => {
    await renderDialog({ text: 'a'.repeat(300) })

    expect(nameField()).toHaveValue('a'.repeat(255))
  })

  it('PROC-02 without a list, Salvar e próximo is disabled and the list is marked', async () => {
    await renderDialog({ list_id: null })

    expect(saveButton()).toBeDisabled()
    expect(listSelect()).toHaveAttribute('aria-invalid', 'true')
    expect(dialog()).toHaveTextContent('Escolha a lista')
    expect(nameField()).not.toHaveAttribute('aria-invalid')
  })

  it('PROC-02 without a name, Salvar e próximo is disabled and the name is marked', async () => {
    const { user } = await renderDialog()
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))

    await user.clear(nameField())

    expect(saveButton()).toBeDisabled()
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(dialog()).toHaveTextContent('Dê um nome')
    expect(listSelect()).not.toHaveAttribute('aria-invalid')
  })

  it('PROC-03 with no day it goes to the Backlog', async () => {
    await renderDialog()

    await waitFor(() => expect(goesTo()).toHaveTextContent('Vai para Work (ADSET) › Backlog'))
  })

  it('PROC-03 scheduled for today it shows Vai para Work (ADSET) › Hoje', async () => {
    await renderDialog()

    fireEvent.change(within(dialog()).getByLabelText('Agendar para'), { target: { value: '2026-11-13' } })

    await waitFor(() => expect(goesTo()).toHaveTextContent('Vai para Work (ADSET) › Hoje'))
    expect(within(dialog()).getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('PROC-03 scheduled for Saturday of this week it goes to Esta semana', async () => {
    await renderDialog()

    fireEvent.change(within(dialog()).getByLabelText('Agendar para'), { target: { value: '2026-11-14' } })

    await waitFor(() => expect(goesTo()).toHaveTextContent('Vai para Work (ADSET) › Esta semana'))
  })

  it('PROC-04 choosing another column changes the destination and the send uses it', async () => {
    const { user } = await renderDialog()
    fireEvent.change(within(dialog()).getByLabelText('Agendar para'), { target: { value: '2026-11-13' } })

    await user.click(within(dialog()).getByRole('button', { name: 'Esta semana' }))
    expect(goesTo()).toHaveTextContent('Vai para Work (ADSET) › Esta semana')
    await user.click(saveButton())

    expect(inbox.send).toHaveBeenCalledWith('item-1', expect.objectContaining({ type: 'task', column: 'this_week', scheduled_on: '2026-11-13' }))
  })

  it('PROC-05 saving sends the task with name, list, priority, due day, estimate, schedule and notes, then moves on', async () => {
    vi.mocked(inbox.send).mockResolvedValue({ tasks: [createdTask('today')], group: null })
    const { user } = await renderDialog()
    await user.clear(nameField())
    await user.type(nameField(), 'DEV-1701 sobreposição')
    await pickList(user, 'Work (FRETE)')
    await user.click(within(dialog()).getByRole('combobox', { name: 'Prioridade' }))
    await user.click(await screen.findByRole('option', { name: 'Alta' }))
    fireEvent.change(within(dialog()).getByLabelText('Prazo'), { target: { value: '2026-11-20' } })
    fireEvent.change(within(dialog()).getByLabelText('Agendar para'), { target: { value: '2026-11-13' } })
    fireEvent.change(within(dialog()).getByLabelText('Hora'), { target: { value: '10:00' } })
    await user.type(within(dialog()).getByLabelText('Anotações'), 'Ver com o time')

    await user.click(saveButton())

    expect(inbox.send).toHaveBeenCalledWith('item-1', {
      type: 'task',
      name: 'DEV-1701 sobreposição',
      list_id: FRETE,
      priority: 'high',
      due_on: '2026-11-20',
      estimate_minutes: 90,
      scheduled_on: '2026-11-13',
      scheduled_time: '10:00',
      notes: 'Ver com o time',
    })
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith('Enviado para Work (FRETE) › Hoje')
  })

  it('PROC-06 Já fiz (menos de 2 min) sends the item as done', async () => {
    const { user } = await renderDialog()
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))

    await user.click(within(dialog()).getByRole('button', { name: 'Já fiz (menos de 2 min)' }))

    expect(inbox.send).toHaveBeenCalledWith('item-1', {
      type: 'done',
      name: 'DEV-1701 - UMUARAMA - sobreposição das integrações',
      list_id: ADSET,
    })
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
  })

  it('PROC-07 Descartar sends the item to the trash', async () => {
    const { user } = await renderDialog()

    await user.click(within(dialog()).getByRole('button', { name: 'Descartar' }))

    expect(inbox.discard).toHaveBeenCalledWith('item-1')
    expect(inbox.send).not.toHaveBeenCalled()
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
  })

  it('REM-01 REM-02 a reminder hides the estimate and sends name, list, priority, day and time without an estimate', async () => {
    const { user } = await renderDialog()
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))

    await user.click(kind('Lembrete'))
    expect(within(dialog()).queryByRole('textbox', { name: 'Estimativa' })).not.toBeInTheDocument()
    fireEvent.change(within(dialog()).getByLabelText('Dia'), { target: { value: '2026-11-13' } })
    fireEvent.change(within(dialog()).getByLabelText('Hora'), { target: { value: '10:00' } })
    await user.click(saveButton())

    expect(inbox.send).toHaveBeenCalledWith('item-1', {
      type: 'reminder',
      name: 'DEV-1701 - UMUARAMA - sobreposição das integrações',
      list_id: ADSET,
      priority: 'none',
      scheduled_on: '2026-11-13',
      scheduled_time: '10:00',
    })
  })

  it('GRP-02 a group with no task disables Salvar e próximo with Adicione a primeira tarefa', async () => {
    const { user } = await renderDialog()
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))

    await user.click(kind('Grupo'))

    expect(saveButton()).toBeDisabled()
    expect(dialog()).toHaveTextContent('Adicione a primeira tarefa')
  })

  it('GRP-03 Validar 0:30 becomes a task of 30 minutes, and Enter adds it without saving', async () => {
    const { user } = await renderDialog()
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))
    await user.click(kind('Grupo'))
    await user.clear(nameField())
    await user.type(nameField(), 'Pipeline de scripts')

    await user.type(within(dialog()).getByRole('textbox', { name: 'Nova tarefa do grupo' }), 'Validar 0:30{Enter}')

    expect(inbox.send).not.toHaveBeenCalled()
    const tasks = within(dialog()).getAllByRole('listitem')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toHaveTextContent('Validar')
    expect(tasks[0]).toHaveTextContent('00:30')
    expect(dialog()).not.toHaveTextContent('Adicione a primeira tarefa')
    await user.click(saveButton())

    expect(inbox.send).toHaveBeenCalledWith('item-1', {
      type: 'group',
      name: 'Pipeline de scripts',
      list_id: ADSET,
      priority: 'none',
      due_on: null,
      tasks: [{ title: 'Validar', estimate_minutes: 30 }],
    })
  })

  it('PROC-08 a refused send keeps the values and shows the reason in the form', async () => {
    vi.mocked(inbox.send).mockRejectedValue({ response: { status: 409, data: { detail: 'List archived', reason: 'list_archived' } } })
    const { user } = await renderDialog()
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))
    await user.clear(nameField())
    await user.type(nameField(), 'Nome novo')

    await user.click(saveButton())

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('A lista foi arquivada. Escolha outra lista.')
    expect(nameField()).toHaveValue('Nome novo')
    expect(onNext).not.toHaveBeenCalled()
  })

  it('PROC-08 any other failure of the send shows the error of the API in the form', async () => {
    vi.mocked(inbox.send).mockRejectedValue({ response: { status: 422, data: { detail: 'Due day is not valid' } } })
    const { user } = await renderDialog()
    await waitFor(() => expect(listSelect()).toHaveTextContent('Work (ADSET)'))

    await user.click(saveButton())

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Due day is not valid')
    expect(nameField()).toHaveValue('DEV-1701 - UMUARAMA - sobreposição das integrações')
    expect(onNext).not.toHaveBeenCalled()
  })
})
