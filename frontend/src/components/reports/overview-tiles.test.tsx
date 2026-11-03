import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { OverviewTiles } from '@/components/reports/overview-tiles'
import { i18n, renderWithProviders } from '@/test/utils'

const tile = (label: string) => screen.getByRole('group', { name: label })

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('OverviewTiles (REPORT-01, REPORT-02, REPORT-03, REPORT-12)', () => {
  it('shows the four tiles of the REPORT-02 scenario', () => {
    renderWithProviders(
      <OverviewTiles tiles={{ work_days: 2, tasks_done: 2, task_seconds: 3.5 * 3600, avg_seconds_per_task: 1.75 * 3600 }} />,
    )

    expect(tile('Dias trabalhados')).toHaveTextContent(/^Dias trabalhados2$/)
    expect(tile('Tarefas concluídas')).toHaveTextContent(/^Tarefas concluídas2$/)
    expect(tile('Tempo trabalhado')).toHaveTextContent(/^Tempo trabalhado3h 30min$/)
    expect(tile('Média por tarefa')).toHaveTextContent(/^Média por tarefa1h 45min$/)
  })

  it('shows a dash in Média por tarefa without a done task', () => {
    renderWithProviders(<OverviewTiles tiles={{ work_days: 1, tasks_done: 0, task_seconds: 1800, avg_seconds_per_task: null }} />)

    expect(tile('Tarefas concluídas')).toHaveTextContent(/^Tarefas concluídas0$/)
    expect(tile('Média por tarefa')).toHaveTextContent(/^Média por tarefa—$/)
  })

  it('shows 0, 0min and a dash for a period without sessions', () => {
    renderWithProviders(<OverviewTiles tiles={{ work_days: 0, tasks_done: 0, task_seconds: 0, avg_seconds_per_task: null }} />)

    expect(tile('Dias trabalhados')).toHaveTextContent(/^Dias trabalhados0$/)
    expect(tile('Tempo trabalhado')).toHaveTextContent(/^Tempo trabalhado0min$/)
    expect(tile('Média por tarefa')).toHaveTextContent(/^Média por tarefa—$/)
  })

  it('writes hours the English way in English', async () => {
    await i18n.changeLanguage('en')
    renderWithProviders(<OverviewTiles tiles={{ work_days: 2, tasks_done: 2, task_seconds: 3.5 * 3600, avg_seconds_per_task: 1.75 * 3600 }} />)

    expect(tile('Time worked')).toHaveTextContent(/^Time worked3hr 30min$/)
  })
})
