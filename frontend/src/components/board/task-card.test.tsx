import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import { TaskCard } from '@/components/board/task-card'
import { i18n, renderWithProviders } from '@/test/utils'
import type { TaskCardView } from '@/types'

function task(overrides: Partial<TaskCardView> = {}): TaskCardView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'DEV-1725',
    estimate_minutes: 60,
    spent_seconds: 0,
    position: 0,
    subtasks: { done: 0, total: 0 },
    created_via: null,
    scheduled_on: null,
    scheduled_time: null,
    series: null,
    ...overrides,
  }
}

const noop = { onOpen: vi.fn() }

describe('TaskCard', () => {
  it('shows the token that created the task', () => {
    renderWithProviders(<TaskCard task={task({ created_via: 'n8n flow' })} column="backlog" canWrite {...noop} />)

    expect(screen.getByText('via n8n flow')).toBeInTheDocument()
  })

  it('shows no origin on a task without a token', () => {
    renderWithProviders(<TaskCard task={task({ created_via: null })} column="backlog" canWrite {...noop} />)

    expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
  })

  it('shows the origin to a viewer too', () => {
    renderWithProviders(<TaskCard task={task({ created_via: 'n8n flow' })} column="backlog" canWrite={false} {...noop} />)

    expect(screen.getByText('via n8n flow')).toBeInTheDocument()
  })

  it('truncates a 100 character name and keeps it whole in the title', () => {
    const name = 'n'.repeat(100)
    renderWithProviders(<TaskCard task={task({ created_via: name })} column="backlog" canWrite {...noop} />)

    const origin = screen.getByText(`via ${name}`)
    expect(origin).toHaveClass('truncate')
    expect(origin).toHaveAttribute('title', `via ${name}`)
  })

  it('shows the origin in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    renderWithProviders(<TaskCard task={task({ created_via: 'n8n flow' })} column="backlog" canWrite {...noop} />)

    expect(screen.getByText('via n8n flow')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })

  it('shows the title, the estimate and the time spent', () => {
    renderWithProviders(<TaskCard task={task({ estimate_minutes: 87 })} column="backlog" canWrite {...noop} />)

    expect(screen.getByRole('button', { name: 'DEV-1725' })).toBeInTheDocument()
    expect(screen.getByTitle('Estimate')).toHaveTextContent('1hr 27min')
    expect(screen.getByTitle('Time spent')).toHaveTextContent('0min')
  })

  it('shows no estimate when the task has none', () => {
    renderWithProviders(<TaskCard task={task({ estimate_minutes: null })} column="backlog" canWrite {...noop} />)

    expect(screen.queryByTitle('Estimate')).not.toBeInTheDocument()
    expect(screen.getByTitle('Time spent')).toHaveTextContent('0min')
  })

  it('numbers the card in Today', () => {
    renderWithProviders(<TaskCard task={task()} column="today" number={1} canWrite {...noop} />)

    expect(screen.getByTitle('Order in Today')).toHaveTextContent('1')
  })

  it('does not number cards outside Today', () => {
    renderWithProviders(<TaskCard task={task()} column="this_week" number={1} canWrite {...noop} />)

    expect(screen.queryByTitle('Order in Today')).not.toBeInTheDocument()
  })

  it('cards outside Done have no checkbox', () => {
    for (const column of ['backlog', 'this_week', 'today'] as const) {
      const { unmount } = renderWithProviders(
        <TaskCard task={task()} column={column} number={1} canWrite {...noop} />,
      )
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument()
      const title = screen.getByRole('button', { name: 'DEV-1725' })
      // In Today the title comes right after the order number; elsewhere it opens the row.
      const row = title.parentElement!
      if (column === 'today') expect(title.previousElementSibling).toBe(screen.getByTitle('Order in Today'))
      else expect(row.firstElementChild).toBe(title)
      unmount()
    }
  })

  it('a done card shows a read-only check icon', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<TaskCard task={task({ spent_seconds: 5220 })} column="done" canWrite {...noop} />)

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      const icon = screen.getByLabelText('Concluída')
      expect(icon.tagName.toLowerCase()).toBe('svg')
      expect(icon).toHaveClass('text-primary')
      expect(icon).not.toHaveAttribute('tabindex')
      expect(icon.closest('button')).toBeNull()
      // To the left of the title, which is struck through in grey.
      const title = screen.getByRole('button', { name: 'DEV-1725' })
      expect(icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(title).toHaveClass('line-through', 'text-muted-foreground')
      expect(screen.getByTitle('Tempo gasto')).toHaveTextContent('1h 27min')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('the title wraps up to three lines with the full text as its tip', () => {
    const long = `DEV-1725 ${'averyveryverylongwordwithoutanyspace'.repeat(3)} and more words to fill three lines`
    for (const column of ['backlog', 'this_week', 'today', 'done'] as const) {
      const { unmount } = renderWithProviders(
        <TaskCard task={task({ title: long })} column={column} number={1} canWrite {...noop} />,
      )
      const title = screen.getByRole('button', { name: long })
      expect(title).toHaveClass('line-clamp-3', 'break-words')
      expect(title).not.toHaveClass('truncate')
      expect(title).toHaveAttribute('title', long)
      unmount()
    }
  })

  it('opens the task when the title is clicked', async () => {
    const onOpen = vi.fn()
    const view = task()
    const { user } = renderWithProviders(
      <TaskCard task={view} column="backlog" canWrite onOpen={onOpen} />,
    )

    await user.click(screen.getByRole('button', { name: 'DEV-1725' }))

    expect(onOpen).toHaveBeenCalledWith(view)
  })

  it('summarises the subtasks and opens their list from the arrow', async () => {
    const { user } = renderWithProviders(
      <TaskCard
        task={task({ subtasks: { done: 1, total: 3 } })}
        column="backlog"
        canWrite
        {...noop}
        subtasks={<p>subtask list</p>}
      />,
    )

    expect(screen.getByText('1/3 Subtasks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add subtask' })).toBeInTheDocument()
    expect(screen.queryByText('subtask list')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }))

    expect(screen.getByText('subtask list')).toBeInTheDocument()
  })

  it('has no subtask summary when the task has no subtasks', () => {
    renderWithProviders(<TaskCard task={task()} column="backlog" canWrite {...noop} />)

    expect(screen.queryByText(/Subtasks/)).not.toBeInTheDocument()
  })

  it('lets a viewer neither complete nor add subtasks', () => {
    renderWithProviders(
      <TaskCard task={task({ subtasks: { done: 0, total: 2 } })} column="today" number={1} canWrite={false} {...noop} />,
    )

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument()
  })
})

