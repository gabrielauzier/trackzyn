import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workspaces as workspacesApi } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { Workspace } from '@/types'
import WorkspaceSettingsPage from './workspace-settings'

const state = vi.hoisted(() => ({
  canManage: true,
  workspace: null as unknown as Workspace,
}))

vi.mock('@/lib/api', () => ({
  workspaces: {
    update: vi.fn(),
    listMembers: vi.fn(async () => []),
    stats: vi.fn(async () => ({ members: 1, files: 0 })),
  },
  timezones: { list: vi.fn(async () => ({ default: 'UTC', available: ['UTC', 'America/Sao_Paulo'] })) },
  auth: { config: vi.fn(async () => ({ local_auth_enabled: true })) },
}))
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'a@b.c' } }) }))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({
    current: state.workspace,
    canManage: state.canManage,
    canWrite: state.canManage,
    workspaces: [state.workspace],
    refresh: vi.fn(),
    switchWorkspace: vi.fn(),
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspace = (minSessionMinutes: number | null): Workspace => ({
  id: 'ws',
  name: 'Personal',
  is_archived: false,
  locale: 'en',
  timezone: null,
  icon: null,
  color: null,
  min_session_minutes: minSessionMinutes,
  created_at: '2026-10-01T00:00:00.000Z',
  created_by_user_id: 'u1',
  managed_by_user_id: null,
  role: 'owner',
})

const hideSwitch = () => screen.getByRole('switch', { name: 'Hide short sessions' })
const minutesField = () => screen.queryByLabelText('Under')
const save = () => screen.getByRole('button', { name: 'Save' })

beforeEach(() => {
  vi.clearAllMocks()
  state.canManage = true
  state.workspace = workspace(null)
  vi.mocked(workspacesApi.update).mockImplementation(async (_id, payload) => ({ ...state.workspace, ...payload }) as Workspace)
})

describe('workspace settings: hide short sessions (#22)', () => {
  it('HIDE-06 shows the switch below the timezone, off for a null minimum, and the field only while it is on', async () => {
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    const timezone = await screen.findByLabelText('Timezone')
    expect(timezone.compareDocumentPosition(hideSwitch()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(hideSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(minutesField()).toBeNull()

    await user.click(hideSwitch())
    expect(hideSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(minutesField()).toBeInTheDocument()
    expect(screen.getByText('minutes')).toBeInTheDocument()
  })

  it('HIDE-06 opens on with the stored minimum', async () => {
    state.workspace = workspace(15)
    renderWithProviders(<WorkspaceSettingsPage />)
    expect(await screen.findByRole('switch', { name: 'Hide short sessions' })).toHaveAttribute('aria-checked', 'true')
    expect(minutesField()).toHaveValue(15)
  })

  it('HIDE-07 fills the field with 1 when turned on for a workspace that has it off', async () => {
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    await user.click(await screen.findByRole('switch', { name: 'Hide short sessions' }))
    expect(minutesField()).toHaveValue(1)
  })

  it('HIDE-08 sends the minutes while on, and null once turned off', async () => {
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    await user.click(await screen.findByRole('switch', { name: 'Hide short sessions' }))
    fireEvent.change(minutesField()!, { target: { value: '5' } })
    await user.click(save())
    await waitFor(() => expect(workspacesApi.update).toHaveBeenCalledTimes(1))
    expect(vi.mocked(workspacesApi.update).mock.calls[0]).toEqual(['ws', expect.objectContaining({ min_session_minutes: 5 })])

    await user.click(hideSwitch())
    await user.click(save())
    await waitFor(() => expect(workspacesApi.update).toHaveBeenCalledTimes(2))
    expect(vi.mocked(workspacesApi.update).mock.calls[1]).toEqual(['ws', expect.objectContaining({ min_session_minutes: null })])
  })

  it('HIDE-09 shows Between 1 and 60 minutes. for 0, 61 and 1.5 and sends nothing', async () => {
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    await user.click(await screen.findByRole('switch', { name: 'Hide short sessions' }))
    for (const bad of ['0', '61', '1.5']) {
      fireEvent.change(minutesField()!, { target: { value: bad } })
      expect(screen.getByText('Between 1 and 60 minutes.')).toBeInTheDocument()
      expect(save()).toBeDisabled()
      await user.click(save())
    }
    expect(workspacesApi.update).not.toHaveBeenCalled()

    fireEvent.change(minutesField()!, { target: { value: '60' } })
    expect(screen.queryByText('Between 1 and 60 minutes.')).toBeNull()
    expect(save()).toBeEnabled()
  })

  it('HIDE-10 shows an editor the switch and the field disabled, with the stored value', async () => {
    state.canManage = false
    state.workspace = { ...workspace(10), role: 'editor' }
    renderWithProviders(<WorkspaceSettingsPage />)
    const toggle = await screen.findByRole('switch', { name: 'Hide short sessions' })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(minutesField()).toBeDisabled()
    expect(minutesField()).toHaveValue(10)
  })

  it('names it Esconder sessões curtas in Portuguese, with Menos de and minutos', async () => {
    const { i18n } = await import('@/test/utils')
    await i18n.changeLanguage('pt-BR')
    state.workspace = workspace(5)
    renderWithProviders(<WorkspaceSettingsPage />)
    expect(await screen.findByRole('switch', { name: 'Esconder sessões curtas' })).toBeInTheDocument()
    expect(screen.getByLabelText('Menos de')).toHaveValue(5)
    expect(screen.getByText('minutos')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})
