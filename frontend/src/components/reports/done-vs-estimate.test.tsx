import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'

import { DoneVsEstimate } from '@/components/reports/done-vs-estimate'
import { i18n, renderWithProviders } from '@/test/utils'
import type { DoneTaskView, Overview } from '@/types'

function task(id: string, spentMinutes: number, estimate: number | null, verdict: DoneTaskView['verdict']): DoneTaskView {
  return {
    id,
    title: `Tarefa ${id}`,
    list_id: 'list-1',
    spent_seconds: spentMinutes * 60,
    estimate_minutes: estimate,
    verdict,
    diff_seconds: estimate === null ? 0 : (spentMinutes - estimate) * 60,
  }
}

/** The T2 scenario: estimate of 60 min, spent 50, 58, 63 and 80 min, and one without estimate. */
const scenario: Overview['done'] = {
  days: [
    { date: '2026-10-22', tasks: [task('A', 50, 60, 'early')] },
    {
      date: '2026-10-21',
      tasks: [task('B', 58, 60, 'on_time'), task('C', 63, 60, 'on_time'), task('D', 80, 60, 'late'), task('E', 30, null, null)],
    },
  ],
  early_or_on_time_pct: 75,
  late_pct: 25,
}

const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('DoneVsEstimate (REPORT-14 to REPORT-19)', () => {
  it('groups the done tasks by day, most recent first, with N tarefas', () => {
    renderWithProviders(<DoneVsEstimate done={scenario} />)

    const days = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(days).toEqual(['22 de out. de 2026', '21 de out. de 2026'])
    expect(screen.getByText('1 tarefa')).toBeInTheDocument()
    expect(screen.getByText('4 tarefas')).toBeInTheDocument()
  })

  it('gives each task of the T2 scenario its badge and its time', () => {
    renderWithProviders(<DoneVsEstimate done={scenario} />)

    expect(row('Tarefa A')).toHaveTextContent(/^Tarefa A10min antes50min$/)
    expect(row('Tarefa B')).toHaveTextContent(/^Tarefa BNo prazo58min$/)
    expect(row('Tarefa C')).toHaveTextContent(/^Tarefa CNo prazo1h 3min$/)
    expect(row('Tarefa D')).toHaveTextContent(/^Tarefa D20min depois1h 20min$/)
    expect(row('Tarefa E')).toHaveTextContent(/^Tarefa E30min$/)
  })

  it('paints early and on time green, late red, and leaves a task without estimate without badge', () => {
    renderWithProviders(<DoneVsEstimate done={scenario} />)

    expect(within(row('Tarefa A')).getByText('10min antes')).toHaveClass('text-status-good')
    expect(within(row('Tarefa B')).getByText('No prazo')).toHaveClass('text-status-good')
    expect(within(row('Tarefa D')).getByText('20min depois')).toHaveClass('text-status-critical')
    expect(row('Tarefa E').querySelector('[data-slot="badge"]')).toBeNull()
  })

  it('shows 75% and 25% with the split bar', () => {
    renderWithProviders(<DoneVsEstimate done={scenario} />)

    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '75% antes ou no prazo, 25% depois' })).toBeInTheDocument()
  })

  it('writes 45,45% and 54,55% in pt-BR and splits the bar in those proportions', () => {
    renderWithProviders(<DoneVsEstimate done={{ ...scenario, early_or_on_time_pct: 45.45, late_pct: 54.55 }} />)

    expect(screen.getByText('45,45%')).toBeInTheDocument()
    expect(screen.getByText('54,55%')).toBeInTheDocument()
    const bar = screen.getByRole('img', { name: '45,45% antes ou no prazo, 54,55% depois' })
    expect(Array.from(bar.children, (part) => (part as HTMLElement).style.width)).toEqual(['45.45%', '54.55%'])
  })

  it('hides the bar and the percentages without any done task with estimate', () => {
    renderWithProviders(
      <DoneVsEstimate done={{ days: [{ date: '2026-10-21', tasks: [task('E', 30, null, null)] }], early_or_on_time_pct: null, late_pct: null }} />,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
    expect(row('Tarefa E')).toHaveTextContent(/^Tarefa E30min$/)
  })

  it('says so when no task was done in the period', () => {
    renderWithProviders(<DoneVsEstimate done={{ days: [], early_or_on_time_pct: null, late_pct: null }} />)

    expect(screen.getByText('Nenhuma tarefa concluída no período')).toBeInTheDocument()
  })
})
