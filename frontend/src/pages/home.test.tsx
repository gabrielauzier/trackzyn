import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

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

/** Presses the primary button on `from` and moves the pointer 40 px right: past the 5 px a drag needs. */
function pressAndDrag(from: Element) {
  fireEvent.pointerDown(from, { isPrimary: true, button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(from.ownerDocument, { isPrimary: true, button: 0, clientX: 50, clientY: 10 })
}

const wrapperOf = (id: string) => document.querySelector<HTMLElement>(`[data-list-id="${id}"]`)!

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

  it('lists reorder with the keyboard', async () => {
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

  it('a dropped card takes its new place in the same render as the drop', async () => {
    respond([card(A, 'Alpha', 0), card(B, 'Beta', 1), card(C, 'Gamma', 2)])
    const order = [A, B, C]
    const original = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = order.indexOf(this.dataset.listId ?? '')
      return index < 0 ? original.call(this) : DOMRect.fromRect({ x: index * 300, y: 0, width: 280, height: 200 })
    })
    const { user } = renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const alpha = wrapperOf(A)
    alpha.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')

    // Dropped with no await after it: the query cache tells its subscribers a tick later, and
    // in that tick the card, with its drag transform gone, slid back to its old slot (#31 follow-up).
    fireEvent.keyDown(alpha, { key: ' ', code: 'Space' })
    const rendered = [...document.querySelectorAll<HTMLElement>('[data-list-id]')].map((node) => node.dataset.listId)
    expect(rendered).toEqual([B, A, C])

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
    // Out of the Tab order and not a button: -1 only lets a click focus it, for the selected border.
    expect(wrapper).toHaveAttribute('tabindex', '-1')
    expect(wrapper).not.toHaveAttribute('role')
    expect(within(wrapper).queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('a writer sees the grab cursor on the list card', async () => {
    respond([card(A, 'Alpha', 0)])
    renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const wrapper = wrapperOf(A)
    expect(wrapper).toHaveClass('cursor-grab')
    expect(wrapper).not.toHaveClass('cursor-grabbing')

    // Dragging from the body of the card picks it up.
    pressAndDrag(wrapper)
    expect(wrapper).toHaveClass('cursor-grabbing')
    expect(wrapper).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerUp(document, { isPrimary: true, button: 0, clientX: 50, clientY: 10 })
  })

  it('a clicked list card keeps its accent border until something else is clicked', async () => {
    respond([card(A, 'Alpha', 0), card(B, 'Beta', 1)])
    const { user } = renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const alpha = wrapperOf(A)
    const cardOf = (wrapper: HTMLElement) => wrapper.querySelector<HTMLElement>('[data-slot="card"]')!
    // The border follows the focus of the card's wrapper, so it stays after the click.
    expect(alpha).toHaveClass('group/list')
    expect(cardOf(alpha)).toHaveClass('group-focus/list:border-primary')

    await user.click(within(alpha).getByText('0 pending tasks'))
    expect(alpha).toHaveFocus()

    await user.click(within(wrapperOf(B)).getByText('0 pending tasks'))
    expect(alpha).not.toHaveFocus()
    expect(wrapperOf(B)).toHaveFocus()
  })

  it('a viewer\'s list card also keeps the border after a click, without joining the Tab order', async () => {
    state.canWrite = false
    respond([card(A, 'Alpha', 0)])
    const { user } = renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const alpha = wrapperOf(A)
    expect(alpha).toHaveAttribute('tabindex', '-1')
    await user.click(within(alpha).getByText('0 pending tasks'))
    expect(alpha).toHaveFocus()
  })

  it('a dragged list card shows an accent border until it is dropped', async () => {
    respond([card(A, 'Alpha', 0)])
    renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const wrapper = wrapperOf(A)
    const cardNode = () => wrapper.querySelector<HTMLElement>('[data-slot="card"]')!
    expect(cardNode().className).not.toMatch(/(^|\s)border-primary(\s|$)/)

    pressAndDrag(wrapper)
    expect(cardNode()).toHaveClass('border-primary')

    fireEvent.pointerUp(document, { isPrimary: true, button: 0, clientX: 50, clientY: 10 })
    await waitFor(() => expect(cardNode().className).not.toMatch(/(^|\s)border-primary(\s|$)/))
  })

  it('dragging from the list title does not move the card', async () => {
    respond([card(A, 'Alpha', 0), card(B, 'Beta', 1)])
    renderWithProviders(<HomePage />)

    const title = await screen.findByRole('link', { name: 'Alpha' })
    expect(title).toHaveAttribute('href', `/lists/${A}`)
    expect(title).toHaveClass('cursor-pointer', 'hover:underline')

    const wrapper = wrapperOf(A)
    pressAndDrag(title)
    expect(wrapper).not.toHaveAttribute('aria-pressed', 'true')
    expect(wrapper).not.toHaveClass('cursor-grabbing')
    fireEvent.pointerUp(document, { isPrimary: true, button: 0, clientX: 50, clientY: 10 })
    expect(lists.move).not.toHaveBeenCalled()
  })

  it('dragging from the actions menu does not move the card', async () => {
    respond([card(A, 'Alpha', 0), card(B, 'Beta', 1)])
    renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const wrapper = wrapperOf(A)
    const menu = within(wrapper).getByRole('button', { name: 'Actions' })
    expect(menu).toHaveClass('cursor-default')

    // Closed, the menu opens on pointer down.
    pressAndDrag(menu)
    expect(wrapper).not.toHaveAttribute('aria-pressed', 'true')
    expect(wrapper).not.toHaveClass('cursor-grabbing')
    fireEvent.pointerUp(document, { isPrimary: true, button: 0, clientX: 50, clientY: 10 })
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()

    // Open, pressing it again closes the menu; dragging from it still does not pick the card up.
    pressAndDrag(menu)
    expect(wrapper).not.toHaveAttribute('aria-pressed', 'true')
    expect(wrapper).not.toHaveClass('cursor-grabbing')
    fireEvent.pointerUp(document, { isPrimary: true, button: 0, clientX: 50, clientY: 10 })
    expect(lists.move).not.toHaveBeenCalled()
  })

  it('a viewer sees no grab cursor', async () => {
    state.canWrite = false
    respond([card(A, 'Alpha', 0)])
    renderWithProviders(<HomePage />)

    await screen.findByRole('link', { name: 'Alpha' })
    const wrapper = wrapperOf(A)
    expect(wrapper).not.toHaveClass('cursor-grab')
    expect(wrapper).not.toHaveClass('cursor-grabbing')

    pressAndDrag(wrapper)
    expect(wrapper).not.toHaveClass('cursor-grabbing')
    expect(wrapper).not.toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerUp(document, { isPrimary: true, button: 0, clientX: 50, clientY: 10 })
  })
})
