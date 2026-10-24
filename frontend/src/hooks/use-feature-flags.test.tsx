import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'

import { useFeatureFlags } from '@/hooks/use-feature-flags'
import { createTestQueryClient } from '@/test/utils'

const info = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ info }))

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFeatureFlags', () => {
  it('reports a flag on when the server says so', async () => {
    info.get.mockResolvedValue({ features: { beta: true }, update_check_repo: null })

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled('beta')).toBe(true)
  })

  it('reports a flag off when the server says so', async () => {
    info.get.mockResolvedValue({ features: { beta: false }, update_check_repo: null })

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled('beta')).toBe(false)
  })

  it('defaults to off while still loading', () => {
    // A route gated on a flag must not flash while /api/info is in flight.
    info.get.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isEnabled('beta')).toBe(false)
  })

  it('defaults to off when /api/info omits the features block', async () => {
    info.get.mockResolvedValue({})

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isEnabled('beta')).toBe(false)
    expect(result.current.updateCheckRepo).toBeNull()
  })

  it('exposes the release-check repository', async () => {
    info.get.mockResolvedValue({ features: {}, update_check_repo: 'acme/app' })

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await waitFor(() => expect(result.current.updateCheckRepo).toBe('acme/app'))
  })
})
