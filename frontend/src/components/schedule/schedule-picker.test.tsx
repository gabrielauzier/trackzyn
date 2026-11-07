import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { SchedulePicker, type ScheduleValue } from '@/components/schedule/schedule-picker'
import { i18n, renderWithProviders } from '@/test/utils'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (17:07 UTC).
const NOW = new Date('2026-11-11T17:07:00Z')
const TZ = 'America/Sao_Paulo'
const EMPTY: ScheduleValue = { on: null, time: null, recurrence: null }

function show(value: ScheduleValue = EMPTY, onSubmit = vi.fn()) {
  return { onSubmit, ...renderWithProviders(<SchedulePicker value={value} timeZone={TZ} now={NOW} onSubmit={onSubmit} onCancel={vi.fn()} />) }
}

const day = (name: string) => screen.getByRole('button', { name })
const typeTime = (value: string) => fireEvent.change(screen.getByLabelText('Time'), { target: { value } })
const repeatOptions = () => within(screen.getByRole('group', { name: /Repe/ })).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)

describe('SchedulePicker: the calendar (US-1)', () => {
  it('starts the week on Monday, marks today and turns off the days before it, in the workspace timezone', () => {
    show()
    const headers = screen.getByRole('button', { name: 'Mon, Nov 9' }).parentElement!.previousElementSibling!
    expect(headers.firstElementChild).toHaveTextContent('Mo')
    expect(day('Tue, Nov 10')).toBeDisabled()
    expect(day('Mon, Nov 9')).toBeDisabled()
    expect(day('Wed, Nov 11')).toBeEnabled()
    expect(day('Wed, Nov 11')).toHaveAttribute('aria-current', 'date')
    expect(day('Thu, Nov 12')).toBeEnabled()
  })

  it('cannot be saved without a day', () => {
    show()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByLabelText('Time')).toBeDisabled()
  })
})

describe('SchedulePicker: the time (US-1, US-2)', () => {
  it('is an HH:MM field that starts empty and takes any minute (D34)', async () => {
    const { user, onSubmit } = show()
    const field = screen.getByLabelText('Time')
    expect(field).toHaveAttribute('type', 'time')
    expect(field).toHaveValue('')
    await user.click(day('Fri, Nov 13'))
    typeTime('09:07')
    expect(field).toHaveValue('09:07')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ on: '2026-11-13', time: '09:07', recurrence: null })
  })

  it('refuses a time of today that has passed, to the minute: a passed time cannot be saved', async () => {
    const { user, onSubmit } = show({ on: '2026-11-13', time: '09:00', recurrence: null })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(day('Wed, Nov 11'))
    expect(screen.getByRole('alert')).toHaveTextContent('This time of today has already passed')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    typeTime('14:06')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    typeTime('14:07')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ on: '2026-11-11', time: '14:07', recurrence: null })
  })

  it('Limpar hora keeps the day and saves no time', async () => {
    const { user, onSubmit } = show({ on: '2026-11-13', time: '10:00', recurrence: null })
    await user.click(screen.getByRole('button', { name: 'Clear time' }))
    expect(screen.getByLabelText('Time')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear time' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ on: '2026-11-13', time: null, recurrence: null })
  })
})

