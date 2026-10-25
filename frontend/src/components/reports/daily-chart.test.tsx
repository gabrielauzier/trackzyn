import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'

import { DailyChart } from '@/components/reports/daily-chart'
import { i18n, renderWithProviders } from '@/test/utils'

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

const rows = () =>
  within(screen.getByRole('table', { name: 'Tempo por dia' }))
    .getAllByRole('row')
    .map((row) => Array.from(row.children, (cell) => cell.textContent))

describe('DailyChart (REPORT-04, REPORT-12)', () => {
  it('shows the Tarefas, Intervalos and Total series, with Total = tasks + breaks for each day', () => {
    renderWithProviders(
      <DailyChart
        daily={[
          { date: '2026-10-19', task_seconds: 5400, break_seconds: 0 },
          { date: '2026-10-20', task_seconds: 0, break_seconds: 0 },
          { date: '2026-10-21', task_seconds: 7200, break_seconds: 600 },
        ]}
      />,
    )

    const legend = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(legend).toEqual(['Tarefas', 'Intervalos', 'Total'])
    expect(rows()).toEqual([
      ['Dia', 'Tarefas', 'Intervalos', 'Total'],
      ['seg., 19 de out.', '1h 30min', '0min', '1h 30min'],
      ['ter., 20 de out.', '0min', '0min', '0min'],
      ['qua., 21 de out.', '2h', '10min', '2h 10min'],
    ])
    expect(screen.queryByText('Sem atividade no período')).not.toBeInTheDocument()
  })

  it('shows one group for a one-day period', () => {
    renderWithProviders(<DailyChart daily={[{ date: '2026-10-25', task_seconds: 60, break_seconds: 0 }]} />)

    expect(rows()).toEqual([
      ['Dia', 'Tarefas', 'Intervalos', 'Total'],
      ['dom., 25 de out.', '1min', '0min', '1min'],
    ])
  })

  it('shows Sem atividade no período without any session in the period', () => {
    renderWithProviders(
      <DailyChart
        daily={[
          { date: '2026-10-19', task_seconds: 0, break_seconds: 0 },
          { date: '2026-10-20', task_seconds: 0, break_seconds: 0 },
        ]}
      />,
    )

    expect(screen.getByText('Sem atividade no período')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('counts a day with only a break as activity', () => {
    renderWithProviders(<DailyChart daily={[{ date: '2026-10-19', task_seconds: 0, break_seconds: 600 }]} />)

    expect(screen.queryByText('Sem atividade no período')).not.toBeInTheDocument()
    expect(rows()[1]).toEqual(['seg., 19 de out.', '0min', '10min', '10min'])
  })
})
