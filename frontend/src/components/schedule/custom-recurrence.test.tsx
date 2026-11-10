import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { CustomRecurrence } from '@/components/schedule/custom-recurrence'
import { SchedulePicker } from '@/components/schedule/schedule-picker'
import { defaultCustomRule } from '@/lib/schedule'
import { i18n, renderWithProviders } from '@/test/utils'
import type { RecurrenceRule } from '@/types'

// Friday 2026-11-13.
const DAY = '2026-11-13'

function show(rule: RecurrenceRule = defaultCustomRule(DAY)) {
  const onChange = vi.fn()
  return { onChange, ...renderWithProviders(<CustomRecurrence day={DAY} rule={rule} onChange={onChange} />) }
}
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)![0] as RecurrenceRule | null
const weekday = (name: string) => within(screen.getByRole('group', { name: 'Days of the week' })).getByRole('button', { name })

describe('CustomRecurrence (US-9, D15)', () => {
  it('starts every week on the weekday of the day, never ending, with the summary and the first days', () => {
    show()
    expect(screen.getByLabelText('Interval')).toHaveValue('1')
    expect(screen.getByLabelText('Period')).toHaveValue('weekly')
    expect(weekday('Fri')).toHaveAttribute('aria-pressed', 'true')
    expect(weekday('Mon')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('radio', { name: 'Never' })).toBeChecked()
    expect(screen.getByText('Every Friday')).toBeInTheDocument()
    expect(screen.getByText('Next: Fri, Nov 13 · Fri, Nov 20 · Fri, Nov 27')).toBeInTheDocument()
  })

  it('A cada 2 semanas, ter e qui, 5 vezes: hands over the rule and says it', async () => {
    const { user, onChange } = show()
    await user.clear(screen.getByLabelText('Interval'))
    await user.type(screen.getByLabelText('Interval'), '2')
    await user.click(weekday('Tue'))
    await user.click(weekday('Thu'))
    await user.click(weekday('Fri'))
    await user.click(screen.getByRole('radio', { name: 'After' }))
    await user.clear(screen.getByLabelText('Number of times'))
    await user.type(screen.getByLabelText('Number of times'), '5')

    expect(last(onChange)).toEqual({ freq: 'weekly', interval: 2, weekdays: [2, 4], month_day: null, until: null, count: 5 })
    expect(screen.getByText('Every 2 weeks, Tue and Thu, 5 times')).toBeInTheDocument()
    expect(screen.getByText('Next: Fri, Nov 13 · Tue, Nov 24 · Thu, Nov 26')).toBeInTheDocument()
  })

  it('says it in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show({ freq: 'weekly', interval: 2, weekdays: [1, 3], month_day: null, until: null, count: 5 })
      expect(screen.getByText('A cada 2 semanas, seg e qua, 5 vezes')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it.each([
    ['0', false],
    ['100', false],
    ['1', true],
    ['99', true],
  ])('an interval of %s is accepted: %s', async (value, accepted) => {
    const { user, onChange } = show()
    await user.clear(screen.getByLabelText('Interval'))
    await user.type(screen.getByLabelText('Interval'), value)
    if (accepted) {
      expect(last(onChange)).toMatchObject({ interval: Number(value) })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } else {
      expect(last(onChange)).toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent('Use an interval from 1 to 99')
    }
  })

  it.each([
    ['0', false],
    ['1000', false],
    ['1', true],
    ['999', true],
  ])('a count of %s is accepted: %s', async (value, accepted) => {
    const { user, onChange } = show()
    await user.click(screen.getByRole('radio', { name: 'After' }))
    await user.clear(screen.getByLabelText('Number of times'))
    await user.type(screen.getByLabelText('Number of times'), value)
    if (accepted) expect(last(onChange)).toMatchObject({ count: Number(value), until: null })
    else {
      expect(last(onChange)).toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent('Use 1 to 999 times')
    }
  })

  it('a week needs at least one day', async () => {
    const { user, onChange } = show()
    await user.click(weekday('Fri'))
    expect(last(onChange)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one day of the week')
  })

  it('months take the day of the month, from 1 to 31, and 29 to 31 fall on the last day of a shorter month', async () => {
    const { user, onChange } = show()
    await user.selectOptions(screen.getByLabelText('Period'), 'monthly')
    expect(screen.getByLabelText('On day')).toHaveValue('13')
    expect(last(onChange)).toEqual({ freq: 'monthly', interval: 1, weekdays: null, month_day: 13, until: null, count: null })

    await user.clear(screen.getByLabelText('On day'))
    await user.type(screen.getByLabelText('On day'), '31')
    expect(screen.getByText('Every month on day 31 (or the last day)')).toBeInTheDocument()
    expect(screen.getByText('Next: Fri, Nov 13 · Mon, Nov 30 · Thu, Dec 31')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('On day'))
    await user.type(screen.getByLabelText('On day'), '32')
    expect(last(onChange)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Use a day from 1 to 31')
  })

  it('days: every 3 days', async () => {
    const { user, onChange } = show()
    await user.selectOptions(screen.getByLabelText('Period'), 'daily')
    await user.clear(screen.getByLabelText('Interval'))
    await user.type(screen.getByLabelText('Interval'), '3')
    expect(last(onChange)).toEqual({ freq: 'daily', interval: 3, weekdays: null, month_day: null, until: null, count: null })
    expect(screen.getByText('Every 3 days')).toBeInTheDocument()
  })

  it('an end on a day before the start is refused; the day of the start is accepted', async () => {
    const { user, onChange } = show()
    await user.click(screen.getByRole('radio', { name: 'On' }))
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-12' } })
    expect(last(onChange)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('The end cannot be before the start')

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-11-13' } })
    expect(last(onChange)).toMatchObject({ until: '2026-11-13', count: null })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SchedulePicker with Personalizado…', () => {
  it('opens the editor from the day and saves its rule; an invalid rule cannot be saved', async () => {
    const onSubmit = vi.fn()
    const { user } = renderWithProviders(
      <SchedulePicker value={{ on: DAY, time: null, recurrence: null }} timeZone="America/Sao_Paulo" now={new Date('2026-11-11T17:07:00Z')} onSubmit={onSubmit} />,
    )
    await user.click(screen.getByRole('radio', { name: 'Custom…' }))
    expect(weekday('Fri')).toHaveAttribute('aria-pressed', 'true')

    await user.click(weekday('Fri'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(weekday('Mon'))
    await user.click(weekday('Wed'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({
      on: DAY,
      time: null,
      recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3], month_day: null, until: null, count: null },
    })
  })
})
