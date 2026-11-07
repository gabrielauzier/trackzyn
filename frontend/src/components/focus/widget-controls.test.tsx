import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'

import { HIDE_DELAY_MS, WidgetControls } from '@/components/focus/widget-controls'
import type { Display } from '@/lib/focus/display'
import type { TrackzynApi } from '@/lib/platform'
import { renderWithProviders } from '@/test/utils'

type WidgetTask = { id: string; title: string; spent_seconds?: number; subtasks?: { done: number; total: number } }
const TASK: WidgetTask = { id: 'task-a', title: 'Write the quarterly report for the board meeting' }
const SIX = ['Break', 'Notes', 'Pause', 'Skip', 'Complete', 'Expand']

function renderControls(display: Display, options: { task?: WidgetTask | null; pending?: number; canWrite?: boolean; onSubtasks?: () => void } = {}) {
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
      onSubtasks={options.onSubtasks}
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

describe('WidgetControls with subtasks (#16)', () => {
  it('the compact widget shows the subtask counter', () => {
    const { unmount } = renderControls({ mode: 'countdown', seconds: 1930 }, { task: { ...TASK, subtasks: { done: 1, total: 4 } } })

    // Between the title and the timer, in the compact row of the widget (still h-16, 64 px).
    const badge = screen.getByText('1/4')
    const title = screen.getByText(TASK.title)
    const timer = screen.getByRole('timer')
    expect(badge.parentElement).toBe(timer.parentElement)
    expect(title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(badge.compareDocumentPosition(timer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Focus widget' })).toHaveClass('h-16')
    unmount()

    // Without subtasks, or from an answer stored before the counts existed, no counter.
    const { unmount: second } = renderControls({ mode: 'countdown', seconds: 1930 }, { task: { ...TASK, subtasks: { done: 0, total: 0 } } })
    expect(screen.queryByText('0/0')).not.toBeInTheDocument()
    second()
    renderControls({ mode: 'countdown', seconds: 1930 }, { task: TASK })
    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument()
  })

  it('puts the Subtasks icon left of Notes, and it opens the panel', async () => {
    const onSubtasks = vi.fn()
    const { user, widget } = renderControls({ mode: 'countdown', seconds: 60 }, { onSubtasks })
    await user.hover(widget)

    expect(buttonNames()).toEqual(['Break', 'Subtasks', 'Notes', 'Pause', 'Skip', 'Complete', 'Expand'])
    await user.click(screen.getByRole('button', { name: 'Subtasks' }))
    expect(onSubtasks).toHaveBeenCalledTimes(1)
  })

  it('reads Start for a paused task that never counted', async () => {
    const { user, widget, actions } = renderControls({ mode: 'paused', seconds: 2700 }, { task: { ...TASK, spent_seconds: 0 } })
    await user.hover(widget)

    expect(buttonNames()).toEqual(['Break', 'Notes', 'Start', 'Skip', 'Complete', 'Expand'])
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(actions.start).toHaveBeenCalledWith(TASK.id)
  })
})

/** The desktop bridge of the widget window, whose main process reports the cursor (#34). */
function installHoverBridge() {
  const listeners = new Set<(state: { hovering: boolean }) => void>()
  const onWidgetHover = vi.fn((callback: (state: { hovering: boolean }) => void) => {
    listeners.add(callback)
    return () => void listeners.delete(callback)
  })
  Object.defineProperty(window, 'trackzyn', {
    value: { isDesktop: true, windowRole: 'widget', onWidgetHover } as unknown as TrackzynApi,
    configurable: true,
  })
  const report = (hovering: boolean) => act(() => listeners.forEach((listener) => listener({ hovering })))
  return { onWidgetHover, listeners, report }
}

describe('WidgetControls with the cursor read by the desktop (#34)', () => {
  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(window, 'trackzyn')
  })

  it('the controls follow the hover reported by the desktop', () => {
    vi.useFakeTimers()
    const desktop = installHoverBridge()
    const { widget, unmount } = renderControls({ mode: 'countdown', seconds: 60 })
    expect(desktop.onWidgetHover).toHaveBeenCalledTimes(1)
    expect(screen.queryAllByRole('button')).toEqual([])

    // The page's own mouse events do not reach it over the drag region; only the report counts.
    fireEvent.mouseOver(widget)
    expect(screen.queryAllByRole('button')).toEqual([])

    // The cursor enters: the six controls, under the title and the timer, in the same 64 px.
    desktop.report(true)
    expect(buttonNames()).toEqual(SIX)
    expect(widget).toHaveClass('h-16')
    const row = widget.querySelector('[data-widget-controls]')!
    expect(screen.getByRole('timer').compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // A page mouseleave changes nothing either.
    fireEvent.mouseLeave(widget)
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS * 2))
    expect(buttonNames()).toEqual(SIX)

    // It leaves: still there for 150 ms, gone after.
    expect(HIDE_DELAY_MS).toBe(150)
    desktop.report(false)
    act(() => vi.advanceTimersByTime(149))
    expect(buttonNames()).toEqual(SIX)
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getByText(TASK.title)).toBeInTheDocument()

    // Back within 150 ms of leaving: they stay, with no flicker.
    desktop.report(true)
    desktop.report(false)
    act(() => vi.advanceTimersByTime(100))
    desktop.report(true)
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS * 2))
    expect(buttonNames()).toEqual(SIX)

    // And any time later, again and again.
    for (let round = 0; round < 3; round += 1) {
      desktop.report(false)
      act(() => vi.advanceTimersByTime(HIDE_DELAY_MS))
      expect(screen.queryAllByRole('button')).toEqual([])
      desktop.report(true)
      expect(buttonNames()).toEqual(SIX)
    }

    // The keyboard inside the widget keeps them with the cursor away.
    desktop.report(false)
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS))
    fireEvent.focus(widget)
    expect(buttonNames()).toEqual(SIX)

    unmount()
    expect(desktop.listeners.size).toBe(0)
  })

  it('only the controls row is outside the drag region', () => {
    const desktop = installHoverBridge()
    const { widget, unmount } = renderControls({ mode: 'countdown', seconds: 60 })
    const noDrag = () => Array.from(widget.querySelectorAll<HTMLElement>('.\\[-webkit-app-region\\:no-drag\\]'))

    // At rest: the whole window drags, with nothing taken out of it.
    expect(widget).toHaveClass('[-webkit-app-region:drag]')
    expect(noDrag()).toEqual([])

    // With the controls: their row, and only it, takes the clicks; the title and the timer still drag.
    desktop.report(true)
    const row = widget.querySelector<HTMLElement>('[data-widget-controls]')!
    expect(noDrag()).toEqual([row])
    for (const button of screen.getAllByRole('button')) expect(row.contains(button)).toBe(true)
    expect(screen.getByRole('timer').closest('.\\[-webkit-app-region\\:no-drag\\]')).toBeNull()
    expect(screen.getByText(TASK.title).closest('.\\[-webkit-app-region\\:no-drag\\]')).toBeNull()
    unmount()

    // With nothing left in Today, only Expand is out of the drag area.
    renderControls({ mode: 'all_clear', seconds: 0 }, { task: null })
    const clear = screen.getByRole('group', { name: 'Focus widget' })
    const out = Array.from(clear.querySelectorAll<HTMLElement>('.\\[-webkit-app-region\\:no-drag\\]'))
    expect(out).toHaveLength(1)
    expect(out[0]).toContainElement(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('All clear').closest('.\\[-webkit-app-region\\:no-drag\\]')).toBeNull()
  })
})
