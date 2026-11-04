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
  merge_gap_minutes: null,
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

  it('keeps the explanation of hiding short sessions in the tooltip of an info button next to it, for an editor too', async () => {
    const hint =
      'Closed sessions shorter than this leave the Agenda and the Sessions tab of the Reports for every member. They still count in every total.'
    state.canManage = false
    state.workspace = { ...workspace(10), role: 'editor' }
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    const info = await screen.findByRole('button', { name: 'About hiding short sessions' })
    expect(screen.queryByText(hint)).toBeNull()
    expect(info).toBeEnabled()
    expect(screen.getByText('Hide short sessions').parentElement).toContainElement(info)

    await user.hover(info)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(hint)
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

  it('HIDE-06 HIDE-09 names it Esconder sessões curtas in Portuguese, with Menos de, minutos and Entre 1 e 60 minutos.', async () => {
    const { i18n } = await import('@/test/utils')
    await i18n.changeLanguage('pt-BR')
    state.workspace = workspace(5)
    renderWithProviders(<WorkspaceSettingsPage />)
    expect(await screen.findByRole('switch', { name: 'Esconder sessões curtas' })).toBeInTheDocument()
    expect(screen.getByLabelText('Menos de')).toHaveValue(5)
    expect(screen.getByText('minutos')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Menos de'), { target: { value: '0' } })
    expect(screen.getByText('Entre 1 e 60 minutos.')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})

describe('workspace settings: join near sessions (#23)', () => {
  const joining = (mergeGapMinutes: number | null, minSessionMinutes: number | null = null): Workspace => ({
    ...workspace(minSessionMinutes),
    merge_gap_minutes: mergeGapMinutes,
  })
  const joinSwitch = () => screen.getByRole('switch', { name: 'Join near sessions' })
  const gapField = () => screen.queryByLabelText('Up to')

  it('MERGE-06 shows the switch right below Hide short sessions, off for a null gap, and the field only while it is on', async () => {
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    const hide = await screen.findByRole('switch', { name: 'Hide short sessions' })
    const switches = screen.getAllByRole('switch')
    expect(switches.indexOf(joinSwitch())).toBe(switches.indexOf(hide) + 1)
    expect(hide.compareDocumentPosition(joinSwitch()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(joinSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(gapField()).toBeNull()

    await user.click(joinSwitch())
    expect(joinSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(gapField()).toBeInTheDocument()
    expect(screen.getByText('minutes')).toBeInTheDocument()
  })

  it('MERGE-06 opens on with the stored gap', async () => {
    state.workspace = joining(5)
    renderWithProviders(<WorkspaceSettingsPage />)
    expect(await screen.findByRole('switch', { name: 'Join near sessions' })).toHaveAttribute('aria-checked', 'true')
    expect(gapField()).toHaveValue(5)
  })

  it('MERGE-07 fills the field with 1 when turned on for a workspace that has it off', async () => {
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    await user.click(await screen.findByRole('switch', { name: 'Join near sessions' }))
    expect(gapField()).toHaveValue(1)
  })

  it('MERGE-08 sends the gap of 5 while on, and null once turned off', async () => {
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    await user.click(await screen.findByRole('switch', { name: 'Join near sessions' }))
    fireEvent.change(gapField()!, { target: { value: '5' } })
    await user.click(save())
    await waitFor(() => expect(workspacesApi.update).toHaveBeenCalledTimes(1))
    expect(vi.mocked(workspacesApi.update).mock.calls[0]).toEqual(['ws', expect.objectContaining({ merge_gap_minutes: 5, min_session_minutes: null })])

    await user.click(joinSwitch())
    await user.click(save())
    await waitFor(() => expect(workspacesApi.update).toHaveBeenCalledTimes(2))
    expect(vi.mocked(workspacesApi.update).mock.calls[1]).toEqual(['ws', expect.objectContaining({ merge_gap_minutes: null })])
  })

  it('MERGE-09 shows Between 1 and 60 minutes. under the field for 0, 61 and 1.5, sends nothing, and leaves the short sessions field alone', async () => {
    state.workspace = joining(null, 5)
    const { user } = renderWithProviders(<WorkspaceSettingsPage />)
    await user.click(await screen.findByRole('switch', { name: 'Join near sessions' }))
    for (const bad of ['0', '61', '1.5']) {
      fireEvent.change(gapField()!, { target: { value: bad } })
      const errors = screen.getAllByText('Between 1 and 60 minutes.')
      expect(errors).toHaveLength(1)
      expect(gapField()).toHaveAttribute('aria-invalid', 'true')
      expect(gapField()).toHaveAttribute('aria-describedby', errors[0]!.id)
      expect(minutesField()).not.toHaveAttribute('aria-invalid')
      expect(minutesField()).toHaveValue(5)
      expect(save()).toBeDisabled()
      await user.click(save())
    }
    expect(workspacesApi.update).not.toHaveBeenCalled()

    fireEvent.change(gapField()!, { target: { value: '60' } })
    expect(screen.queryByText('Between 1 and 60 minutes.')).toBeNull()
    expect(save()).toBeEnabled()
  })

  it('MERGE-09 keeps the join field valid and saving blocked while only the short sessions field is invalid', async () => {
    state.workspace = joining(5, 5)
    renderWithProviders(<WorkspaceSettingsPage />)
    await screen.findByRole('switch', { name: 'Join near sessions' })
    fireEvent.change(minutesField()!, { target: { value: '0' } })
    expect(screen.getAllByText('Between 1 and 60 minutes.')).toHaveLength(1)
    expect(minutesField()).toHaveAttribute('aria-invalid', 'true')
    expect(gapField()).not.toHaveAttribute('aria-invalid')
    expect(gapField()).toHaveValue(5)
    expect(save()).toBeDisabled()
  })

  it('MERGE-10 shows an editor and a viewer the switch and the field disabled, with the stored value', async () => {
    state.canManage = false
    for (const role of ['editor', 'viewer'] as const) {
      state.workspace = { ...joining(10), role }
      const { unmount } = renderWithProviders(<WorkspaceSettingsPage />)
      const toggle = await screen.findByRole('switch', { name: 'Join near sessions' })
      expect(toggle).toBeDisabled()
      expect(toggle).toHaveAttribute('aria-checked', 'true')
      expect(gapField()).toBeDisabled()
      expect(gapField()).toHaveValue(10)
      unmount()
    }
  })

  it('names it Juntar sessões próximas in Portuguese, with Até, minutos and Entre 1 e 60 minutos.', async () => {
    const { i18n } = await import('@/test/utils')
    await i18n.changeLanguage('pt-BR')
    try {
      state.workspace = joining(5)
      renderWithProviders(<WorkspaceSettingsPage />)
      expect(await screen.findByRole('switch', { name: 'Juntar sessões próximas' })).toBeInTheDocument()
      expect(screen.getByLabelText('Até')).toHaveValue(5)
      expect(screen.getByText('minutos')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Até'), { target: { value: '61' } })
      expect(screen.getByText('Entre 1 e 60 minutos.')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
