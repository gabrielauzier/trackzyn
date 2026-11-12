import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import type { TodayPlanBlock, TodaySession } from '@/types'
import { PlanVsReal } from './plan-vs-real'

const hm = (h: number, m = 0) => h * 60 + m
// A 08:00-18:00 workday makes a 600-minute scale from 08h to 18h: one minute is 1/6 of a percent.
const WORKDAY = { start: '08:00', end: '18:00' }
const pct = (minute: number) => ((minute - hm(8)) / 600) * 100

function block(overrides: Partial<TodayPlanBlock>): TodayPlanBlock {
  return {
    id: 'b',
    kind: 'task',
    task_id: 't',
    title: 'Task',
    list_color: 2,
    start_minute: hm(9),
    minutes: 60,
    done: false,
    ...overrides,
  }
}

/** The instant of a minute of 2026-11-11 in America/Sao_Paulo (UTC-3). */
const atMinute = (minute: number) => new Date(Date.UTC(2026, 10, 11, 3) + minute * 60_000).toISOString()

function session(overrides: Partial<TodaySession>): TodaySession {
  const base: Omit<TodaySession, 'started_at' | 'ended_at'> & Partial<TodaySession> = {
    id: 's',
    kind: 'task',
    task_id: 't',
    title: 'Task',
    list_id: 'l1',
    list_color: 2,
    start_minute: hm(9),
    end_minute: hm(10),
    open: false,
    ...overrides,
  }
  return { started_at: atMinute(base.start_minute), ended_at: atMinute(base.end_minute), ...base }
}

function draw(props: Partial<Parameters<typeof PlanVsReal>[0]> = {}) {
  return renderWithProviders(
    <PlanVsReal
      day="2026-11-11"
      workday={WORKDAY}
      planSaved
      blocks={[]}
      sessions={[]}
      nowMinute={hm(14, 20)}
      {...props}
    />,
  )
}

const leftOf = (element: HTMLElement) => parseFloat(element.style.left)
const widthOf = (element: HTMLElement) => parseFloat(element.style.width)
const row = (name: 'Plan' | 'Actual') => screen.getByRole('list', { name })

