import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { ListDialog } from '@/components/lists/list-dialog'
import { lists } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { TaskList } from '@/types'

vi.mock('@/lib/api', () => ({
  lists: { create: vi.fn(), update: vi.fn() },
}))

const saved: TaskList = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: 'ws',
  name: 'Work',
  color: 5,
  position: 0,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-24T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(lists.create).mockResolvedValue(saved)
  vi.mocked(lists.update).mockResolvedValue(saved)
})

describe('ListDialog', () => {
  it('blocks an empty name', async () => {
    const { user } = renderWithProviders(<ListDialog open onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(lists.create).not.toHaveBeenCalled()
  })

  it('blocks a name over 100 characters', async () => {
    const { user } = renderWithProviders(<ListDialog open onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 'a'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Use at most 100 characters')).toBeInTheDocument()
    expect(lists.create).not.toHaveBeenCalled()
  })

  it('sends the chosen colour with the name', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(<ListDialog open onClose={onClose} />)

    await user.type(screen.getByLabelText('Name'), 'Work')
    await user.click(screen.getByRole('radio', { name: 'Color 5' }))
    expect(screen.getByRole('radio', { name: 'Color 5' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(lists.create).toHaveBeenCalledWith({ name: 'Work', color: 5 }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('offers the eight palette colours', () => {
    renderWithProviders(<ListDialog open onClose={vi.fn()} />)

    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => radio.style.backgroundColor)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--chart-${n})`),
    )
  })

  it('shows a 422 from the server and stays open', async () => {
    vi.mocked(lists.create).mockRejectedValue({
      response: { status: 422, data: { detail: [{ loc: ['body', 'name'], msg: 'String should have at most 100 characters' }] } },
    })
    const onClose = vi.fn()
    const { user } = renderWithProviders(<ListDialog open onClose={onClose} />)

    await user.type(screen.getByLabelText('Name'), 'Work')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name: String should have at most 100 characters')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renames and recolours an existing list', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(<ListDialog open list={saved} onClose={onClose} />)

    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('Work')
    expect(screen.getByRole('radio', { name: 'Color 5' })).toHaveAttribute('aria-checked', 'true')

    await user.clear(name)
    await user.type(name, 'Home')
    await user.click(screen.getByRole('radio', { name: 'Color 2' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(lists.update).toHaveBeenCalledWith(saved.id, { name: 'Home', color: 2 }))
    expect(lists.create).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
