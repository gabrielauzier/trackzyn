import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import { admin } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'

import { DesktopTitlebarSettings } from './desktop-titlebar-settings'

vi.mock('@/lib/api', () => ({
  admin: { getSetting: vi.fn(), updateSetting: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(admin.updateSetting).mockImplementation(async (key, value) => ({ key, value }))
})

it('offers the four bars, with the page in a card chosen while nothing is saved', async () => {
  vi.mocked(admin.getSetting).mockRejectedValue(new Error('Setting not found'))
  renderWithProviders(<DesktopTitlebarSettings />)

  const group = await screen.findByRole('radiogroup', { name: 'Desktop app top bar' })
  expect(group).toBeInTheDocument()
  const options = screen.getAllByRole('radio')
  expect(options.map((option) => option.textContent)).toEqual([
    expect.stringContaining('Page in a card'),
    expect.stringContaining('Thin bar'),
    expect.stringContaining('Bar with search'),
    expect.stringContaining('No bar'),
  ])
  await waitFor(() => expect(screen.getByRole('radio', { name: /Page in a card/ })).toBeChecked())
})

it('saves a bar for everyone and has the desktop app read it again', async () => {
  vi.mocked(admin.getSetting).mockResolvedValueOnce({ key: 'desktop_titlebar', value: 'thin' }).mockResolvedValue({ key: 'desktop_titlebar', value: 'integrated' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  queryClient.setQueryData(['admin', 'desktop-titlebar'], { style: 'thin' })
  const { user } = renderWithProviders(<DesktopTitlebarSettings />, { queryClient })

  await waitFor(() => expect(screen.getByRole('radio', { name: /Thin bar/ })).toBeChecked())
  await user.click(screen.getByRole('radio', { name: /No bar/ }))

  expect(admin.updateSetting).toHaveBeenCalledWith('desktop_titlebar', 'integrated')
  await waitFor(() => expect(queryClient.getQueryState(['admin', 'desktop-titlebar'])?.isInvalidated).toBe(true))
  await waitFor(() => expect(screen.getByRole('radio', { name: /No bar/ })).toBeChecked())
})
