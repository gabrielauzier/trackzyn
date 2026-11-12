import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import type { TodayDoneTask, TodayPlanBlock, TodaySession } from '@/types'
import { DayStats } from './day-stats'

const hm = (h: number, m = 0) => h * 60 + m
const work = { id: 'l1', name: 'Work', color: 2 }

function session(overrides: Partial<TodaySession>): TodaySession {
  return {
    id: 's',
    kind: 'task',
    task_id: 'a',
    title: 'Task',
    list_id: work.id,
    list_color: work.color,
    start_minute: hm(9),
    end_minute: hm(10),
    open: false,
    ...overrides,
  }
}

function block(taskId: string, start: number, minutes = 30): TodayPlanBlock {
  return { id: `b-${taskId}-${start}`, kind: 'task', task_id: taskId, title: taskId, list_color: 2, start_minute: start, minutes, done: false }
}

function done(id: string): TodayDoneTask {
  return {
    id,
    title: id,
    list: work,
    estimate_minutes: null,
    completed_at: '2026-11-11T15:00:00Z',
    spent_seconds: 0,
    verdict: null,
    diff_seconds: 0,
    series: false,
  }
}

// Task sessions A 09:00-10:00, B 10:10-11:00 and A open since 13:48 (its last read at 14:00), and a 10-minute break.
const sessions: TodaySession[] = [
  session({ id: 's1', task_id: 'a', start_minute: hm(9), end_minute: hm(10) }),
  session({ id: 's2', kind: 'break', task_id: null, title: null, start_minute: hm(10), end_minute: hm(10, 10) }),
  session({ id: 's3', task_id: 'b', start_minute: hm(10, 10), end_minute: hm(11) }),
  session({ id: 's4', task_id: 'a', start_minute: hm(13, 48), end_minute: hm(14), open: true }),
]

function draw(props: Partial<Parameters<typeof DayStats>[0]> = {}) {
  return renderWithProviders(
    <DayStats planSaved blocks={[]} sessions={[]} done={[]} focusTaskId={null} nowMinute={hm(14, 20)} {...props} />,
  )
}

const stat = (name: string) => screen.getByRole('group', { name })

describe('DayStats (HOJE-49 to HOJE-53)', () => {
  it('HOJE-49 adds the task sessions with the open one until now, and the breaks apart', () => {
    draw({ sessions })
    // 60 + 50 + 32 (13:48 to 14:20) minutes of task, 10 of break.
    expect(within(stat('Focused time')).getByText('2hr 22min')).toBeInTheDocument()
    expect(within(stat('Focused time')).getByText('breaks 10min')).toBeInTheDocument()
  })

  it('HOJE-50 counts the planned tasks the reader completed, with one segment per planned task: green done, indigo in focus, gray', () => {
    const blocks = [block('a', hm(9)), block('b', hm(10)), block('a', hm(15)), block('c', hm(11)), block('d', hm(12))]
    // `x` is done today but not in the plan; `a` has two blocks and counts once.
    draw({ blocks, done: [done('a'), done('x')], focusTaskId: 'b' })
    const completed = stat('Completed')
    expect(within(completed).getByText('1')).toBeInTheDocument()
    expect(within(completed).getByText('of 4 in the plan')).toBeInTheDocument()
    const segments = within(completed).getAllByTestId('plan-segment')
    expect(segments.map((segment) => segment.dataset.state)).toEqual(['done', 'focus', 'pending', 'pending'])
    expect(segments[0]).toHaveClass('bg-status-good')
    expect(segments[1]).toHaveClass('bg-indigo-500')
    expect(segments[2]).toHaveClass('bg-muted')
  })

  it('HOJE-51 shows only the number of Done today and no plan today without a saved plan', () => {
    draw({ planSaved: false, done: [done('a'), done('x')] })
    const completed = stat('Completed')
    expect(within(completed).getByText('2')).toBeInTheDocument()
    expect(within(completed).getByText('no plan today')).toBeInTheDocument()
    expect(within(completed).queryByText(/in the plan/)).toBeNull()
    expect(within(completed).queryAllByTestId('plan-segment')).toEqual([])
  })

  it('HOJE-52 shows the adherence of the plan so far', () => {
    // Block 13:30-15:00 and the open session of the same task since 13:48: at 14:20, 32 of 50 minutes.
    draw({ blocks: [block('a', hm(13, 30), 90)], sessions: [session({ task_id: 'a', start_minute: hm(13, 48), end_minute: hm(14), open: true })] })
    expect(within(stat('Plan adherence')).getByText('64%')).toBeInTheDocument()
  })

  it('HOJE-52 shows a dash and no blocks so far when no task block has started', () => {
    draw({ blocks: [block('a', hm(15), 60)] })
    expect(within(stat('Plan adherence')).getByText('—')).toBeInTheDocument()
    expect(within(stat('Plan adherence')).getByText('no blocks so far')).toBeInTheDocument()
  })

  it('HOJE-53 shows the task switches and the average task session', () => {
    draw({ sessions })
    // A, B, A: 2 switches; 142 minutes over 3 task sessions.
    expect(within(stat('Task switches')).getByText('2')).toBeInTheDocument()
    expect(within(stat('Task switches')).getByText('average session 47min')).toBeInTheDocument()
  })
})
