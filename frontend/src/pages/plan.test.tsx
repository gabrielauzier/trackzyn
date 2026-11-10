import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { agenda, lists, plans, sessions } from '@/lib/api'
import { DraftGuardProvider } from '@/lib/plan/draft-guard'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ListCard, PlanCandidate, PlanRead } from '@/types'
import PlanPage from './plan'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn() },
  sessions: { list: vi.fn() },
  agenda: { scheduled: vi.fn() },
  plans: { get: vi.fn(), save: vi.fn(), candidates: vi.fn(), planned: vi.fn(), setWorkday: vi.fn() },
}))

const workspace = vi.hoisted(() => ({ canWrite: true }))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace' }, canWrite: workspace.canWrite }),
}))

const SP = 'America/Sao_Paulo'
const DAY = '2026-11-09'
const list = { id: 'l1', name: 'Work', color: 3 }

const card: ListCard = {
  ...list,
  workspace_id: 'ws',
  position: 1,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-01T00:00:00.000Z',
  pending_count: 2,
  preview: [],
}

const candidate = (id: string, title: string, estimate: number | null): PlanCandidate => ({
  id,
  title,
  list,
  column: 'today',
  position: 1,
  estimate_minutes: estimate,
  scheduled_on: null,
  scheduled_time: null,
})

const planOf = (overrides: Partial<PlanRead> = {}): PlanRead => ({
  day: DAY,
  version: 3,
  editable: true,
  workday: { start: '09:00', end: '18:00' },
  blocks: [],
  ...overrides,
})

const savedBlock = {
  id: 'b1',
  kind: 'task' as const,
  start: '14:00',
  minutes: 60,
  task: { id: 'c', title: 'Review the budget', list, done: false, scheduled_on: DAY, estimate_minutes: 60 },
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

function show(route = `/planejar/${DAY}`) {
  return renderWithProviders(
    <DraftGuardProvider>
      <Routes>
        <Route path="/planejar" element={<PlanPage />} />
        <Route path="/planejar/:day" element={<PlanPage />} />
      </Routes>
      <Where />
    </DraftGuardProvider>,
    { route },
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  workspace.canWrite = true
  // Sunday 8 November 2026, 23:30 in São Paulo: already Monday in UTC.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T02:30:00.000Z'))
  // jsdom lays nothing out: the plan column starts at the top of the screen.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-plan-column')) return DOMRect.fromRect({ x: 400, y: 0, width: 400, height: 1440 * PX_PER_MINUTE })
    return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 })
  })
  vi.mocked(lists.list).mockResolvedValue({ timezone: SP, lists: [card] })
  vi.mocked(sessions.list).mockResolvedValue({ sessions: [] })
  vi.mocked(agenda.scheduled).mockResolvedValue({ timed: [], untimed: [], projected: [] })
  vi.mocked(plans.get).mockImplementation(async (day) => planOf({ day }))
  vi.mocked(plans.candidates).mockResolvedValue({ tasks: [candidate('a', 'Write the spec', 60), candidate('b', 'Fix the widget', 90)] })
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

/** Drags a task of the side list onto the grid at `minute`. */
async function dropTask(title: string, minute: number) {
  const item = (await screen.findByText(title)).closest<HTMLElement>('[data-candidate]')!
  fireEvent.pointerDown(item, { clientX: 50, clientY: 50, button: 0 })
  fireEvent.pointerMove(window, { clientX: 500, clientY: minute * PX_PER_MINUTE + 1 })
  fireEvent.pointerUp(window, { clientX: 500, clientY: minute * PX_PER_MINUTE + 1 })
}

const footer = () => document.querySelector<HTMLElement>('[data-slot="plan-footer"]')
const blocks = () => [...document.querySelectorAll<HTMLElement>('[data-plan-block]')]

const httpError = (status: number) =>
  new AxiosError('refused', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { code: status === 409 ? 'plan_changed' : undefined },
  })

