import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessions } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ListCard, RecentAgendaTask } from '@/types'
import { SessionTaskPicker } from './session-task-picker'

vi.mock('@/lib/api', () => ({ sessions: { searchTasks: vi.fn() } }))

const list = (id: string, name: string, color: number, position: number): ListCard => ({
  id,
  workspace_id: 'ws',
  name,
  color,
  position,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-01T00:00:00.000Z',
  pending_count: 0,
  preview: [],
})
const LISTS = [list('frete', 'Frete', 1, 0), list('adset', 'ADSet', 2, 1)]
const task = (id: string, title: string, listId: string, column: RecentAgendaTask['column'] = 'today'): RecentAgendaTask => {
  const owner = LISTS.find((item) => item.id === listId)!
  return { id, title, list_id: listId, list_name: owner.name, list_color: owner.color, column, updated_at: '2026-11-04T12:00:00.000Z' }
}
// The API answers the latest first: ADSet's task is newer than both of Frete's.
const RECENT = [task('a1', 'Proposta para o cliente', 'adset'), task('f1', 'Revisar PR da fila', 'frete'), task('f2', 'Corrigir o frete', 'frete', 'done')]
const MATCHES = [task('f1', 'Revisar PR da fila', 'frete'), task('a2', 'Pré-revisão do orçamento', 'adset')]

function picker(props: Partial<Parameters<typeof SessionTaskPicker>[0]> = {}) {
  const handlers = { onChange: vi.fn(), onCreate: vi.fn() }
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const result = renderWithProviders(<SessionTaskPicker value={null} lists={LISTS} {...handlers} {...props} />)
  return { ...result, user, ...handlers }
}
const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Task' }))
  return screen.findByRole('dialog', { name: 'Tasks' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(sessions.searchTasks).mockImplementation(async (q: string) => ({ tasks: q.trim() === '' ? RECENT : q === 'zzz' ? [] : MATCHES }))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('SessionTaskPicker', () => {
  it('PICK-06 opens with the search focused, the 10-recent caption, the tasks and Create new task after them', async () => {
    const { user } = picker()
    const panel = await openPicker(user)
    expect(within(panel).getByRole('searchbox', { name: 'Search task' })).toHaveFocus()
    expect(within(panel).getByText('The 10 updated last')).toBeInTheDocument()
    expect(await within(panel).findByRole('option', { name: /Proposta para o cliente/ })).toBeInTheDocument()
    const create = within(panel).getByRole('button', { name: 'Create new task' })
    const lastOption = within(panel).getAllByRole('option').at(-1)!
    expect(lastOption.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sessions.searchTasks).toHaveBeenCalledWith('')
  })

  it('PICK-07 groups by list in the order of the lists, keeps the latest first in a group, and marks a concluded task', async () => {
    const { user } = picker()
    const panel = await openPicker(user)
    await within(panel).findByRole('option', { name: /Proposta/ })
    const groups = within(panel).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Frete', 'ADSet'])
    expect(within(groups[0]!).getAllByRole('option').map((option) => option.textContent)).toEqual(['Revisar PR da fila', 'Corrigir o freteDone'])
    expect(within(groups[1]!).getAllByRole('option').map((option) => option.textContent)).toEqual(['Proposta para o cliente'])
  })

  it('PICK-08 asks for the matches 300 ms after the last key, once, and highlights them with the count', async () => {
    const { user } = picker()
    const panel = await openPicker(user)
    await within(panel).findByRole('option', { name: /Proposta/ })
    vi.mocked(sessions.searchTasks).mockClear()
    // From here the clock only moves when the test moves it: one key every 100 ms, then 299 ms of quiet.
    vi.useFakeTimers({ shouldAdvanceTime: false })
    const box = within(panel).getByRole('searchbox')
    for (const typed of ['r', 're', 'rev', 'revi', 'revis']) {
      fireEvent.change(box, { target: { value: typed } })
      await act(async () => {
        vi.advanceTimersByTime(100)
      })
    }
    expect(sessions.searchTasks).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(199)
    })
    expect(sessions.searchTasks).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(sessions.searchTasks).toHaveBeenCalledTimes(1)
    expect(sessions.searchTasks).toHaveBeenCalledWith('revis')
    await act(async () => {
      vi.advanceTimersByTime(50)
    })
    expect(within(panel).getByText('2 tasks for “revis”, in every list')).toBeInTheDocument()
    expect([...panel.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Revis', 'revis'])
  })

  it('PICK-09 clears the search back to the 10 recent tasks', async () => {
    const { user } = picker()
    const panel = await openPicker(user)
    await user.type(within(panel).getByRole('searchbox'), 'revis')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await within(panel).findByText('2 tasks for “revis”, in every list')
    await user.click(within(panel).getByRole('button', { name: 'Clear search' }))
    expect(within(panel).getByRole('searchbox')).toHaveValue('')
    expect(await within(panel).findByText('The 10 updated last')).toBeInTheDocument()
    expect(await within(panel).findByRole('option', { name: /Proposta/ })).toBeInTheDocument()
  })

  it('PICK-10 shows No task found and Create “text”, handing the text to onCreate', async () => {
    const { user, onCreate } = picker()
    const panel = await openPicker(user)
    await user.type(within(panel).getByRole('searchbox'), 'zzz')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(await within(panel).findByText('No task found')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Create “zzz”' }))
    expect(onCreate).toHaveBeenCalledWith('zzz')
  })

  it('PICK-12 hands an empty title to onCreate from Create new task without a search', async () => {
    const { user, onCreate } = picker()
    const panel = await openPicker(user)
    await user.click(within(panel).getByRole('button', { name: 'Create new task' }))
    expect(onCreate).toHaveBeenCalledWith('')
  })

  it('PICK-11 hands the picked task over, closes, and shows it in the field', async () => {
    const { user, onChange, rerender } = picker()
    const panel = await openPicker(user)
    await user.click(await within(panel).findByRole('option', { name: /Revisar PR da fila/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', title: 'Revisar PR da fila' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<SessionTaskPicker value={RECENT[1]!} lists={LISTS} onChange={onChange} onCreate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Task' })).toHaveTextContent('Revisar PR da fila')
  })

  it('disables creating without an active list', async () => {
    const { user } = picker({ lists: [] })
    const panel = await openPicker(user)
    expect(within(panel).getByRole('button', { name: 'Create new task' })).toBeDisabled()
  })

  it('reads Buscar tarefa, As 10 atualizadas por último and Criar nova tarefa in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = picker()
    await user.click(screen.getByRole('button', { name: 'Tarefa' }))
    const panel = await screen.findByRole('dialog', { name: 'Tarefas' })
    expect(within(panel).getByRole('searchbox', { name: 'Buscar tarefa' })).toBeInTheDocument()
    expect(within(panel).getByText('As 10 atualizadas por último')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Criar nova tarefa' })).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})
