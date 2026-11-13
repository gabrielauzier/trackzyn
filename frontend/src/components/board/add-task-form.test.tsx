import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { AddTaskForm } from '@/components/board/add-task-form'
import { tasks } from '@/lib/api'
import { renderWithProviders, PLAIN_TASK_FIELDS } from '@/test/utils'
import type { Task } from '@/types'

vi.mock('@/lib/api', () => ({
  tasks: { create: vi.fn() },
}))

const LIST = '11111111-1111-4111-8111-111111111111'

const created: Task = { ...PLAIN_TASK_FIELDS,
  id: '22222222-2222-4222-8222-222222222222',
  list_id: LIST,
  title: 'Write the report',
  notes: '',
  estimate_minutes: null,
  column: 'today',
  position: 0,
  completed_at: null,
  created_at: '2026-10-24T10:00:00Z',
  subtasks: [],
  created_via: null,
  scheduled_on: null,
  scheduled_time: null,
  series: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasks.create).mockResolvedValue(created)
})

async function open() {
  const rendered = renderWithProviders(<AddTaskForm listId={LIST} column="today" />)
  await rendered.user.click(screen.getByRole('button', { name: 'Add task' }))
  return rendered
}

describe('AddTaskForm', () => {
  it('blocks an empty title', async () => {
    const { user } = await open()

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Enter a title')).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('blocks a title over 255 characters', async () => {
    const { user } = await open()

    await user.click(screen.getByLabelText('Title'))
    await user.paste('a'.repeat(256))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Use at most 255 characters')).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('shows the estimate as an HH:MM field with no label, with Cancel and Add as icons on its row', async () => {
    await open()

    expect(screen.queryByText('Estimate (min)')).not.toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Estimate' })
    expect(field).toHaveAttribute('placeholder', 'HH:MM')
    // The card's inline field, not a form-sized Input.
    expect(field).toHaveAttribute('data-slot', 'duration-input')
    // One row: the field, then Cancel and Add, both icon-only (option B, 2026-11-06), so the
    // form fits a narrow column without cutting a button.
    const row = field.closest<HTMLElement>('[data-slot="estimate-row"]')!
    expect(row).not.toBeNull()
    const cancel = within(row).getByRole('button', { name: 'Cancel' })
    const add = within(row).getByRole('button', { name: 'Add' })
    expect(within(row).getAllByRole('button')).toEqual([cancel, add])
    for (const button of [cancel, add]) {
      expect(button.textContent?.trim()).toBe('')
      expect(button.querySelector('svg')).not.toBeNull()
    }
    expect(add).toHaveAttribute('type', 'submit')
    expect(field.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // No other buttons in the form.
    expect(screen.getAllByRole('button')).toEqual([cancel, add])
  })

  it('closes from the Cancel icon without creating anything', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('puts the colon after the hours as the digits are typed', async () => {
    const { user } = await open()

    await user.type(screen.getByRole('textbox', { name: 'Estimate' }), '0130')

    expect(screen.getByRole('textbox', { name: 'Estimate' })).toHaveValue('01:30')
  })

  it('blocks an estimate above 24:00', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    const field = screen.getByRole('textbox', { name: 'Estimate' })
    await user.type(field, '2500')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Use 00:01 to 24:00')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('blocks minutes above 59', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.type(screen.getByRole('textbox', { name: 'Estimate' }), '0175')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Minutes from 00 to 59')).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('blocks a half-typed estimate', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.type(screen.getByRole('textbox', { name: 'Estimate' }), '013')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Use HH:MM')).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('sends a null estimate when none is given', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(tasks.create).toHaveBeenCalledWith({
        list_id: LIST,
        title: 'Write the report',
        estimate_minutes: null,
        column: 'today',
      }),
    )
  })

  it('sends the HH:MM estimate in minutes', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.type(screen.getByRole('textbox', { name: 'Estimate' }), '0130')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(tasks.create).toHaveBeenCalledWith({
        list_id: LIST,
        title: 'Write the report',
        estimate_minutes: 90,
        column: 'today',
      }),
    )
  })

  it('names the empty estimate field in a tooltip on hover', async () => {
    const { user } = await open()

    await user.hover(screen.getByRole('textbox', { name: 'Estimate' }))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Estimate')
    expect(tooltip).toHaveTextContent('Leave empty for no estimate')
  })

  it('shows no tooltip over an estimate that has a value', async () => {
    const { user } = await open()
    const field = screen.getByRole('textbox', { name: 'Estimate' })
    await user.type(field, '0130')
    await user.unhover(field)

    await user.hover(field)
    // Longer than the 200 ms the tooltip waits before opening.
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows a 422 from the server and keeps the form', async () => {
    vi.mocked(tasks.create).mockRejectedValue({
      response: { status: 422, data: { detail: [{ loc: ['body', 'title'], msg: 'String should have at most 255 characters' }] } },
    })
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('title: String should have at most 255 characters')
    expect(screen.getByLabelText('Title')).toHaveValue('Write the report')
  })
})
