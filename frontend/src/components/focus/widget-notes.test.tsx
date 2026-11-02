import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { WidgetNotes } from '@/components/focus/widget-notes'
import type { TrackzynApi } from '@/lib/platform'
import { placeCaretAtEnd, renderWithProviders, selectContents } from '@/test/utils'
import type { Task } from '@/types'

const api = vi.hoisted(() => ({ tasks: { get: vi.fn(), update: vi.fn() } }))
vi.mock('@/lib/api', () => api)

const TASK: Task = {
  id: 'task-a',
  list_id: 'list-1',
  title: 'Write the report',
  notes: 'Ask Ana for the numbers',
  estimate_minutes: 30,
  column: 'today',
  position: 0,
  completed_at: null,
  created_at: '2026-10-24T12:00:00.000Z',
  subtasks: [],
}

let bridge: { resizeWidget: ReturnType<typeof vi.fn> }

beforeEach(() => {
  api.tasks.get.mockResolvedValue(TASK)
  api.tasks.update.mockImplementation(async (_id: string, payload: { notes: string }) => ({ ...TASK, ...payload }))
  bridge = { resizeWidget: vi.fn(async () => undefined) }
  Object.defineProperty(window, 'trackzyn', { value: { isDesktop: true, ...bridge } as unknown as TrackzynApi, configurable: true })
})

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
  vi.clearAllMocks()
})

function renderNotes() {
  const onClose = vi.fn()
  const result = renderWithProviders(<WidgetNotes taskId={TASK.id} onClose={onClose} />)
  return { ...result, onClose }
}

const field = () => screen.findByRole('textbox', { name: 'Notes' })

describe('WidgetNotes (WIDGET-14)', () => {
  it('grows the widget and shows the notes of the task in focus', async () => {
    renderNotes()

    expect(await field()).toHaveTextContent('Ask Ana for the numbers')
    expect(api.tasks.get).toHaveBeenCalledWith('task-a')
    expect(bridge.resizeWidget.mock.calls).toEqual([['notes']])
    await waitFor(async () => expect(await field()).toHaveFocus())
  })
})

describe('WidgetNotes saving (WIDGET-15)', () => {
  it('on blur sends the text, then shrinks the widget back and closes', async () => {
    const { user, onClose } = renderNotes()
    const notes = await field()
    selectContents(notes)
    await user.paste('Numbers from Ana arrived')
    await user.tab()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(api.tasks.update.mock.calls).toEqual([['task-a', { notes: '<p>Numbers from Ana arrived</p>' }]])
    expect(bridge.resizeWidget.mock.calls).toEqual([['notes'], ['compact']])
  })

  it('refreshes the task, so the task dialog shows the same text', async () => {
    const { user, queryClient } = renderNotes()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const notes = await field()
    placeCaretAtEnd(notes)
    await user.paste('!')
    await user.tab()

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lists'] }))
  })

  it('without a change, sends nothing and still shrinks back', async () => {
    const { user, onClose } = renderNotes()
    const notes = await field()
    await waitFor(() => expect(notes).toHaveFocus())
    await user.tab()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(bridge.resizeWidget.mock.calls).toEqual([['notes'], ['compact']])
  })

  it('saves exactly 10 000 characters of stored text', async () => {
    const { user, onClose } = renderNotes()
    const notes = await field()
    selectContents(notes)
    // The limit counts the stored text, which has the paragraph tags in it: <p> and </p> take 7.
    await user.paste('a'.repeat(9_993))
    await user.tab()

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(api.tasks.update).toHaveBeenCalledWith('task-a', { notes: `<p>${'a'.repeat(9_993)}</p>` })
  })

  it('blocks more than 10 000 characters: says so, sends nothing and stays open', async () => {
    const { user, onClose } = renderNotes()
    const notes = await field()
    selectContents(notes)
    await user.paste('a'.repeat(9_994))
    await user.tab()

    expect(await screen.findByText('Use at most 10,000 characters')).toBeInTheDocument()
    expect(notes).toHaveAttribute('aria-invalid', 'true')
    expect(api.tasks.update).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(bridge.resizeWidget.mock.calls).toEqual([['notes']])
  })

  it('when the server refuses, shows the error and keeps the text open', async () => {
    api.tasks.update.mockRejectedValue(new Error('offline'))
    const { user, onClose } = renderNotes()
    const notes = await field()
    placeCaretAtEnd(notes)
    await user.paste('!')
    await user.tab()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(notes).toHaveTextContent('Ask Ana for the numbers!')
    expect(onClose).not.toHaveBeenCalled()
    expect(bridge.resizeWidget.mock.calls).toEqual([['notes']])
  })
})
