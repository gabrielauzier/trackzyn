import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'

import { ReportFilters } from '@/components/reports/report-filters'
import { useReportFilter } from '@/components/reports/use-report-filter'
import { lists, reports } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ListCard, Overview } from '@/types'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn() },
  reports: { overview: vi.fn() },
}))
// The calendar is tested on its own; here a button picks a fixed period and the trigger shows the current one.
vi.mock('@/components/ui/date-range-picker', () => ({
  DateRangePicker: ({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) => (
    <button type="button" onClick={() => onChange('2025-10-01', '2026-10-25')}>
      {`${from} / ${to}`}
    </button>
  ),
}))

const ACTIVE = '22222222-2222-4222-8222-222222222222'
const ARCHIVED = '11111111-1111-4111-8111-111111111111'

function card(id: string, name: string, isArchived: boolean): ListCard {
  return {
    id,
    workspace_id: 'ws',
    name,
    color: 2,
    position: 0,
    is_archived: isArchived,
    created_by_user_id: null,
    created_at: '2026-10-24T10:00:00Z',
    pending_count: 0,
    preview: [],
  }
}

function overview(tasksDone: number): Overview {
  return {
    timezone: 'America/Sao_Paulo',
    range: { from: '2026-10-19', to: '2026-10-25' },
    tiles: { work_days: 0, tasks_done: tasksDone, task_seconds: 0, avg_seconds_per_task: null },
    daily: [],
    productive: { hours: [], weekdays: [], months: [] },
    by_list: [],
    break_seconds: 0,
    done: { days: [], early_or_on_time_pct: null, late_pct: null },
  }
}

const httpError = (status: number) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: {} } })

/** The filter as the reports page wires it: the shown data follows the filter the server accepted. */
function Harness() {
  const { filter, notice, change, run } = useReportFilter('America/Sao_Paulo')
  const { data } = useQuery({ queryKey: ['reports', 'overview', filter], queryFn: () => run(reports.overview, filter) })
  return (
    <>
      <ReportFilters filter={filter} onChange={change} notice={notice} />
      {data && <p>{`Concluídas: ${data.tiles.tasks_done}`}</p>}
    </>
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T15:00:00Z'))
  await i18n.changeLanguage('pt-BR')
  vi.mocked(lists.list).mockImplementation(async (params = {}) => ({
    timezone: 'America/Sao_Paulo',
    lists: params.archived ? [card(ARCHIVED, 'Projeto antigo', true)] : [card(ACTIVE, 'Semana', false)],
  }))
  vi.mocked(reports.overview).mockResolvedValue(overview(2))
})

afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

describe('ReportFilters (REPORT-07, REPORT-08, REPORT-13)', () => {
  it('starts on Todas as listas and the current week, and lists the archived list labeled arquivada', async () => {
    const { user } = renderWithProviders(<Harness />)

    expect(screen.getByRole('combobox', { name: 'Lista' })).toHaveTextContent('Todas as listas')
    expect(screen.getByRole('button', { name: '2026-10-19 / 2026-10-25' })).toBeInTheDocument()
    expect(reports.overview).toHaveBeenCalledWith({ from: '2026-10-19', to: '2026-10-25' })

    await waitFor(() => expect(lists.list).toHaveBeenCalledWith({ archived: true }))
    await user.click(screen.getByRole('combobox', { name: 'Lista' }))

    expect(await screen.findByRole('option', { name: 'Todas as listas' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Semana' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Projeto antigo arquivada' })).toBeInTheDocument()
  })

  it('asks the report of the chosen list', async () => {
    const { user } = renderWithProviders(<Harness />)

    await user.click(screen.getByRole('combobox', { name: 'Lista' }))
    await user.click(await screen.findByRole('option', { name: 'Projeto antigo arquivada' }))

    await waitFor(() =>
      expect(reports.overview).toHaveBeenLastCalledWith({ from: '2026-10-19', to: '2026-10-25', list_id: ARCHIVED }),
    )
    expect(screen.getByRole('combobox', { name: 'Lista' })).toHaveTextContent('Projeto antigo')
  })

  it('on 422, keeps the previous period on screen with the message', async () => {
    vi.mocked(reports.overview).mockImplementation(async (query) => {
      if (query.from === '2025-10-01') throw httpError(422)
      return overview(2)
    })
    const { user } = renderWithProviders(<Harness />)
    expect(await screen.findByText('Concluídas: 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2026-10-19 / 2026-10-25' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O período precisa terminar depois do início e ter no máximo 366 dias.',
    )
    expect(reports.overview).toHaveBeenCalledWith({ from: '2025-10-01', to: '2026-10-25' })
    expect(screen.getByRole('button', { name: '2026-10-19 / 2026-10-25' })).toBeInTheDocument()
    expect(await screen.findByText('Concluídas: 2')).toBeInTheDocument()
  })

  it('on 404 of a deleted list, goes back to Todas as listas with the notice', async () => {
    vi.mocked(reports.overview).mockImplementation(async (query) => {
      if (query.list_id === ACTIVE) throw httpError(404)
      return overview(query.list_id ? 1 : 3)
    })
    const { user } = renderWithProviders(<Harness />)
    expect(await screen.findByText('Concluídas: 3')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Lista' }))
    await user.click(await screen.findByRole('option', { name: 'Semana' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A lista foi excluída.')
    expect(screen.getByRole('combobox', { name: 'Lista' })).toHaveTextContent('Todas as listas')
    expect(reports.overview).toHaveBeenLastCalledWith({ from: '2026-10-19', to: '2026-10-25' })
    expect(await screen.findByText('Concluídas: 3')).toBeInTheDocument()
  })
})
