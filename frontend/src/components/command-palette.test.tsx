import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { CommandPalette } from '@/components/command-palette'
import { renderWithProviders } from '@/test/utils'

const state = vi.hoisted(() => ({ isSuperuser: false }))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { email: 'ana@example.com', is_superuser: state.isSuperuser } }),
}))
vi.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({ isLoading: false, features: {}, isEnabled: () => false, updateCheckRepo: null }),
}))

const options = () => screen.getAllByRole('option').map((option) => option.textContent ?? '')

afterEach(() => {
  state.isSuperuser = false
  localStorage.clear()
})

describe('CommandPalette', () => {
  it('the palette hides admin screens from non-admins', async () => {
    const { user } = renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />)

    await screen.findAllByRole('option')
    const home = options()
    expect(home.some((text) => text.includes('Reports'))).toBe(true)
    for (const hidden of ['Files', 'Components', 'Upload a file']) {
      expect(home.some((text) => text.includes(hidden)), hidden).toBe(false)
    }

    // Searching for them finds nothing either.
    for (const query of ['files', 'components', 'upload', 'arquivo']) {
      await user.clear(screen.getByRole('combobox'))
      await user.type(screen.getByRole('combobox'), query)
      await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
    }
  })

  it('lists Files, Components and Upload a file for a superuser', async () => {
    state.isSuperuser = true
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />)

    await screen.findAllByRole('option')
    const home = options()
    for (const shown of ['Files', 'Components', 'Upload a file']) {
      expect(home.some((text) => text.includes(shown)), shown).toBe(true)
    }
  })
})
