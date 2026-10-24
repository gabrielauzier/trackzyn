import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import HomePage from '@/pages/home'
import { lists } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { ListCard, ListsResponse } from '@/types'

const state = vi.hoisted(() => ({
  user: {
    email: 'joao.silva@example.com',
    preferences: { display_name: 'Ana' } as { display_name?: string },
  },
  canWrite: true,
}))

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: state.user }),
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({
    current: { id: 'ws', name: 'Synthetic workspace', timezone: null },
    canWrite: state.canWrite,
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function card(id: string, name: string, position: number): ListCard {
  return {
    id,
    workspace_id: 'ws',
    name,
    color: position + 1,
    position,
    is_archived: false,
    created_by_user_id: null,
    created_at: '2026-10-24T10:00:00Z',
    pending_count: 0,
    preview: [],
  }
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

function respond(cards: ListCard[], timezone = 'America/Sao_Paulo') {
  vi.mocked(lists.list).mockResolvedValue({ timezone, lists: cards } satisfies ListsResponse)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.user = { email: 'joao.silva@example.com', preferences: { display_name: 'Ana' } }
  state.canWrite = true
  vi.mocked(lists.move).mockResolvedValue(undefined)
  respond([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('HomePage', () => {
  it('shows only the Create list card in an empty workspace', async () => {
    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('button', { name: 'Create list' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your lists' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(lists.list).toHaveBeenCalledWith({ archived: false })
  })

  it('opens the create dialog from the Create list card', async () => {
    const { user } = renderWithProviders(<HomePage />)

    await user.click(await screen.findByRole('button', { name: 'Create list' }))

    expect(await screen.findByRole('dialog', { name: 'Create list' })).toBeInTheDocument()
  })

  it('opens the create dialog when the sidebar sends ?new=1', async () => {
    renderWithProviders(<HomePage />, { route: '/?new=1' })

    expect(await screen.findByRole('dialog', { name: 'Create list' })).toBeInTheDocument()
  })

  it('greets with the display name in the workspace timezone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 02:00 UTC is still the previous evening, 23:00, in São Paulo.
    vi.setSystemTime(new Date('2026-10-24T02:00:00Z'))

    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Good evening, Ana' })).toBeInTheDocument()
    expect(screen.getByText('Time to wrap up the day calmly.')).toBeInTheDocument()
  })

  it('greets with the e-mail before the @ when there is no display name', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T13:00:00Z')) // 10:00 in São Paulo
    state.user = { email: 'joao.silva@example.com', preferences: {} }

    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Good morning, joao.silva' })).toBeInTheDocument()
    expect(screen.getByText('Start with what matters most.')).toBeInTheDocument()
  })

  it('shows the cards in server order before the Create list card', async () => {
    respond([card(A, 'Alpha', 0), card(B, 'Beta', 1)])
    renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Alpha', 'Beta'])
    expect(screen.getByRole('button', { name: 'Create list' })).toBeInTheDocument()
  })

  it('reorders a card and sends the list it now sits before', async () => {
    respond([card(A, 'Alpha', 0), card(B, 'Beta', 1), card(C, 'Gamma', 2)])
    // jsdom has no layout: lay the three cards out in a row so the keyboard
    // sensor can find the card to the right.
    const order = [A, B, C]
    const original = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = order.indexOf(this.dataset.listId ?? '')
      return index < 0 ? original.call(this) : DOMRect.fromRect({ x: index * 300, y: 0, width: 280, height: 200 })
    })
    const { user } = renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const alpha = document.querySelector<HTMLElement>(`[data-list-id="${A}"]`)!
    alpha.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')
    await user.keyboard(' ')

    await waitFor(() => expect(lists.move).toHaveBeenCalledWith(A, C))
  })

  it('lets a viewer neither create nor drag', async () => {
    state.canWrite = false
    respond([card(A, 'Alpha', 0)])
    renderWithProviders(<HomePage />, { route: '/?new=1' })

    await screen.findByRole('link', { name: 'Alpha' })
    expect(screen.queryByRole('button', { name: 'Create list' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const wrapper = document.querySelector<HTMLElement>(`[data-list-id="${A}"]`)!
    expect(wrapper).not.toHaveAttribute('aria-roledescription')
    expect(wrapper).not.toHaveAttribute('tabindex')
    expect(within(wrapper).queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
  })
})