describe('PlanPage', () => {
  it('PLAN-01 without a day opens the plan of tomorrow in the workspace timezone', async () => {
    show('/planejar')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/planejar/${DAY}`))
    expect(await screen.findByRole('heading', { level: 1, name: 'Segunda-feira, 9 de novembro' })).toBeInTheDocument()
    expect(plans.get).toHaveBeenCalledWith(DAY)
  })

  it('PLAN-07 PLAN-08 keeps two dropped tasks as a draft and saves them with one PUT, then shows Plano salvo', async () => {
    vi.mocked(plans.save).mockImplementation(async (_day, body) =>
      planOf({
        version: 4,
        blocks: body.blocks.map((block, index) => ({
          id: `s${index}`,
          kind: 'task',
          start: block.start,
          minutes: block.minutes,
          task: { id: (block as { task_id: string }).task_id, title: index ? 'Fix the widget' : 'Write the spec', list, done: false, scheduled_on: DAY, estimate_minutes: 60 },
        })),
      }),
    )
    const { user } = show()
    await dropTask('Write the spec', 600)
    await dropTask('Fix the widget', 780)

    expect(blocks()).toHaveLength(2)
    expect(footer()).toHaveTextContent('Rascunho — ainda não salvo')
    expect(footer()).toHaveTextContent('2 tarefas e 0 pausas no plano')
    // Nothing is written while it is a draft (PLAN-07).
    expect(plans.save).not.toHaveBeenCalled()

    await user.click(within(footer()!).getByRole('button', { name: 'Confirmar plano' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Plano salvo')
    expect(plans.save).toHaveBeenCalledExactlyOnceWith(DAY, {
      base_version: 3,
      blocks: [
        { kind: 'task', task_id: 'a', start: '10:00', minutes: 60 },
        { kind: 'task', task_id: 'b', start: '13:00', minutes: 90 },
      ],
    })
    expect(footer()).toBeNull()
    expect(blocks()).toHaveLength(2)
  })

  it('PLAN-11 shows the saved blocks, and a change makes a draft again that Descartar puts back', async () => {
    vi.mocked(plans.get).mockResolvedValue(planOf({ blocks: [savedBlock] }))
    const { user } = show()
    await waitFor(() => expect(blocks()).toHaveLength(1))
    expect(blocks()[0]).toHaveAccessibleName(/^Review the budget, 14:00 – 15:00/)
    expect(footer()).toBeNull()

    await dropTask('Write the spec', 600)
    expect(footer()).toHaveTextContent('Rascunho — ainda não salvo')

    await user.click(within(footer()!).getByRole('button', { name: 'Descartar' }))
    expect(footer()).toBeNull()
    expect(blocks()).toHaveLength(1)
  })

  it('PLAN-35 a plan changed elsewhere shows O plano mudou em outro lugar, and Recarregar reads it again', async () => {
    vi.mocked(plans.save).mockRejectedValue(httpError(409))
    const { user } = show()
    await dropTask('Write the spec', 600)
    await user.click(within(footer()!).getByRole('button', { name: 'Confirmar plano' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('O plano mudou em outro lugar')
    // The draft stays on the screen until the user reloads.
    expect(blocks()).toHaveLength(1)

    vi.mocked(plans.get).mockResolvedValue(planOf({ version: 5, blocks: [savedBlock] }))
    await user.click(within(alert).getByRole('button', { name: 'Recarregar' }))

    await waitFor(() => expect(footer()).toBeNull())
    expect(blocks()).toHaveLength(1)
    expect(blocks()[0]).toHaveAccessibleName(/^Review the budget/)
  })

  it('PLAN-37 a failed save keeps the draft and offers Tentar de novo', async () => {
    vi.mocked(plans.save).mockRejectedValueOnce(httpError(500))
    const { user } = show()
    await dropTask('Write the spec', 600)
    await user.click(within(footer()!).getByRole('button', { name: 'Confirmar plano' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível salvar o plano.')
    expect(blocks()).toHaveLength(1)

    vi.mocked(plans.save).mockResolvedValueOnce(planOf({ version: 4 }))
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(plans.save).toHaveBeenCalledTimes(2))
    expect(vi.mocked(plans.save).mock.calls[1]).toEqual([DAY, { base_version: 3, blocks: [{ kind: 'task', task_id: 'a', start: '10:00', minutes: 60 }] }])
  })

  it('PLAN-34 a past day shows the saved plan only to read: no drag, no handle and no footer', async () => {
    vi.mocked(plans.get).mockResolvedValue(planOf({ editable: false, blocks: [savedBlock] }))
    show()
    expect(await screen.findByText('Dia passado — só leitura')).toBeInTheDocument()
    await waitFor(() => expect(blocks()).toHaveLength(1))
    expect(blocks()[0].querySelector('[data-handle]')).toBeNull()

    await dropTask('Write the spec', 600)
    expect(blocks()).toHaveLength(1)
    expect(footer()).toBeNull()
  })

  it('PLAN-41 a viewer reads the plan without drag and without footer', async () => {
    workspace.canWrite = false
    vi.mocked(plans.get).mockResolvedValue(planOf({ blocks: [savedBlock] }))
    show()
    expect(await screen.findByText('Só leitura')).toBeInTheDocument()
    await waitFor(() => expect(blocks()).toHaveLength(1))
    expect(blocks()[0].querySelector('[data-handle]')).toBeNull()

    await dropTask('Write the spec', 600)
    expect(blocks()).toHaveLength(1)
    expect(footer()).toBeNull()
  })

  it('PLAN-03 PLAN-32 the grid shows no session, and Encaixar fits a task over a session, after the timed tasks', async () => {
    // A timed task 09:00 – 10:00 and a session 10:00 – 10:30 in São Paulo: the session is not on the plan, so the first free hour starts at 10:00.
    vi.mocked(agenda.scheduled).mockResolvedValue({
      timed: [
        { id: 't', title: 'Standup', list, column: 'today', position: 1, estimate_minutes: 60, scheduled_on: DAY, scheduled_time: '09:00', series: null },
      ],
      untimed: [],
      projected: [],
    })
    vi.mocked(sessions.list).mockResolvedValue({
      sessions: [
        {
          id: 's',
          kind: 'task',
          origin: 'manual',
          task_id: 'x',
          task_title: 'Answer the mail',
          list_id: list.id,
          list_name: list.name,
          list_color: list.color,
          started_at: '2026-11-09T13:00:00.000Z',
          ended_at: '2026-11-09T13:30:00.000Z',
        },
      ],
    })
    const { user } = show()
    await waitFor(() => expect(document.querySelectorAll('[data-fixed]')).toHaveLength(1))
    expect(screen.queryByLabelText(/^Answer the mail/)).toBeNull()
    expect(sessions.list).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('checkbox', { name: 'Marcar Write the spec' }))
    await user.click(screen.getByRole('button', { name: 'Encaixar (1)' }))

    expect(blocks()).toHaveLength(1)
    expect(blocks()[0]).toHaveAccessibleName(/^Write the spec, 10:00 – 11:00/)
    expect(footer()).toHaveTextContent('Rascunho — ainda não salvo')
  })

  it('PLAN-13 the arrows of the header open the plan of the next and the previous day', async () => {
    const { user } = show()
    await screen.findByRole('heading', { level: 1, name: 'Segunda-feira, 9 de novembro' })

    await user.click(screen.getByRole('button', { name: 'Próximo dia' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Terça-feira, 10 de novembro' })).toBeInTheDocument()
    expect(plans.get).toHaveBeenCalledWith('2026-11-10')

    await user.click(screen.getByRole('button', { name: 'Dia anterior' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Segunda-feira, 9 de novembro' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent(`/planejar/${DAY}`)
  })

  it('PLAN-13 a day chosen in the header calendar opens its plan; with a draft it asks first', async () => {
    const { user } = show()
    await screen.findByRole('heading', { level: 1, name: 'Segunda-feira, 9 de novembro' })

    await user.click(screen.getByRole('button', { name: 'Escolher dia' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '12' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Quinta-feira, 12 de novembro' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-12')
    expect(plans.get).toHaveBeenCalledWith('2026-11-12')

    // An unsaved draft on the 12th: choosing the 20th asks `Descartar o rascunho?` before it goes (PLAN-36).
    await dropTask('Write the spec', 600)
    await user.click(screen.getByRole('button', { name: 'Escolher dia' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '20' }))
    const guard = await screen.findByRole('dialog', { name: 'Descartar o rascunho?' })
    expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-12')
    expect(plans.get).not.toHaveBeenCalledWith('2026-11-20')

    await user.click(within(guard).getByRole('button', { name: 'Descartar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sexta-feira, 20 de novembro' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-20')
    expect(plans.get).toHaveBeenCalledWith('2026-11-20')
  })

  it('PLAN-36 another day with an unsaved draft asks Descartar o rascunho? first', async () => {
    const { user } = show()
    await dropTask('Write the spec', 600)

    await user.click(screen.getByRole('button', { name: 'Próximo dia' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Descartar o rascunho?' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Continuar planejando' }))
    expect(screen.getByTestId('where')).toHaveTextContent(`/planejar/${DAY}`)
    expect(blocks()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Próximo dia' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-10'))
  })
})
