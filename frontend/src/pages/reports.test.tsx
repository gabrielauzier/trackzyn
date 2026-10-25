import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import ReportsPage from '@/pages/reports'
import { lists, reports } from '@/lib/api'
import { navItems } from '@/lib/nav-items'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ListCard, Overview } from '@/types'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn() },
  reports: { overview: vi.fn(), sessions: vi.fn() },
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: true }),
}))

const LIST = '22222222-2222-4222-8222-222222222222'

const card: ListCard = {
  id: LIST,
  workspace_id: 'ws',
  name: 'Semana',
  color: 2,
  position: 0,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-24T10:00:00Z',
  pending_count: 0,
  preview: [],
}

const overview: Overview = {
  timezone: 'America/Sao_Paulo',
  range: { from: '2026-10-19', to: '2026-10-25' },
  tiles: { work_days: 2, tasks_done: 2, task_seconds: 12600, avg_seconds_per_task: 6300 },
  daily: [{ date: '2026-10-19', task_seconds: 12600, break_seconds: 600 }],
  productive: { hours: [18], weekdays: [1], months: ['2026-10'] },
  by_list: [{ list_id: LIST, name: 'Semana', color: 2, is_archived: false, seconds: 12600 }],
  break_seconds: 600,
  done: { days: [], early_or_on_time_pct: null, late_pct: null },
}

beforeEach(async () => {
  vi.clearAllMocks()
  // 02:00 UTC on Monday the 26th is still Sunday the 25th in the workspace timezone.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-26T02:00:00Z'))
  await i18n.changeLanguage('pt-BR')
  vi.mocked(lists.list).mockImplementation(async (params = {}) => ({
    timezone: 'America/Sao_Paulo',
    lists: params.archived ? [] : [card],
  }))
  vi.mocked(reports.overview).mockResolvedValue(overview)
  vi.mocked(reports.sessions).mockResolvedValue({
    days: [
      {
        date: '2026-10-21',
        sessions: [
          {
            id: 's1',
            kind: 'task',
            task_title: 'Escrever relatório',
            list_name: 'Semana',
            started_at: '2026-10-21T11:00:00.000Z',
            ended_at: '2026-10-21T12:30:00.000Z',
            seconds: 5400,
          },
        ],
      },
    ],
  })
})

afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

describe('ReportsPage (REPORT-01, REPORT-07, REPORT-12, REPORT-20)', () => {
  it('is reached from Relatórios in the side menu', () => {
    expect(navItems).toContainEqual(expect.objectContaining({ type: 'link', key: 'reports', path: '/reports' }))
    expect(i18n.t('nav.reports')).toBe('Relatórios')
  })

  it('opens on Visão geral with Todas as listas and the period from Monday to today in the workspace timezone', async () => {
    renderWithProviders(<ReportsPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Relatórios' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'Visão geral', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Lista' })).toHaveTextContent('Todas as listas')
    await waitFor(() => expect(reports.overview).toHaveBeenCalledWith({ from: '2026-10-19', to: '2026-10-25' }))
    expect(reports.overview).toHaveBeenCalledTimes(1)
    expect(reports.sessions).not.toHaveBeenCalled()

    expect(await screen.findByRole('group', { name: 'Tempo trabalhado' })).toHaveTextContent('3h 30min')
    expect(screen.getByRole('group', { name: 'Média por tarefa' })).toHaveTextContent('1h 45min')
    expect(screen.getByRole('group', { name: 'Hora mais produtiva' })).toHaveTextContent('18–19h')
    expect(screen.getByText('1 lista, Tempo total: 3h 40min')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma tarefa concluída no período')).toBeInTheDocument()
  })

  it('asks the overview again with list_id when a list is chosen', async () => {
    const { user } = renderWithProviders(<ReportsPage />)

    await user.click(await screen.findByRole('combobox', { name: 'Lista' }))
    await user.click(await screen.findByRole('option', { name: 'Semana' }))

    await waitFor(() =>
      expect(reports.overview).toHaveBeenLastCalledWith({ from: '2026-10-19', to: '2026-10-25', list_id: LIST }),
    )
  })

  it('asks /api/reports/sessions with the same filter on the Sessões tab', async () => {
    const { user } = renderWithProviders(<ReportsPage />)

    await user.click(await screen.findByRole('tab', { name: 'Sessões' }))

    await waitFor(() => expect(reports.sessions).toHaveBeenCalledWith({ from: '2026-10-19', to: '2026-10-25' }))
    expect(await screen.findByRole('cell', { name: 'Escrever relatório' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '08:00' })).toBeInTheDocument()
  })

  it('shows the empty texts of a period without sessions', async () => {
    vi.mocked(reports.overview).mockResolvedValue({
      ...overview,
      tiles: { work_days: 0, tasks_done: 0, task_seconds: 0, avg_seconds_per_task: null },
      daily: [{ date: '2026-10-19', task_seconds: 0, break_seconds: 0 }],
      productive: { hours: [], weekdays: [], months: [] },
      by_list: [],
      break_seconds: 0,
    })
    renderWithProviders(<ReportsPage />)

    expect(await screen.findByRole('group', { name: 'Tempo trabalhado' })).toHaveTextContent('0min')
    expect(screen.getByRole('group', { name: 'Média por tarefa' })).toHaveTextContent('—')
    // The daily chart, the donut and the most productive row.
    expect(screen.getAllByText('Sem atividade no período')).toHaveLength(3)
  })

  it('says so when the report cannot be loaded', async () => {
    vi.mocked(reports.overview).mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }))
    renderWithProviders(<ReportsPage />)

    expect(await screen.findByText('Não foi possível carregar o relatório.')).toBeInTheDocument()
  })

  it('opens the print dialog from Exportar PDF (REPORT-23)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { user } = renderWithProviders(<ReportsPage />)

    await user.click(await screen.findByRole('button', { name: 'Exportar PDF' }))

    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })

  it('shows Exportar PDF only on the Visão geral tab (REPORT-23)', async () => {
    const { user } = renderWithProviders(<ReportsPage />)
    expect(await screen.findByRole('button', { name: 'Exportar PDF' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Sessões' }))

    expect(await screen.findByRole('cell', { name: 'Escrever relatório' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull()
  })

  it('puts the period and the chosen list on top of the printed overview (REPORT-23)', async () => {
    const { user } = renderWithProviders(<ReportsPage />)

    expect(await screen.findByText('Lista: Todas as listas')).toBeInTheDocument()
    expect(screen.getByText('Período: 19 de out. de 2026 - 25 de out. de 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Lista' }))
    await user.click(await screen.findByRole('option', { name: 'Semana' }))

    expect(await screen.findByText('Lista: Semana')).toBeInTheDocument()
  })
})
