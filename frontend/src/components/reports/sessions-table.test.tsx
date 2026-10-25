import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { SessionsTable } from '@/components/reports/sessions-table'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ReportSession, SessionsReport } from '@/types'

const session = (id: string, over: Partial<ReportSession>): ReportSession => ({
  id,
  kind: 'task',
  task_title: 'Escrever relatório',
  list_name: 'Semana',
  started_at: '2026-10-21T12:00:00.000Z',
  ended_at: '2026-10-21T13:30:00.000Z',
  seconds: 5400,
  ...over,
})

/** Three sessions and a break on two days, the most recent first; the last one still open. */
const report: SessionsReport = {
  days: [
    {
      date: '2026-10-22',
      sessions: [
        session('s4', { task_title: 'Revisar PR', started_at: '2026-10-22T14:00:00.000Z', ended_at: null, seconds: 1500 }),
      ],
    },
    {
      date: '2026-10-21',
      sessions: [
        session('s3', { kind: 'break', task_title: null, started_at: '2026-10-21T13:30:00.000Z', ended_at: '2026-10-21T13:40:00.000Z', seconds: 600 }),
        session('s2', { list_name: 'Casa', task_title: 'Pagar contas', started_at: '2026-10-21T12:45:00.000Z', ended_at: '2026-10-21T13:30:00.000Z', seconds: 2700 }),
        session('s1', { started_at: '2026-10-21T11:00:00.000Z', ended_at: '2026-10-21T12:30:00.000Z' }),
      ],
    },
  ],
}

const rows = (day: string) =>
  Array.from(screen.getByRole('table', { name: day }).querySelectorAll('tr'), (row) =>
    Array.from(row.children, (cell) => cell.textContent),
  )

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('SessionsTable (REPORT-20, REPORT-21, REPORT-22)', () => {
  it('lists the sessions by day with start, end, task or Intervalo, list and duration in the workspace timezone', () => {
    renderWithProviders(<SessionsTable report={report} timezone="America/Sao_Paulo" />)

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '22 de out. de 2026',
      '21 de out. de 2026',
    ])
    expect(rows('21 de out. de 2026')).toEqual([
      ['Início', 'Fim', 'Tarefa', 'Lista', 'Duração'],
      ['10:30', '10:40', 'Intervalo', 'Semana', '10min'],
      ['09:45', '10:30', 'Pagar contas', 'Casa', '45min'],
      ['08:00', '09:30', 'Escrever relatório', 'Semana', '1h 30min'],
    ])
  })

  it('shows em andamento in place of the end of an open session', () => {
    renderWithProviders(<SessionsTable report={report} timezone="America/Sao_Paulo" />)

    expect(rows('22 de out. de 2026')).toEqual([
      ['Início', 'Fim', 'Tarefa', 'Lista', 'Duração'],
      ['11:00', 'em andamento', 'Revisar PR', 'Semana', '25min'],
    ])
  })

  it('shows Sem atividade no período without any session', () => {
    renderWithProviders(<SessionsTable report={{ days: [] }} timezone="America/Sao_Paulo" />)

    expect(screen.getByText('Sem atividade no período')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
