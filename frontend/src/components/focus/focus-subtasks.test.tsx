import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { FocusSubtasks } from '@/components/focus/focus-subtasks'
import i18n from '@/lib/i18n'
import { renderWithProviders } from '@/test/utils'
import type { Subtask, Task } from '@/types'

const api = vi.hoisted(() => ({
  tasks: { get: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn() },
}))
vi.mock('@/lib/api', () => api)

const sub = (id: string, title: string, done: boolean, position: number): Subtask => ({ id, task_id: 'task-a', title, done, position })

function taskWith(items: Subtask[]): Task {
  return {
    id: 'task-a',
    list_id: 'list-1',
    title: 'Write the report',
    notes: '',
    estimate_minutes: 30,
    column: 'today',
    position: 0,
    completed_at: null,
    created_at: '2026-10-24T12:00:00.000Z',
    subtasks: items,
    created_via: null,
    scheduled_on: null,
    scheduled_time: null,
    series: null,
  }
}

const allDone = () => [sub('s1', 'Write the cases', true, 0), sub('s2', 'Drop at the end', true, 1), sub('s3', 'Announce it', true, 2)]
const somePending = () => [sub('s1', 'Write the cases', true, 0), sub('s2', 'Drop at the end', false, 1)]

beforeEach(() => {
  api.subtasks.create.mockImplementation(() => new Promise(() => undefined))
})

afterEach(() => {
  vi.clearAllMocks()
})

function renderSubtasks(items: Subtask[], canWrite = true) {
  api.tasks.get.mockResolvedValue(taskWith(items))
  const onComplete = vi.fn()
  const result = renderWithProviders(<FocusSubtasks taskId="task-a" canWrite={canWrite} onComplete={onComplete} />)
  return { ...result, onComplete }
}

const toggle = () => screen.findByRole('button', { name: /^(Show|Hide) subtasks$/ })

describe('FocusSubtasks (#33)', () => {
  it('the subtasks row has a show and hide toggle', async () => {
    const { user } = renderSubtasks(somePending())

    // With pending subtasks the list starts open, and the chevron hides it.
    const chevron = await toggle()
    const row = screen.getByText('1/2').parentElement!
    expect(within(row).getByText('Subtasks')).toBeInTheDocument()
    // At the right of the row, after the counter.
    expect(row.lastElementChild).toBe(chevron)
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    expect(chevron).toHaveAccessibleName('Hide subtasks')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)

    await user.click(chevron)
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    expect(chevron).toHaveAccessibleName('Show subtasks')
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByRole('textbox', { name: 'New subtask' })).not.toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()

    await user.click(chevron)
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)

    // In Portuguese, `Esconder subtarefas` and `Mostrar subtarefas`.
    await i18n.changeLanguage('pt-BR')
    try {
      expect(await screen.findByRole('button', { name: 'Esconder subtarefas' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Esconder subtarefas' }))
      expect(screen.getByRole('button', { name: 'Mostrar subtarefas' })).toHaveAttribute('aria-expanded', 'false')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('all done starts collapsed and opens to add another', async () => {
    const { user, onComplete } = renderSubtasks(allDone())

    // Collapsed: the row, `Tudo feito por aqui.` and `Concluir tarefa`, no subtask.
    const chevron = await toggle()
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    expect(chevron).toHaveAccessibleName('Show subtasks')
    expect(screen.getByText('3/3')).toBeInTheDocument()
    expect(screen.getByText('All done here.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete task' })).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument()

    await user.click(chevron)

    // Open: the done subtasks, struck and ticked, `Adicionar subtarefa`, then `Tudo feito` with `Concluir tarefa`.
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual(['Write the cases', 'Drop at the end', 'Announce it'])
    for (const box of boxes) expect(box).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Drop at the end')).toHaveClass('line-through')
    const add = screen.getByRole('button', { name: 'Add subtask' })
    const allDoneText = screen.getByText('All done here.')
    const complete = screen.getByRole('button', { name: 'Complete task' })
    expect(boxes.at(-1)!.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(add.compareDocumentPosition(allDoneText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(complete)
    expect(onComplete).toHaveBeenCalledTimes(1)

    await user.click(add)
    expect(screen.getByRole('textbox', { name: 'New subtask' })).toHaveFocus()
  })

  it('a new subtask leaves the all done state', async () => {
    const { user } = renderSubtasks(allDone())
    await user.click(await toggle())
    await user.click(screen.getByRole('button', { name: 'Add subtask' }))

    await user.type(screen.getByRole('textbox', { name: 'New subtask' }), 'Check the widget{Enter}')

    expect(api.subtasks.create).toHaveBeenCalledWith('task-a', 'Check the widget')
    // Pending, at the end, counted: 3/4, and `Tudo feito por aqui.` is gone.
    const added = screen.getByRole('checkbox', { name: 'Check the widget' })
    expect(added).toHaveAttribute('aria-checked', 'false')
    expect(screen.getAllByRole('checkbox').at(-1)).toBe(added)
    expect(screen.getByText('3/4')).toBeInTheDocument()
    expect(screen.queryByText('All done here.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete task' })).not.toBeInTheDocument()
    // The list stays open.
    expect(await toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('a viewer opens the done subtasks without adding', async () => {
    const { user } = renderSubtasks(allDone(), false)
    await user.click(await toggle())

    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument()
    expect(screen.getByText('All done here.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete task' })).not.toBeInTheDocument()
  })
})
