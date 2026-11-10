import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LaidOutScheduled } from '@/lib/agenda/layout'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ProjectedOccurrence, RecurrenceRule, ScheduledTask } from '@/types'
import { ScheduledBlock } from './scheduled-block'

const FRIDAYS: RecurrenceRule = { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null }

function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 't1',
    title: 'Write the report',
    list: { id: 'l1', name: 'Work', color: 5 },
    column: 'this_week',
    position: 0,
    estimate_minutes: 90,
    scheduled_on: '2026-11-13',
    scheduled_time: '10:00',
    series: null,
    ...overrides,
  }
}

const projection: ProjectedOccurrence = {
  series_id: 'series-1',
  task_id: 'open-1',
  title: 'Weekly review',
  list: { id: 'l1', name: 'Work', color: 5 },
  on: '2026-11-20',
  time: '14:00',
  estimate_minutes: null,
  rule: FRIDAYS,
}

const ofTask = (scheduled: ScheduledTask): LaidOutScheduled => ({
  scheduled: { kind: 'task', task: scheduled },
  day: scheduled.scheduled_on,
  start: 600,
  end: 600 + (scheduled.estimate_minutes ?? 60),
  time: scheduled.scheduled_time!,
  minutes: scheduled.estimate_minutes ?? 60,
  lane: 0,
  lanes: 1,
})
const ofProjection: LaidOutScheduled = {
  scheduled: { kind: 'projection', occurrence: projection },
  day: '2026-11-20',
  start: 840,
  end: 900,
  time: '14:00',
  minutes: 60,
  lane: 0,
  lanes: 1,
}

function show(piece: LaidOutScheduled, canWrite = true) {
  const onOpen = vi.fn()
  return { onOpen, ...renderWithProviders(<ScheduledBlock piece={piece} pxPerMinute={2} canWrite={canWrite} onOpen={onOpen} />) }
}

async function tooltipLines(user: ReturnType<typeof show>['user']) {
  await user.hover(screen.getByRole('button'))
  const tooltip = await screen.findByRole('tooltip')
  return tooltip.textContent
}

describe('ScheduledBlock (US-5)', () => {
  it('carries no text, a faint fill and a dashed edge in its list colour, and the clock in the corner', () => {
    show(ofTask(task()))
    const block = screen.getByRole('button', { name: 'Write the report, Scheduled · 10:00 – 11:30' })
    expect(block.textContent).toBe('')
    expect(block).toHaveClass('border-2', 'border-dashed')
    expect(block.style.backgroundColor).toBe('color-mix(in oklab, var(--chart-5) var(--scheduled-tint), var(--card))')
    expect(block.style.borderColor).toBe('color-mix(in oklab, var(--chart-5) var(--scheduled-edge), transparent)')
    expect(block.querySelector('[data-slot="clock-icon"]')).toHaveClass('absolute', 'top-0', 'right-0')
    expect(block.querySelector('[data-slot="repeat-icon"]')).toBeNull()
    expect(block).not.toHaveClass('opacity-50')
    expect([block.style.top, block.style.height]).toEqual(['1200px', '180px'])
  })

  it('says the title, Est., Agendada · HH:MM – HH:MM, the list and the column, and the click and the drag', async () => {
    const { user } = show(ofTask(task()))
    expect(await tooltipLines(user)).toBe('Write the reportEst. 1hr 30minScheduled · 10:00 – 11:30Work · This weekClick to open · drag to reschedule')
  })

  it('says Sem estimativa and (1h) without an estimate (D23)', async () => {
    const { user } = show(ofTask(task({ estimate_minutes: null, column: 'today' })))
    expect(await tooltipLines(user)).toBe('Write the reportNo estimateScheduled · 10:00 – 11:00 (1h)Work · TodayClick to open · drag to reschedule')
  })

  it('in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user } = show(ofTask(task({ column: 'backlog' })))
      expect(await tooltipLines(user)).toBe('Write the reportEst. 1h 30minAgendada · 10:00 – 11:30Work · BacklogClique para abrir · arraste para reagendar')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('offers a viewer only the click', async () => {
    const { user } = show(ofTask(task()), false)
    expect(await tooltipLines(user)).toBe('Write the reportEst. 1hr 30minScheduled · 10:00 – 11:30Work · This weekClick to open')
  })

  it('opens the task on a click and on Enter', async () => {
    const { user, onOpen } = show(ofTask(task()))
    await user.click(screen.getByRole('button'))
    screen.getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(onOpen.mock.calls).toEqual([['t1'], ['t1']])
  })
})

describe('ScheduledBlock: a series (US-11)', () => {
  it('shows the repeat icon in place of the clock on the open occurrence', () => {
    show(ofTask(task({ series: { id: 'series-1', rule: FRIDAYS } })))
    expect(screen.getByRole('button').querySelector('[data-slot="repeat-icon"]')).toHaveClass('absolute', 'top-0', 'right-0')
    expect(screen.getByRole('button').querySelector('[data-slot="clock-icon"]')).toBeNull()
  })

  it('draws a projection fainter, with the repeat icon', () => {
    show(ofProjection)
    const block = screen.getByRole('button')
    expect(block).toHaveClass('opacity-50', 'border-dashed')
    expect(block).toHaveAttribute('data-projected', 'true')
    expect(block.querySelector('[data-slot="repeat-icon"]')).not.toBeNull()
  })

  it('says Próxima ocorrência · <dia> · HH:MM – HH:MM and the rule, and offers only the click', async () => {
    const { user } = show(ofProjection)
    expect(await tooltipLines(user)).toBe('Weekly reviewNo estimateNext occurrence · Fri, Nov 20 · 14:00 – 15:00 (1h)Repeats every FridayClick to open')
  })

  it('opens the open occurrence on a click', async () => {
    const { user, onOpen } = show(ofProjection)
    await user.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('open-1')
  })
})
