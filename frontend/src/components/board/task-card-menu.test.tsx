import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { TaskCardMenu } from '@/components/board/task-card-menu'
import { renderWithProviders } from '@/test/utils'
import type { RecurrenceRule, TaskSchedule } from '@/types'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (17:07 UTC).
const TZ = 'America/Sao_Paulo'
const FRIDAYS: RecurrenceRule = { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T17:07:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

function show(task: Partial<TaskSchedule> = {}, done = false) {
  const onChange = vi.fn()
  const onSkip = vi.fn()
  const view = renderWithProviders(
    <TaskCardMenu
      lists={[]}
      onDuplicate={vi.fn()}
      onChangeList={vi.fn()}
      onDelete={vi.fn()}
      schedule={{ task: { scheduled_on: null, scheduled_time: null, series: null, ...task }, done, timeZone: TZ, onChange, onSkip }}
    />,
  )
  return { onChange, onSkip, ...view }
}

/** Opens `⋮ > Agendar` with the keyboard, as a submenu opens. */
async function openSchedule(user: ReturnType<typeof show>['user']) {
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  ;(await screen.findByRole('menuitem', { name: 'Schedule' })).focus()
  await user.keyboard('{ArrowRight}')
  return screen.findByRole('menuitemcheckbox', { name: 'Today' })
}
const submenu = () => screen.getByRole('menuitemcheckbox', { name: 'Today' }).closest<HTMLElement>('[role="menu"]')!

describe('TaskCardMenu: Agendar (US-1)', () => {
  it('offers Hoje, Amanhã, Próxima segunda and the picker, and nothing to remove on a task without a schedule', async () => {
    const { user } = show()
    await openSchedule(user)
    const items = [...submenu().querySelectorAll('[role^="menuitem"]')].map((item) => item.textContent?.trim())
    expect(items).toEqual(['Today', 'Tomorrow', 'Next Monday', 'Pick date, time and repeat…'])
  })

  it.each([
    ['Today', '2026-11-11'],
    ['Tomorrow', '2026-11-12'],
    ['Next Monday', '2026-11-16'],
  ])('%s schedules %s, keeping the time and the rule', async (name, day) => {
    const { user, onChange } = show()
    await openSchedule(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name }))
    expect(onChange).toHaveBeenCalledWith({ scheduled_on: day })
  })

  it('a shortcut keeps a time that is still ahead; Hoje with a time that has passed schedules today without a time (D24)', async () => {
    const ahead = show({ scheduled_on: '2026-11-13', scheduled_time: '16:00' })
    await openSchedule(ahead.user)
    await ahead.user.click(screen.getByRole('menuitemcheckbox', { name: 'Today' }))
    expect(ahead.onChange).toHaveBeenCalledWith({ scheduled_on: '2026-11-11' })
    ahead.unmount()

    const passed = show({ scheduled_on: '2026-11-13', scheduled_time: '09:00' })
    await openSchedule(passed.user)
    await passed.user.click(screen.getByRole('menuitemcheckbox', { name: 'Today' }))
    expect(passed.onChange).toHaveBeenCalledWith({ scheduled_on: '2026-11-11', scheduled_time: null })
  })

  it('a scheduled task shows its schedule, marks its day and offers Remover agendamento, which clears the day', async () => {
    const { user, onChange } = show({ scheduled_on: '2026-11-12', scheduled_time: '10:00' })
    await openSchedule(user)
    expect(within(submenu()).getByText('Thu, Nov 12 · 10:00')).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Tomorrow' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Today' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('menuitem', { name: 'Stop repeating' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Remove schedule' }))
    expect(onChange).toHaveBeenCalledWith({ scheduled_on: null })
  })

  it('is off in Done, with no skip', async () => {
    const { user } = show({ scheduled_on: '2026-11-13', series: { id: 's', rule: FRIDAYS, next_on: '2026-11-20' } }, true)
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Schedule' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('menuitem', { name: 'Skip this occurrence' })).not.toBeInTheDocument()
  })
})

describe('TaskCardMenu: a series (US-9, US-12)', () => {
  const series = { scheduled_on: '2026-11-13', scheduled_time: '14:00', series: { id: 's', rule: FRIDAYS, next_on: '2026-11-20' } }

  it('shows the rule and Parar de repetir, which stops the rule only', async () => {
    const { user, onChange } = show(series)
    await openSchedule(user)
    expect(within(submenu()).getByText('Repeats every Friday')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Stop repeating' }))
    expect(onChange).toHaveBeenCalledWith({ recurrence: null })
  })

  it('offers Pular esta ocorrência in the menu', async () => {
    const { user, onSkip } = show(series)
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Skip this occurrence' }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('a task without a series has no skip', async () => {
    const { user } = show({ scheduled_on: '2026-11-13' })
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await screen.findByRole('menuitem', { name: 'Schedule' })
    expect(screen.queryByRole('menuitem', { name: 'Skip this occurrence' })).not.toBeInTheDocument()
  })
})

describe('TaskCardMenu: Escolher data, hora e repetição… (US-1, US-9)', () => {
  it('opens the picker and saves the day, the time and a new rule', async () => {
    const { user, onChange } = show()
    await openSchedule(user)
    await user.click(screen.getByRole('menuitem', { name: 'Pick date, time and repeat…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Schedule task' })
    await user.click(within(dialog).getByRole('button', { name: 'Fri, Nov 13' }))
    await user.selectOptions(within(dialog).getByLabelText('Time'), '14:00')
    await user.click(within(dialog).getByRole('radio', { name: 'Every Friday' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(onChange).toHaveBeenCalledWith({ scheduled_on: '2026-11-13', scheduled_time: '14:00', recurrence: FRIDAYS })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('starts from the schedule of the task and leaves its rule out when it did not change', async () => {
    const { user, onChange } = show({ scheduled_on: '2026-11-13', scheduled_time: '14:00', series: { id: 's', rule: FRIDAYS, next_on: null } })
    await openSchedule(user)
    await user.click(screen.getByRole('menuitem', { name: 'Pick date, time and repeat…' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: 'Every Friday' })).toBeChecked()
    await user.selectOptions(within(dialog).getByLabelText('Time'), '15:00')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(onChange).toHaveBeenCalledWith({ scheduled_on: '2026-11-13', scheduled_time: '15:00' })
  })
})
