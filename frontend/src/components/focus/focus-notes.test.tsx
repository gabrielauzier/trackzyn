import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { FocusNotes } from '@/components/focus/focus-notes'
import i18n from '@/lib/i18n'
import { renderWithProviders, selectContents } from '@/test/utils'
import type { Task } from '@/types'

const api = vi.hoisted(() => ({ tasks: { get: vi.fn(), update: vi.fn() } }))
vi.mock('@/lib/api', () => api)

function taskWith(notes: string): Task {
  return {
    id: 'task-a',
    list_id: 'list-1',
    title: 'Write the report',
    notes,
    estimate_minutes: 30,
    column: 'today',
    position: 0,
    completed_at: null,
    created_at: '2026-10-24T12:00:00.000Z',
    subtasks: [],
    created_via: null,
  }
}

beforeEach(() => {
  api.tasks.get.mockResolvedValue(taskWith(''))
  api.tasks.update.mockImplementation(async (_id: string, payload: { notes: string }) => ({ ...taskWith(''), ...payload }))
})

afterEach(() => {
  vi.clearAllMocks()
})

function renderNotes(canWrite = true) {
  return renderWithProviders(<FocusNotes taskId="task-a" canWrite={canWrite} />)
}

const action = () => screen.findByRole('button', { name: /^Notes/ })
const editor = () => screen.queryByRole('textbox', { name: 'Task notes' })

describe('FocusNotes (#33)', () => {
  it('shows the Notes action, muted without notes', async () => {
    const { container } = renderNotes()

    const button = await action()
    expect(button).toHaveTextContent('Notes')
    expect(button).toHaveAttribute('data-muted', 'true')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    // The label and the notes icon in grey, past a line.
    expect(screen.getByText('Notes')).toHaveClass('text-muted-foreground')
    expect(button.querySelector('svg')).toHaveClass('text-muted-foreground')
    expect(container.querySelector('[data-focus-notes]')).toHaveClass('border-t')
    expect(editor()).not.toBeInTheDocument()

    // In Portuguese, `Anotação`.
    await i18n.changeLanguage('pt-BR')
    try {
      expect(await screen.findByRole('button', { name: /^Anotação/ })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('opens the editor with the current notes', async () => {
    api.tasks.get.mockResolvedValue(taskWith('<p>Ask Ana for the numbers</p>'))
    const { user, unmount: close } = renderNotes()

    await user.click(await action())

    const field = await screen.findByRole('textbox', { name: 'Task notes' })
    expect(field).toHaveTextContent('Ask Ana for the numbers')
    await waitFor(() => expect(field).toHaveFocus())
    expect(screen.getByText('Saves when you leave')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Notes/ })).toHaveAttribute('aria-expanded', 'true')
    expect(api.tasks.update).not.toHaveBeenCalled()
    close()

    // Empty when there are none, and `Salva ao sair` in Portuguese.
    api.tasks.get.mockResolvedValue(taskWith(''))
    await i18n.changeLanguage('pt-BR')
    try {
      const { user: other, unmount } = renderWithProviders(<FocusNotes taskId="task-b" canWrite />)
      await other.click(await screen.findByRole('button', { name: /^Anotação/ }))
      const empty = await screen.findByRole('textbox', { name: 'Anotação da tarefa' })
      expect(empty.textContent).toBe('')
      await waitFor(() => expect(empty).toHaveFocus())
      expect(screen.getByText('Salva ao sair')).toBeInTheDocument()
      unmount()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('leaving the editor saves the notes', async () => {
    const { user, queryClient } = renderNotes()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await user.click(await action())
    const field = await screen.findByRole('textbox', { name: 'Task notes' })

    selectContents(field)
    await user.paste('Numbers from Ana arrived')
    api.tasks.get.mockResolvedValue(taskWith('<p>Numbers from Ana arrived</p>'))
    await user.tab()

    await waitFor(() => expect(editor()).not.toBeInTheDocument())
    expect(api.tasks.update.mock.calls).toEqual([['task-a', { notes: '<p>Numbers from Ana arrived</p>' }]])
    // The board and the widget read the task again, so they show the same text.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lists'] })
    expect(await screen.findByText('Numbers from Ana arrived')).toBeInTheDocument()
  })

  it('leaving the editor without a change sends nothing', async () => {
    api.tasks.get.mockResolvedValue(taskWith('<p>Ask Ana</p>'))
    const { user } = renderNotes()
    await user.click(await action())
    const field = await screen.findByRole('textbox', { name: 'Task notes' })
    await waitFor(() => expect(field).toHaveFocus())

    await user.tab()

    await waitFor(() => expect(editor()).not.toBeInTheDocument())
    expect(api.tasks.update).not.toHaveBeenCalled()
  })

  it('notes over the limit are not sent', async () => {
    const { user } = renderNotes()
    await user.click(await action())
    const field = await screen.findByRole('textbox', { name: 'Task notes' })

    // The limit counts the stored text: `<p>` and `</p>` take 7 of the 10 000.
    selectContents(field)
    await user.paste('a'.repeat(9_994))
    await user.tab()

    expect(await screen.findByText('Use at most 10,000 characters')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(editor()).toBeInTheDocument()
  })

  it('a refused save shows the API error and keeps the editor open', async () => {
    api.tasks.update.mockRejectedValue(new Error('Notes could not be saved'))
    const { user } = renderNotes()
    await user.click(await action())
    const field = await screen.findByRole('textbox', { name: 'Task notes' })

    selectContents(field)
    await user.paste('Lost?')
    await user.tab()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(field).toHaveTextContent('Lost?')
  })

  it('a closed note shows its first line', async () => {
    api.tasks.get.mockResolvedValue(taskWith('<p>Ask Ana for the numbers</p><p>Then the chart</p>'))
    renderNotes()

    const button = await action()
    expect(button).not.toHaveAttribute('data-muted')
    expect(button.querySelector('svg')).toHaveClass('text-primary')
    const line = screen.getByText('Ask Ana for the numbers')
    expect(line).toHaveClass('truncate')
    expect(button).not.toHaveTextContent('Then the chart')
    expect(editor()).not.toBeInTheDocument()
  })

  it('a viewer reads the notes without an editor', async () => {
    api.tasks.get.mockResolvedValue(taskWith('<p>Ask Ana for the numbers</p><p>Then the chart</p>'))
    const { user } = renderNotes(false)

    const button = await action()
    expect(screen.getByText('Ask Ana for the numbers')).toBeInTheDocument()
    await user.click(button)

    // The whole text, read-only: no field, no toolbar, no `Salva ao sair`.
    expect(document.querySelector('[data-notes-text]')).toHaveTextContent('Ask Ana for the numbers Then the chart')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByText('Saves when you leave')).not.toBeInTheDocument()
    expect(api.tasks.update).not.toHaveBeenCalled()
  })
})