describe('PlanVsReal (HOJE-42 to HOJE-48)', () => {
  it('HOJE-42 draws the plan blocks in the Plan row and the sessions in the Actual row', () => {
    draw({
      blocks: [block({ id: 'b1', title: 'Write the spec', start_minute: hm(13, 30), minutes: 90 })],
      sessions: [session({ id: 's1', title: 'Review the MR', start_minute: hm(8, 40), end_minute: hm(9, 42) })],
    })
    expect(within(row('Plan')).getByText('Write the spec')).toBeInTheDocument()
    expect(within(row('Plan')).queryByText('Review the MR')).not.toBeInTheDocument()
    expect(within(row('Actual')).getByText('Review the MR')).toBeInTheDocument()
  })

  it('HOJE-43 marks one tick per full hour of the scale, from 08h to 19h for a session at 08:40 and a block until 18:30', () => {
    draw({
      workday: { start: '09:00', end: '18:00' },
      blocks: [block({ start_minute: hm(17, 30), minutes: 60 })],
      sessions: [session({ start_minute: hm(8, 40), end_minute: hm(9) })],
    })
    expect(screen.getAllByTestId('timeline-tick').map((tick) => tick.textContent)).toEqual([
      '08h',
      '09h',
      '10h',
      '11h',
      '12h',
      '13h',
      '14h',
      '15h',
      '16h',
      '17h',
      '18h',
      '19h',
    ])
  })

  it('HOJE-43 puts a block and a session at the percent of the scale where they start and end', () => {
    draw({
      blocks: [block({ title: 'Write the spec', start_minute: hm(13, 30), minutes: 90 })],
      sessions: [session({ title: 'Write the spec', start_minute: hm(13, 48), end_minute: hm(14, 18) })],
    })
    const planned = within(row('Plan')).getByRole('listitem')
    expect(leftOf(planned)).toBeCloseTo(pct(hm(13, 30)), 2)
    expect(widthOf(planned)).toBeCloseTo(15, 2)
    const logged = within(row('Actual')).getByRole('listitem')
    expect(leftOf(logged)).toBeCloseTo(pct(hm(13, 48)), 2)
    expect(widthOf(logged)).toBeCloseTo(5, 2)
  })

  it('HOJE-44 draws a task block dashed in its list colour, a task session solid with white text, and breaks gray', () => {
    draw({
      blocks: [
        block({ id: 'b1', title: 'Write the spec', list_color: 4 }),
        block({ id: 'b2', kind: 'break', task_id: null, title: 'Lunch', list_color: 4, start_minute: hm(12) }),
      ],
      sessions: [
        session({ id: 's1', title: 'Write the spec', list_color: 4 }),
        session({ id: 's2', kind: 'break', task_id: null, title: null, start_minute: hm(12), end_minute: hm(13) }),
      ],
    })
    const plannedTask = within(row('Plan')).getByText('Write the spec').closest('li')!
    expect(plannedTask).toHaveClass('border-dashed')
    expect(plannedTask.style.borderColor).toContain('--chart-4')
    expect(plannedTask.style.backgroundColor).toContain('--chart-4')

    const loggedTask = within(row('Actual')).getByText('Write the spec').closest('li')!
    expect(loggedTask).not.toHaveClass('border-dashed')
    expect(loggedTask).toHaveClass('text-white')
    expect(loggedTask.style.backgroundColor).toBe('var(--chart-4)')

    const plannedBreak = within(row('Plan')).getByText('Lunch').closest('li')!
    const loggedBreak = within(row('Actual')).getByText('Break').closest('li')!
    for (const gray of [plannedBreak, loggedBreak]) {
      expect(gray).toHaveClass('bg-muted')
      expect(gray).toHaveClass('text-muted-foreground')
      expect(gray.style.backgroundColor).toBe('')
    }
  })

  it('HOJE-45 draws the open session until now and the now line at the minute of now', () => {
    draw({
      // The last read ended the open session at 14:00; at 14:20 it is drawn until 14:20.
      sessions: [session({ title: 'Write the spec', start_minute: hm(13, 48), end_minute: hm(14), open: true })],
      nowMinute: hm(14, 20),
    })
    const open = within(row('Actual')).getByRole('listitem')
    expect(widthOf(open)).toBeCloseTo(pct(hm(14, 20)) - pct(hm(13, 48)), 2)
    expect(leftOf(screen.getByTestId('timeline-now'))).toBeCloseTo(pct(hm(14, 20)), 2)
  })

  it('HOJE-46 tells the title and the start and end of a block and of a session on hover', () => {
    draw({
      blocks: [block({ title: 'Write the spec', start_minute: hm(13, 30), minutes: 90 })],
      sessions: [
        session({ id: 's1', title: 'Review the MR', start_minute: hm(8, 40), end_minute: hm(9, 42) }),
        session({ id: 's2', kind: 'break', task_id: null, title: null, start_minute: hm(12, 10), end_minute: hm(13, 20) }),
      ],
    })
    expect(within(row('Plan')).getByRole('listitem')).toHaveAttribute('title', 'Write the spec · 13:30–15:00')
    const [mr, lunch] = within(row('Actual')).getAllByRole('listitem')
    expect(mr).toHaveAttribute('title', 'Review the MR · 08:40–09:42')
    expect(lunch).toHaveAttribute('title', 'Break · 12:10–13:20')
  })

  it('HOJE-47 says there is no plan for today, with a link to plan today, when no plan is saved', () => {
    draw({ planSaved: false, sessions: [session({ title: 'Review the MR' })] })
    expect(within(row('Plan')).getByText('No plan for today')).toBeInTheDocument()
    expect(within(row('Plan')).getByRole('link', { name: 'Plan today' })).toHaveAttribute('href', '/planejar/2026-11-11')
    expect(within(row('Actual')).getByText('Review the MR')).toBeInTheDocument()
  })

  it('HOJE-47 does not say there is no plan when a plan is saved', () => {
    draw({ planSaved: true, blocks: [block({ title: 'Write the spec' })] })
    expect(screen.queryByText('No plan for today')).not.toBeInTheDocument()
  })

  it('HOJE-48 keeps the timeline at a minimum width inside a box that scrolls sideways', () => {
    draw({ blocks: [block({})] })
    const scroller = screen.getByTestId('timeline-scroll')
    expect(scroller).toHaveClass('overflow-x-auto')
    expect(scroller.firstElementChild).toHaveClass('min-w-[720px]')
  })
})
