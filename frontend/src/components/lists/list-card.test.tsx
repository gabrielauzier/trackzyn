import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { ListCard } from '@/components/lists/list-card'
import { lists } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ListCard as ListCardData } from '@/types'

vi.mock('@/lib/api', () => ({
  lists: { update: vi.fn(), remove: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const card: ListCardData = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: 'ws',
  name: 'week',
  color: 3,
  position: 0,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-24T10:00:00Z',
  pending_count: 5,
  preview: [
    { id: 't1', title: 'Write the report', estimate_minutes: 30, subtasks: { done: 0, total: 1 } },
    { id: 't2', title: 'Review the PR', estimate_minutes: 120, subtasks: { done: 0, total: 0 } },
    { id: 't3', title: 'Plan the week', estimate_minutes: null, subtasks: { done: 1, total: 2 } },
    { id: 't4', title: 'Fourth from the API', estimate_minutes: null, subtasks: { done: 0, total: 0 } },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(lists.update).mockResolvedValue(card)
  vi.mocked(lists.remove).mockResolvedValue(undefined)
})

describe('ListCard', () => {
  it('shows the badge, the name and the pending count', () => {
    renderWithProviders(<ListCard list={card} canWrite onRename={vi.fn()} />)

    expect(screen.getByText('W')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'week' })).toHaveAttribute('href', `/lists/${card.id}`)
    expect(screen.getByText('5 pending tasks')).toBeInTheDocument()
  })

  it('pluralizes the pending count in Portuguese, zero included', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const footers = [0, 1, 2].map((pending_count) => {
        const { unmount } = renderWithProviders(
          <ListCard list={{ ...card, pending_count }} canWrite onRename={vi.fn()} />,
        )
        const text = screen.getByText(/tarefas? pendentes?$/).textContent
        unmount()
        return text
      })

      expect(footers).toEqual(['0 tarefas pendentes', '1 tarefa pendente', '2 tarefas pendentes'])
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows up to three tasks with subtasks and estimate', () => {
    renderWithProviders(<ListCard list={card} canWrite onRename={vi.fn()} />)

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    // The API sends 4 (the MCP reads the same preview); the card shows the first 3.
    expect(rows.map((row) => row.textContent)).toEqual([
      'Write the report1 subtask · 30min',
      'Review the PR2hr',
      'Plan the week2 subtasks',
    ])
    for (const row of rows) {
      expect(row).toHaveClass('rounded-lg', 'border')
      // No reorder handle in the card's rows.
      expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    }
    expect(within(rows[0]!).getByText('Write the report')).toHaveClass('truncate')
    expect(within(rows[0]!).getByText('1 subtask · 30min')).toBeInTheDocument()
  })

  it('shows the subtasks and estimate in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<ListCard list={card} canWrite onRename={vi.fn()} />)
      expect(screen.getByText('1 subtarefa · 30min')).toBeInTheDocument()
      expect(screen.getByText('2h')).toBeInTheDocument()
      expect(screen.getByText('2 subtarefas')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('keeps its height without empty rows', () => {
    const heightOf = (count: number) => {
      const { unmount } = renderWithProviders(
        <ListCard list={{ ...card, preview: card.preview.slice(0, count) }} canWrite onRename={vi.fn()} />,
      )
      const list = screen.getByRole('list')
      const drawn = within(list).queryAllByRole('listitem').length
      const className = list.className
      unmount()
      return { drawn, className }
    }

    const full = heightOf(3)
    expect(full.drawn).toBe(3)
    // A fixed height of three rows, whatever the count.
    expect(full.className).toMatch(/(^|\s)h-\d+(\s|$)/)
    expect(full.className).toContain('grid-rows-3')
    for (const count of [0, 1, 2]) {
      const { drawn, className } = heightOf(count)
      expect(drawn).toBe(count)
      expect(className).toBe(full.className)
    }
  })

  it('hides the menu from a viewer', () => {
    renderWithProviders(<ListCard list={card} canWrite={false} onRename={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('opens the rename dialog from the menu', async () => {
    const onRename = vi.fn()
    const { user } = renderWithProviders(<ListCard list={card} canWrite onRename={onRename} />)

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))

    expect(onRename).toHaveBeenCalledWith(card)
  })

  it('archives from the menu', async () => {
    const { user } = renderWithProviders(<ListCard list={card} canWrite onRename={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))

    await waitFor(() => expect(lists.update).toHaveBeenCalledWith(card.id, { is_archived: true }))
  })

  it('asks for confirmation, naming the list, before deleting', async () => {
    const { user } = renderWithProviders(<ListCard list={card} canWrite onRename={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/^week will be deleted/)).toBeInTheDocument()
    expect(lists.remove).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /Delete/ }))
    await waitFor(() => expect(lists.remove).toHaveBeenCalledWith(card.id))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
