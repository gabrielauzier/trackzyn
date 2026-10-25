import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { WidgetControls } from '@/components/focus/widget-controls'
import type { Display } from '@/lib/focus/display'
import { renderWithProviders } from '@/test/utils'

const TASK = { id: 'task-a', title: 'Write the quarterly report for the board meeting' }
const SIX = ['Break', 'Notes', 'Pause', 'Skip', 'Complete', 'Expand']

function renderControls(display: Display, options: { task?: typeof TASK | null; pending?: number; canWrite?: boolean } = {}) {
  const actions = {
    start: vi.fn(),
    pause: vi.fn(),
    skip: vi.fn(),
    complete: vi.fn(),
    extend: vi.fn(),
    takeBreak: vi.fn(),
    endBreak: vi.fn(),
  }
  const onNotes = vi.fn()
  const onExpand = vi.fn()
  const onPanelChange = vi.fn()
  const result = renderWithProviders(
    <WidgetControls
      display={display}
      task={options.task === undefined ? TASK : options.task}
      pending={options.pending ?? 2}
      canWrite={options.canWrite ?? true}
      actions={actions}
      onNotes={onNotes}
      onExpand={onExpand}
      onPanelChange={onPanelChange}
    />,
  )
  const widget = screen.getByRole('group', { name: 'Focus widget' })
  return { ...result, actions, onNotes, onExpand, onPanelChange, widget }
}

const buttonNames = () => screen.queryAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)

