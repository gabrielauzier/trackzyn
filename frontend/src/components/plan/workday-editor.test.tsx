import { useState } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceContext } from '@/contexts/workspace-context'
import { plans } from '@/lib/api'
import { capacity } from '@/lib/plan/capacity'
import type { DraftBlock } from '@/lib/plan/draft'
import { usePlan } from '@/lib/plan/use-plan'
import { i18n, renderWithProviders } from '@/test/utils'
import type { PlanRead, Workday, Workspace } from '@/types'
import { CapacityBar } from './capacity-bar'
import { WorkdayEditor } from './workday-editor'

vi.mock('@/lib/api', () => ({
  plans: { get: vi.fn(), save: vi.fn(), candidates: vi.fn(), planned: vi.fn(), setWorkday: vi.fn() },
}))

const DAY = '2026-11-09'
const list = { id: 'l1', name: 'Work', color: 1 }
const workspace = { id: 'w1' } as Workspace
const blocks: DraftBlock[] = [
  { key: 'a', kind: 'task', start: 540, minutes: 240, task: { id: 'a', title: 'a', list, done: false, scheduled_on: null, estimate_minutes: null } },
]
const planOf = (workday: Workday): PlanRead => ({ day: DAY, version: 1, editable: true, workday, blocks: [] })

/** The bar and the editor over `usePlan`, as the page wires them. */
function Harness() {
  const { plan, saveWorkday } = usePlan(DAY)
  const [open, setOpen] = useState(true)
  const workday = plan.data?.workday
  if (!workday) return null
  return (
    <>
      <CapacityBar capacity={capacity(blocks, [], workday)} workday={workday} onEditWorkday={() => setOpen(true)} />
      <WorkdayEditor open={open} onOpenChange={setOpen} workday={workday} onSave={saveWorkday} />
    </>
  )
}

async function show() {
  const value = { current: workspace, workspaces: [workspace], isLoading: false, switchWorkspace: vi.fn(), refresh: vi.fn(), role: 'owner' as const, canManage: true, canWrite: true }
  const result = renderWithProviders(
    <WorkspaceContext.Provider value={value}>
      <Harness />
    </WorkspaceContext.Provider>,
  )
  await screen.findByRole('dialog')
  return result
}

const text = () => document.querySelector('[data-slot="capacity-text"]')!.textContent
const setTime = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  let saved: Workday = { start: '09:00', end: '18:00' }
  vi.mocked(plans.get).mockImplementation(async () => planOf(saved))
  vi.mocked(plans.candidates).mockResolvedValue({ tasks: [] })
  vi.mocked(plans.setWorkday).mockImplementation(async (next) => {
    saved = next
    return next
  })
})

describe('WorkdayEditor (PLAN-22)', () => {
  it('starts from the saved workday', async () => {
    await show()
    expect(screen.getByLabelText('Start')).toHaveValue('09:00')
    expect(screen.getByLabelText('End')).toHaveValue('18:00')
  })

  it('saves the new start and end and the bar counts them', async () => {
    const { user } = await show()
    expect(text()).toBe('4hr planned of 9hr free · 0min in breaks')
    setTime('Start', '08:00')
    setTime('End', '12:00')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(plans.setWorkday).toHaveBeenCalledExactlyOnceWith({ start: '08:00', end: '12:00' })
    await waitFor(() => expect(text()).toBe('4hr planned of 4hr free · 0min in breaks'))
    expect(screen.getByRole('button', { name: 'Workday 08:00 – 12:00' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the dialog open with the error when saving fails', async () => {
    vi.mocked(plans.setWorkday).mockRejectedValue(new Error('offline'))
    const { user } = await show()
    setTime('End', '17:00')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the workday.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(text()).toBe('4hr planned of 9hr free · 0min in breaks')
  })

  it('closes on Esc without saving', async () => {
    const { user } = await show()
    setTime('End', '17:00')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(plans.setWorkday).not.toHaveBeenCalled()
  })
})

describe('WorkdayEditor end before the start (PLAN-23)', () => {
  it.each([
    ['17:00', '09:00', 'before'],
    ['09:00', '09:00', 'equal'],
  ])('refuses %s – %s (%s) with O fim precisa ser depois do início and saves nothing', async (start, end) => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user } = await show()
      setTime('Início', start)
      setTime('Fim', end)
      await user.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(screen.getByRole('alert')).toHaveTextContent('O fim precisa ser depois do início')
      expect(plans.setWorkday).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
