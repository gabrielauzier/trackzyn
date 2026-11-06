import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sessions } from '@/lib/api'
import { i18n, placeCaretAtEnd, renderWithProviders } from '@/test/utils'
import type { ListCard, Task } from '@/types'
import { NewSessionTaskDialog } from './new-session-task-dialog'

vi.mock('@/lib/api', () => ({ sessions: { createTask: vi.fn() } }))

const list = (id: string, name: string, color: number): ListCard => ({
  id,
  workspace_id: 'ws',
  name,
  color,
  position: 0,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-01T00:00:00.000Z',
  pending_count: 0,
  preview: [],
})
const LISTS = [list('frete', 'Frete', 1), list('adset', 'ADSet', 2)]
const CREATED = { id: 't9', list_id: 'adset', title: 'Reunião com o jurídico', column: 'done', created_via: 'Agenda' } as unknown as Task

function dialog(props: Partial<Parameters<typeof NewSessionTaskDialog>[0]> = {}) {
  const handlers = { onOpenChange: vi.fn(), onCreated: vi.fn() }
  const result = renderWithProviders(
    <NewSessionTaskDialog open lists={LISTS} defaultListId="adset" defaultTitle="Reunião com o jurídico" {...handlers} {...props} />,
  )
  return { ...result, ...handlers }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sessions.createTask).mockResolvedValue(CREATED)
})

describe('NewSessionTaskDialog', () => {
  it('PICK-12 opens with the list and the title given, the notes switch off and the editor hidden', async () => {
    dialog()
    const modal = await screen.findByRole('dialog', { name: 'New task' })
    expect(within(modal).getByRole('combobox', { name: 'List' })).toHaveTextContent('ADSet')
    expect(within(modal).getByLabelText('Title')).toHaveValue('Reunião com o jurídico')
    // The board's HH:MM field, labelled like the task dialog, with its hint.
    const estimate = within(modal).getByRole('textbox', { name: 'Estimate' })
    expect(estimate).toHaveValue('')
    expect(estimate).toHaveAttribute('placeholder', 'HH:MM')
    expect(within(modal).queryByText('Estimate (min)')).toBeNull()
    expect(within(modal).getByText('HH:MM · leave empty for no estimate')).toBeInTheDocument()
    expect(within(modal).getByRole('switch', { name: 'Add notes' })).toHaveAttribute('aria-checked', 'false')
    expect(within(modal).queryByLabelText('Notes')).toBeNull()
    expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(modal).getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('PICK-12 starts on the first list when the list given is not an active one', async () => {
    dialog({ defaultListId: 'archived-list' })
    const modal = await screen.findByRole('dialog', { name: 'New task' })
    expect(within(modal).getByRole('combobox', { name: 'List' })).toHaveTextContent('Frete')
  })

  it('PICK-13 shows the notes editor while Add notes is on', async () => {
    const { user } = dialog()
    await user.click(await screen.findByRole('switch', { name: 'Add notes' }))
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Add notes' }))
    expect(screen.queryByLabelText('Notes')).toBeNull()
  })

  it('PICK-14 shows the board messages for an empty title, 256 characters and an estimate of 00:00, and sends nothing', async () => {
    const { user } = dialog({ defaultTitle: '' })
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Enter a title')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Title'), 'a'.repeat(256))
    await user.type(screen.getByRole('textbox', { name: 'Estimate' }), '0000')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Use at most 255 characters')).toBeInTheDocument()
    expect(screen.getByText('Use 00:01 to 24:00')).toBeInTheDocument()
    expect(sessions.createTask).not.toHaveBeenCalled()
  })

  it('PICK-14 shows the board messages for minutes above 59 and a half-typed estimate, and sends nothing', async () => {
    const { user } = dialog()
    const estimate = await screen.findByRole('textbox', { name: 'Estimate' })
    await user.type(estimate, '0175')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Minutes from 00 to 59')).toBeInTheDocument()

    await user.clear(estimate)
    await user.type(estimate, '013')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Use HH:MM')).toBeInTheDocument()
    expect(sessions.createTask).not.toHaveBeenCalled()
  })

  it('PICK-15 sends the list, the title, the estimate and the notes while the switch is on, then hands the task over', async () => {
    const { user, onCreated } = dialog()
    await user.type(await screen.findByRole('textbox', { name: 'Estimate' }), '0045')
    await user.click(screen.getByRole('switch', { name: 'Add notes' }))
    placeCaretAtEnd(screen.getByLabelText('Notes'))
    await user.paste('Pauta')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(sessions.createTask).toHaveBeenCalledWith({ list_id: 'adset', title: 'Reunião com o jurídico', estimate_minutes: 45, notes: '<p>Pauta</p>' }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED))
  })

  it('PICK-15 sends no notes after the switch is turned off again, whatever was typed', async () => {
    const { user } = dialog()
    await user.click(await screen.findByRole('switch', { name: 'Add notes' }))
    placeCaretAtEnd(screen.getByLabelText('Notes'))
    await user.paste('Draft')
    await user.click(screen.getByRole('switch', { name: 'Add notes' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(sessions.createTask).toHaveBeenCalledTimes(1))
    expect(vi.mocked(sessions.createTask).mock.calls[0]![0]).toEqual({ list_id: 'adset', title: 'Reunião com o jurídico', estimate_minutes: null })
  })

  it('PICK-15 sends the list picked in the modal', async () => {
    const { user } = dialog()
    await user.click(await screen.findByRole('combobox', { name: 'List' }))
    await user.click(await screen.findByRole('option', { name: 'Frete' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(sessions.createTask).toHaveBeenCalledWith(expect.objectContaining({ list_id: 'frete' })))
  })

  it('PICK-18 stays open with what was typed and shows the API error when the creation fails', async () => {
    vi.mocked(sessions.createTask).mockRejectedValue({ response: { status: 409, data: { detail: 'List is archived' } } })
    const { user, onCreated, onOpenChange } = dialog()
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('List is archived')
    expect(screen.getByLabelText('Title')).toHaveValue('Reunião com o jurídico')
    expect(onCreated).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('PICK-19 closes on Cancel and on Esc without sending anything', async () => {
    const { user, onOpenChange } = dialog()
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    onOpenChange.mockClear()
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(sessions.createTask).not.toHaveBeenCalled()
  })

  it('reads Nova tarefa, Lista and Adicionar anotações in Portuguese, with the Concluída and via Agenda note', async () => {
    await i18n.changeLanguage('pt-BR')
    dialog()
    const modal = await screen.findByRole('dialog', { name: 'Nova tarefa' })
    expect(within(modal).getByRole('combobox', { name: 'Lista' })).toBeInTheDocument()
    expect(within(modal).getByRole('switch', { name: 'Adicionar anotações' })).toBeInTheDocument()
    expect(within(modal).getByText('Concluída')).toBeInTheDocument()
    expect(within(modal).getByText('via Agenda')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})
