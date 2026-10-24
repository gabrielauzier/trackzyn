import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import ArchivedListsPage from '@/pages/archived-lists'
import HomePage from '@/pages/home'
import { lists } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { ListCard } from '@/types'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { email: 'ana@example.com', preferences: {} } }),
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: true }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function card(id: string, name: string, isArchived: boolean): ListCard {
  return {
    id,
    workspace_id: 'ws',
    name,
    color: 2,
    position: 0,
    is_archived: isArchived,
    created_by_user_id: null,
    created_at: '2026-10-24T10:00:00Z',
    pending_count: 1,
    preview: [],
  }
}

const archived = card('11111111-1111-4111-8111-111111111111', 'Old project', true)
const active = card('22222222-2222-4222-8222-222222222222', 'Current work', false)

beforeEach(() => {
  vi.clearAllMocks()
  // The server filters by the archived flag; answer the same way.
  vi.mocked(lists.list).mockImplementation(async (params = {}) => ({
    timezone: 'America/Sao_Paulo',
    lists: params.archived ? [archived] : [active],
  }))
  vi.mocked(lists.update).mockResolvedValue({ ...archived, is_archived: false })
})

describe('ArchivedListsPage', () => {
  it('shows the archived list here and not on the home', async () => {
    renderWithProviders(<ArchivedListsPage />)

    expect(await screen.findByRole('link', { name: 'Old project' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Current work' })).not.toBeInTheDocument()
    expect(lists.list).toHaveBeenCalledWith({ archived: true })
  })

  it('leaves the archived list off the home', async () => {
    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('link', { name: 'Current work' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Old project' })).not.toBeInTheDocument()
  })

  it('unarchives from the card menu', async () => {
    const { user } = renderWithProviders(<ArchivedListsPage />)

    await screen.findByRole('link', { name: 'Old project' })
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: 'Unarchive' }))

    await waitFor(() => expect(lists.update).toHaveBeenCalledWith(archived.id, { is_archived: false }))
  })

  it('shows an empty state when nothing is archived', async () => {
    vi.mocked(lists.list).mockResolvedValue({ timezone: 'America/Sao_Paulo', lists: [] })
    renderWithProviders(<ArchivedListsPage />)

    expect(await screen.findByText('No archived lists')).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})
