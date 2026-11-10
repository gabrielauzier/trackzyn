import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { longDay, recurrenceSummary, seriesDays, shortWeekday } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import type { RecurrenceRule } from '@/types'

type End = 'never' | 'until' | 'count'

interface CustomRecurrenceProps {
  /** The day of the occurrence, which the rule starts from. */
  day: string
  /** The rule it starts from. */
  rule: RecurrenceRule
  /** The rule as edited, or null while it is not valid. */
  onChange: (rule: RecurrenceRule | null) => void
}

const whole = (text: string) => (/^\d+$/.test(text) ? Number(text) : NaN)

/**
 * `Personalizado…` (US-9, D15): `A cada <N> <dias | semanas | meses>`, the weekdays as toggles on weeks, the day of
 * the month on months, and `Termina` (never, on a day, after N times), with the summary and the first days of the
 * series. An interval outside 1 to 99, a count outside 1 to 999, a week without a day, a month day outside 1 to 31
 * and an end before the start are refused with their message, and the rule is not handed over.
 */
export function CustomRecurrence({ day, rule, onChange }: CustomRecurrenceProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [interval, setEvery] = useState(String(rule.interval))
  const [freq, setFreq] = useState(rule.freq)
  const [weekdays, setWeekdays] = useState<number[]>(rule.weekdays ?? [])
  const [monthDay, setMonthDay] = useState(String(rule.month_day ?? Number(day.slice(8))))
  const [end, setEnd] = useState<End>(rule.until !== null ? 'until' : rule.count !== null ? 'count' : 'never')
  const [until, setUntil] = useState(rule.until ?? '')
  const [count, setCount] = useState(String(rule.count ?? 5))

  type State = { interval: string; freq: RecurrenceRule['freq']; weekdays: number[]; monthDay: string; end: End; until: string; count: string }
  const validate = (state: State) => {
    const errors: string[] = []
    const every = whole(state.interval)
    if (!(every >= 1 && every <= 99)) errors.push(t('schedule.intervalRange'))
    if (state.freq === 'weekly' && state.weekdays.length === 0) errors.push(t('schedule.weekdaysRequired'))
    const dayOfMonth = whole(state.monthDay)
    if (state.freq === 'monthly' && !(dayOfMonth >= 1 && dayOfMonth <= 31)) errors.push(t('schedule.monthDayRange'))
    const times = whole(state.count)
    if (state.end === 'count' && !(times >= 1 && times <= 999)) errors.push(t('schedule.countRange'))
    if (state.end === 'until' && (state.until === '' || state.until < day)) errors.push(t('schedule.untilBeforeStart'))
    const built: RecurrenceRule = {
      freq: state.freq,
      interval: every,
      weekdays: state.freq === 'weekly' ? [...state.weekdays].sort((a, b) => a - b) : null,
      month_day: state.freq === 'monthly' ? dayOfMonth : null,
      until: state.end === 'until' ? state.until : null,
      count: state.end === 'count' ? times : null,
    }
    return { errors, rule: errors.length === 0 ? built : null }
  }

  const current: State = { interval, freq, weekdays, monthDay, end, until, count }
  const { errors, rule: valid } = validate(current)
  const update = (changes: Partial<State>) => {
    const next = { ...current, ...changes }
    setEvery(next.interval)
    setFreq(next.freq)
    setWeekdays(next.weekdays)
    setMonthDay(next.monthDay)
    setEnd(next.end)
    setUntil(next.until)
    setCount(next.count)
    onChange(validate(next).rule)
  }

  const unitOptions = (['daily', 'weekly', 'monthly'] as const).map((value) => ({
    value,
    label: t(`schedule.unit_${value}`, { count: Number.isNaN(whole(interval)) ? 1 : whole(interval) }),
  }))
  const field = 'h-8 rounded-lg border border-input bg-card px-2 text-sm'

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-2 text-sm">
      <div className="flex items-center gap-2">
        <label htmlFor="recurrence-interval">{t('schedule.every')}</label>
        <Input
          id="recurrence-interval"
          inputMode="numeric"
          className="h-8 w-14"
          value={interval}
          aria-label={t('schedule.intervalLabel')}
          onChange={(event) => update({ interval: event.target.value })}
        />
        <select aria-label={t('schedule.unitLabel')} className={field} value={freq} onChange={(event) => update({ freq: event.target.value as State['freq'] })}>
          {unitOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {freq === 'weekly' && (
        <div role="group" aria-label={t('schedule.weekdaysLabel')} className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
            const on = weekdays.includes(weekday)
            return (
              <button
                key={weekday}
                type="button"
                aria-pressed={on}
                onClick={() => update({ weekdays: on ? weekdays.filter((other) => other !== weekday) : [...weekdays, weekday] })}
                className={cn(
                  'h-7 min-w-8 rounded-md border px-1 text-xs capitalize transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted/60',
                )}
              >
                {shortWeekday(weekday, t)}
              </button>
            )
          })}
        </div>
      )}

      {freq === 'monthly' && (
        <div className="flex items-center gap-2">
          <label htmlFor="recurrence-month-day">{t('schedule.onDayLabel')}</label>
          <Input
            id="recurrence-month-day"
            inputMode="numeric"
            className="h-8 w-14"
            value={monthDay}
            onChange={(event) => update({ monthDay: event.target.value })}
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-medium">{t('schedule.ends')}</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="recurrence-end" className="accent-primary" checked={end === 'never'} onChange={() => update({ end: 'never' })} />
          {t('schedule.endsNever')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="recurrence-end-until"
            type="radio"
            name="recurrence-end"
            className="accent-primary"
            checked={end === 'until'}
            onChange={() => update({ end: 'until' })}
          />
          <label htmlFor="recurrence-end-until">{t('schedule.endsOn')}</label>
          <input
            type="date"
            aria-label={t('schedule.endDate')}
            className={field}
            min={day}
            value={until}
            disabled={end !== 'until'}
            onChange={(event) => update({ until: event.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="recurrence-end-count"
            type="radio"
            name="recurrence-end"
            className="accent-primary"
            checked={end === 'count'}
            onChange={() => update({ end: 'count' })}
          />
          <label htmlFor="recurrence-end-count">{t('schedule.endsAfter')}</label>
          <Input
            inputMode="numeric"
            aria-label={t('schedule.countLabel')}
            className="h-8 w-16"
            value={count}
            disabled={end !== 'count'}
            onChange={(event) => update({ count: event.target.value })}
          />
          <span>{t('schedule.timesWord', { count: Number.isNaN(whole(count)) ? 2 : whole(count) })}</span>
        </div>
      </fieldset>

      {errors.map((error) => (
        <p key={error} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ))}
      {valid && (
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{recurrenceSummary(valid, t, language)}</p>
          <p>
            {t('schedule.nextDays', {
              days: seriesDays(valid, day, 3)
                .map((next) => longDay(next, t, language))
                .join(' · '),
            })}
          </p>
        </div>
      )}
    </div>
  )
}