describe('WidgetControls without the mouse (WIDGET-07)', () => {
  it('shows only the title, cut with an ellipsis, and the timer', () => {
    renderControls({ mode: 'countdown', seconds: 25 * 60 + 7 })

    const title = screen.getByText(TASK.title)
    expect(title).toHaveClass('truncate')
    expect(screen.getByRole('timer')).toHaveTextContent('00:25:07')
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('hides the controls again when the mouse leaves', async () => {
    const { user, widget } = renderControls({ mode: 'countdown', seconds: 60 })
    await user.hover(widget)
    expect(buttonNames()).toEqual(SIX)

    await user.unhover(widget)
    await waitFor(() => expect(screen.queryAllByRole('button')).toEqual([]))
    expect(screen.getByText(TASK.title)).toBeInTheDocument()
  })

  it('hides the controls when the mouse leaves after clicking one', async () => {
    const { user, widget } = renderControls({ mode: 'countdown', seconds: 60 })
    await user.hover(widget)
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    await user.unhover(widget)
    await waitFor(() => expect(screen.queryAllByRole('button')).toEqual([]))
  })
})

describe('WidgetControls with the mouse (WIDGET-08)', () => {
  it('shows the six controls with Pause while the task counts', async () => {
    const { user, widget } = renderControls({ mode: 'countup', seconds: 90 })
    await user.hover(widget)

    expect(buttonNames()).toEqual(SIX)
    expect(screen.getByRole('timer')).toHaveTextContent('00:01:30')
  })

  it('shows Resume instead of Pause while the task is paused', async () => {
    const { user, widget } = renderControls({ mode: 'paused', seconds: 600 })
    await user.hover(widget)

    expect(buttonNames()).toEqual(['Break', 'Notes', 'Resume', 'Skip', 'Complete', 'Expand'])
  })

  it('shows the controls while the keyboard is inside the widget', async () => {
    const { user } = renderControls({ mode: 'countdown', seconds: 60 })
    await user.tab()

    expect(buttonNames()).toEqual(SIX)
  })

  it('keeps only Expand for a member who cannot change the workspace', async () => {
    const { user, widget } = renderControls({ mode: 'countdown', seconds: 60 }, { canWrite: false })
    await user.hover(widget)

    expect(buttonNames()).toEqual(['Expand'])
  })
})

describe('WidgetControls actions (WIDGET-12)', () => {
  it('Pause, Skip, Complete, Notes and Expand call their action', async () => {
    const { user, widget, actions, onNotes, onExpand } = renderControls({ mode: 'countdown', seconds: 60 })
    await user.hover(widget)

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(actions.pause).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(actions.skip).toHaveBeenCalledWith(TASK.id)
    await user.click(screen.getByRole('button', { name: 'Complete' }))
    expect(actions.complete).toHaveBeenCalledWith(TASK.id)
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    expect(onNotes).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('Resume starts the paused task again', async () => {
    const { user, widget, actions } = renderControls({ mode: 'paused', seconds: 600 })
    await user.hover(widget)

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(actions.start).toHaveBeenCalledWith(TASK.id)
  })

  it('Skip is disabled with a single pending task (FOCUS-07)', async () => {
    const { user, widget } = renderControls({ mode: 'countdown', seconds: 60 }, { pending: 1 })
    await user.hover(widget)

    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled()
  })

  it('Break opens the picker, grows the widget while it is open and takes the break picked', async () => {
    const { user, widget, actions, onPanelChange } = renderControls({ mode: 'countdown', seconds: 60 })
    await user.hover(widget)

    await user.click(screen.getByRole('button', { name: 'Break' }))
    expect(onPanelChange).toHaveBeenLastCalledWith(true)
    // The picker sits outside the widget: leaving the widget for it keeps it open.
    await user.unhover(widget)
    await user.click(screen.getByRole('button', { name: '10 min' }))

    expect(actions.takeBreak).toHaveBeenCalledWith(10)
    expect(onPanelChange).toHaveBeenLastCalledWith(false)
  })

  it('during a break shows the break, its timer and End break, which ends it (BREAK-04)', async () => {
    const { user, widget, actions } = renderControls({ mode: 'break', seconds: 4 * 60 })
    expect(screen.getByText('Break')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('00:04:00')
    await user.hover(widget)

    expect(buttonNames()).toEqual(['End break', 'Expand'])
    await user.click(screen.getByRole('button', { name: 'End break' }))
    expect(actions.endBreak).toHaveBeenCalledTimes(1)
  })
})

describe('WidgetControls at 00:00:00 (WIDGET-13)', () => {
  it('without the mouse shows the title and 00:00:00 only', () => {
    renderControls({ mode: 'awaiting_extend', seconds: 0 })

    expect(screen.getByText(TASK.title)).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:00')
    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it('with the mouse shows Extend and Complete with the other controls', async () => {
    const { user, widget, actions } = renderControls({ mode: 'awaiting_extend', seconds: 0 })
    await user.hover(widget)

    expect(buttonNames()).toEqual(['Extend', 'Complete', 'Break', 'Notes', 'Skip', 'Expand'])
    await user.click(screen.getByRole('button', { name: 'Extend' }))
    expect(actions.extend).toHaveBeenCalledWith(TASK.id)
    await user.click(screen.getByRole('button', { name: 'Complete' }))
    expect(actions.complete).toHaveBeenCalledWith(TASK.id)
  })
})

describe('WidgetControls with nothing left in Today (WIDGET-16)', () => {
  it.each(['all_clear', 'idle'] as const)('in %s shows All clear and Expand, with or without the mouse', async (mode) => {
    const { user, widget, onExpand } = renderControls({ mode, seconds: 0 }, { task: null })

    expect(screen.getByText('All clear')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(buttonNames()).toEqual(['Expand'])
    await user.hover(widget)
    expect(buttonNames()).toEqual(['Expand'])

    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})

describe('WidgetControls dragging (WIDGET-06)', () => {
  it('drags by the background and keeps every button out of the drag area', async () => {
    const { user, widget } = renderControls({ mode: 'countdown', seconds: 60 })
    await user.hover(widget)

    expect(widget).toHaveClass('[-webkit-app-region:drag]')
    for (const button of screen.getAllByRole('button')) {
      expect(button.closest('.\\[-webkit-app-region\\:no-drag\\]'), button.getAttribute('aria-label') ?? '').not.toBeNull()
    }
  })
})
