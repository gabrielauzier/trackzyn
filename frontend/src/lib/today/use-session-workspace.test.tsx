import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '@/test/utils'
import { useSessionWorkspace } from './use-session-workspace'

const here = { id: 'ws-here', name: 'Here' }
const there = { id: 'ws-there', name: 'Client work' }

vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: here, workspaces: [here, there] }),
}))
vi.mock('@/lib/api', () => ({ authHeaders: () => ({ Authorization: 'Bearer t' }) }))

/** Answers 200 only for the list in the workspace that holds it. */
function serve(lists: Record<string, string>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const listId = String(input).split('/').at(-1)!
    const workspace = (init?.headers as Record<string, string>)['X-Workspace-Id']
    return new Response(null, { status: lists[listId] === workspace ? 200 : 404 })
  })
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('useSessionWorkspace (HOJE-20)', () => {
  it('finds the other workspace that holds the session’s list', async () => {
    const fetch = serve({ 'list-x': there.id })
    const { result } = renderHook(() => useSessionWorkspace('list-x', false), { wrapper })
    await waitFor(() => expect(result.current).toMatchObject({ id: 'ws-there', name: 'Client work' }))
    expect(fetch).toHaveBeenCalledWith('/api/lists/list-x', { headers: { Authorization: 'Bearer t', 'X-Workspace-Id': 'ws-there' } })
  })

  it('answers none for a list of the current workspace the page did not know (an archived list)', async () => {
    const fetch = serve({ 'list-a': here.id })
    const { result } = renderHook(() => useSessionWorkspace('list-a', false), { wrapper })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current).toBeNull())
    expect(fetch).toHaveBeenCalledWith('/api/lists/list-a', { headers: { Authorization: 'Bearer t', 'X-Workspace-Id': 'ws-here' } })
  })

  it('asks nothing for a list the page already knows', () => {
    const fetch = serve({})
    const { result } = renderHook(() => useSessionWorkspace('list-a', true), { wrapper })
    expect(result.current).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