describe('SchedulePicker: Repetir (US-9)', () => {
  it('builds the options from the chosen day, Não repete first and chosen', async () => {
    const { user } = show()
    await user.click(day('Fri, Nov 13'))
    expect(repeatOptions()).toEqual(['Does not repeat', 'Every day', 'Weekdays (Mon to Fri)', 'Every Friday', 'Every month on day 13', 'Custom…'])
    expect(screen.getByRole('radio', { name: 'Does not repeat' })).toBeChecked()
  })

  it('builds them in Portuguese: para sexta, 13 nov', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user } = show()
      await user.click(day('sex, 13 nov'))
      expect(repeatOptions()).toEqual(['Não repete', 'Todo dia', 'Dias úteis (seg a sex)', 'Toda sexta', 'Todo mês no dia 13', 'Personalizado…'])
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('the monthly option of a day 29 to 31 says "ou no último dia"', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user } = show()
      await user.click(day('seg, 30 nov'))
      expect(screen.getByRole('radio', { name: 'Todo mês no dia 30 (ou no último dia)' })).toBeInTheDocument()
      await user.click(day('dom, 29 nov'))
      expect(screen.getByRole('radio', { name: 'Todo mês no dia 29 (ou no último dia)' })).toBeInTheDocument()
      await user.click(day('sáb, 28 nov'))
      expect(screen.getByRole('radio', { name: 'Todo mês no dia 28' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('saves the rule of the chosen option with the day and the time, and shows its summary', async () => {
    const { user, onSubmit } = show()
    await user.click(day('Fri, Nov 13'))
    typeTime('14:00')
    await user.click(screen.getByRole('radio', { name: 'Every Friday' }))
    expect(screen.getByText('Repeats every Friday')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({
      on: '2026-11-13',
      time: '14:00',
      recurrence: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null },
    })
  })

  it('saves weekdays and the month day', async () => {
    const { user, onSubmit } = show({ on: '2026-11-13', time: null, recurrence: null })
    await user.click(screen.getByRole('radio', { name: 'Weekdays (Mon to Fri)' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('radio', { name: 'Every month on day 13' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls.map(([value]) => value.recurrence)).toEqual([
      { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], month_day: null, until: null, count: null },
      { freq: 'monthly', interval: 1, weekdays: null, month_day: 13, until: null, count: null },
    ])
  })

  it('starts on the option of the rule the task has', () => {
    show({ on: '2026-11-13', time: '14:00', recurrence: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null } })
    expect(screen.getByRole('radio', { name: 'Every Friday' })).toBeChecked()
    expect(screen.getByLabelText('Time')).toHaveValue('14:00')
  })

  it('a rule the options do not say starts on Personalizado', () => {
    show({ on: '2026-11-13', time: null, recurrence: { freq: 'weekly', interval: 2, weekdays: [2, 4], month_day: null, until: null, count: 5 } })
    expect(screen.getByRole('radio', { name: 'Custom…' })).toBeChecked()
    expect(screen.getByText('Every 2 weeks, Tue and Thu, 5 times')).toBeInTheDocument()
  })
})

describe('SchedulePicker: a new day for an occurrence of a series (US-12, D30)', () => {
  const THURSDAYS = { freq: 'weekly' as const, interval: 1, weekdays: [4], month_day: null, until: null, count: null }
  const OCCURRENCE: ScheduleValue = { on: '2026-11-12', time: '10:00', recurrence: THURSDAYS }

  it('keeps Every Thursday chosen when the day moves to Friday, and saves the rule of the series as it is', async () => {
    const { user, onSubmit } = show(OCCURRENCE)
    await user.click(day('Fri, Nov 13'))
    expect(repeatOptions()).toEqual(['Does not repeat', 'Every Thursday', 'Every day', 'Weekdays (Mon to Fri)', 'Every Friday', 'Every month on day 13', 'Custom…'])
    expect(screen.getByRole('radio', { name: 'Every Thursday' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Every Friday' })).not.toBeChecked()
    expect(screen.getByText('Repeats every Thursday')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ on: '2026-11-13', time: '10:00', recurrence: THURSDAYS })
  })

  it('only picking another option of Repetir changes the rule', async () => {
    const { user, onSubmit } = show(OCCURRENCE)
    await user.click(day('Fri, Nov 13'))
    await user.click(screen.getByRole('radio', { name: 'Every Friday' }))
    expect(screen.getByRole('radio', { name: 'Every Thursday' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenLastCalledWith({ on: '2026-11-13', time: '10:00', recurrence: { ...THURSDAYS, weekdays: [5] } })
  })
})
