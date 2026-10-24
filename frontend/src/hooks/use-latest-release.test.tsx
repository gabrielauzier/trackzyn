import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'

import { useLatestRelease } from '@/hooks/use-latest-release'
import { createTestQueryClient } from '@/test/utils'

const info = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ info }))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  info.get.mockResolvedValue({ features: {}, update_check_repo: 'acme/trackzyn' })
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v9.9.9', html_url: 'https://github.com/acme/trackzyn/releases/v9.9.9' }) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'trackzyn')
})

describe('useLatestRelease', () => {
  it('still queries api.github.com on the web', async () => {
    const { result } = renderHook(() => useLatestRelease(), { wrapper })

    await waitFor(() => expect(result.current.data?.tagName).toBe('v9.9.9'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/acme/trackzyn/releases/latest')
  })

  it('does not call api.github.com on desktop', async () => {
    Object.defineProperty(window, 'trackzyn', { value: { isDesktop: true }, configurable: true })

    const { result } = renderHook(() => useLatestRelease(), { wrapper })

    await waitFor(() => expect(info.get).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})