/** A card whose estimate edits go to `onEstimateChange` and land on the card, as the board does. */
function EditableCard({ initial = 90, canWrite = true, onEstimateChange = vi.fn(), onPointerDown = vi.fn() }: {
  initial?: number | null
  canWrite?: boolean
  onEstimateChange?: (view: TaskCardView, minutes: number | null) => void
  onPointerDown?: () => void
}) {
  const [view, setView] = useState(task({ estimate_minutes: initial }))
  return (
    <div onPointerDown={onPointerDown}>
      <TaskCard
        task={view}
        column="this_week"
        canWrite={canWrite}
        onOpen={noop.onOpen}
        onEstimateChange={(card, minutes) => {
          onEstimateChange(card, minutes)
          setView({ ...card, estimate_minutes: minutes })
        }}
      />
    </div>
  )
}

describe('TaskCard estimate in HH:MM', () => {
  it('the estimate is an edit button for writers', () => {
    renderWithProviders(<EditableCard initial={60} />)

    const edit = screen.getByRole('button', { name: 'Edit estimate' })
    expect(edit).toHaveTextContent('1hr')
    expect(edit).toHaveClass('cursor-text')
    expect(edit.className).toMatch(/hover:bg-/)
    const pencil = edit.querySelector('svg')
    expect(pencil).toHaveClass('lucide-pencil')
    // The pencil only shows while the mouse is over it.
    expect(pencil!.getAttribute('class')).toMatch(/opacity-0/)
    expect(pencil!.getAttribute('class')).toMatch(/group-hover\/estimate:opacity-100/)
  })

  it('clicking the estimate opens the HH:MM field in place', async () => {
    const onPointerDown = vi.fn()
    noop.onOpen.mockClear()
    const { user } = renderWithProviders(<EditableCard initial={90} onPointerDown={onPointerDown} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))

    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    expect(field).toHaveValue('01:30')
    expect(field).toHaveFocus()
    expect(field).toHaveClass('h-5', 'text-xs')
    // Neither the dialog nor a drag starts from it.
    expect(noop.onOpen).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
    fireEvent.pointerDown(field)
    expect(onPointerDown).not.toHaveBeenCalled()
  })

  it('a card without estimate offers an empty field', async () => {
    const { user } = renderWithProviders(<EditableCard initial={null} />)

    expect(screen.queryByTitle('Estimate')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))

    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('Enter saves the estimate in minutes', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={60} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0130{Enter}')

    expect(onEstimateChange).toHaveBeenCalledTimes(1)
    expect(onEstimateChange).toHaveBeenCalledWith(expect.objectContaining({ id: task().id }), 90)
    expect(screen.queryByRole('textbox', { name: 'Edit estimate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min')

    // Leaving the field saves too.
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const again = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(again)
    await user.type(again, '0200')
    await user.tab()

    expect(onEstimateChange).toHaveBeenLastCalledWith(expect.anything(), 120)
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('2hr')
  })

  it('clearing the field removes the estimate', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={90} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    await user.clear(screen.getByRole('textbox', { name: 'Edit estimate' }))
    await user.tab()

    expect(onEstimateChange).toHaveBeenCalledWith(expect.anything(), null)
    expect(screen.queryByTitle('Estimate')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).not.toHaveTextContent(/\d/)
  })

  it('an invalid estimate warns and is not sent', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={90} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0175')

    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveClass('aria-invalid:border-destructive')
    expect(screen.getByText('Minutes from 00 to 59')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(onEstimateChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Edit estimate' })).toBeInTheDocument()

    // Past 24:00 shows the limit.
    await user.clear(field)
    await user.type(field, '2430')
    expect(screen.getByText('Use 00:01 to 24:00')).toBeInTheDocument()

    // Leaving puts the previous value back, unsent.
    await user.tab()
    expect(onEstimateChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min')
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    expect(screen.getByRole('textbox', { name: 'Edit estimate' })).toHaveValue('01:30')
  })

  it('shows the warning in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user } = renderWithProviders(<EditableCard initial={90} />)
      await user.click(screen.getByRole('button', { name: 'Editar estimativa' }))
      const field = screen.getByRole('textbox', { name: 'Editar estimativa' })
      await user.clear(field)
      await user.type(field, '0175')
      expect(screen.getByText('Minutos de 00 a 59')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('Escape cancels the estimate edit', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={90} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0300{Escape}')

    expect(onEstimateChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Edit estimate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min')
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    expect(screen.getByRole('textbox', { name: 'Edit estimate' })).toHaveValue('01:30')
  })

  it('a viewer sees the estimate as text only', async () => {
    const { user } = renderWithProviders(<EditableCard initial={90} canWrite={false} />)

    expect(screen.queryByRole('button', { name: 'Edit estimate' })).not.toBeInTheDocument()
    const text = screen.getByTitle('Estimate')
    expect(text).toHaveTextContent('1hr 30min')
    expect(text.closest('button')).toBeNull()
    expect(text.className).not.toMatch(/hover:bg-|cursor-text/)
    expect(text.querySelector('svg')).toBeNull()
    await user.click(text)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
