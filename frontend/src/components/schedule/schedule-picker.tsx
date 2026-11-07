import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { todayInTimezone } from '@/lib/date-utils'
import { type RepeatPreset, clockIn, dayDate, defaultCustomRule, longDay, presetOf, presetRule, repeatsLabel, TIMES, weekdayOf } from '@/lib/schedule'
import { CustomRecurrence } from '@/components/schedule/custom-recurrence'
import { cn } from '@/lib/utils'
import type { RecurrenceRule } from '@/types'

/** A day, an optional start time and an optional rule; what the picker saves. */
export interface ScheduleValue {
  on: string | null
  time: string | null
  recurrence: RecurrenceRule | null
}

interface SchedulePickerProps {
  /** What the task has now; the picker starts from it. */
  value: ScheduleValue
  /** The workspace's timezone, which decides today and the time that has passed. */
  timeZone: string | null | undefined
  onSubmit: (value: ScheduleValue) => void
  onCancel?: () => void
  /** Saving; the save button waits. */
  pending?: boolean
  now?: Date
}

/**
 * The calendar from Monday with the days before today off and today marked, the optional start time in steps of
 * 15 minutes with `Limpar hora`, and `Repetir` with the options of the chosen day and its summary (US-1, US-2, US-9).
 * A time of today that has passed is refused, in the workspace's timezone.
 */
export function SchedulePicker({ value, timeZone, onSubmit, onCancel, pending = false, now = new Date() }: SchedulePickerProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const locale = resolveDateFnsLocale(language)
  const today = todayInTimezone(timeZone, now)
  const nowTime = clockIn(timeZone, now)

  const [day, setDay] = useState<string | null>(value.on)
  const [time, setTime] = useState<string | null>(value.time)
  const [preset, setPreset] = useState<RepeatPreset>(presetOf(value.recurrence, value.on))
  const [custom, setCustom] = useState<RecurrenceRule | null>(preset === 'custom' ? value.recurrence : null)

  const passed = (candidate: string) => day === today && candidate < nowTime
  const timePassed = time !== null && passed(time)
  const rule = day === null ? null : preset === 'custom' ? custom : presetRule(preset, day)
  const monthDay = day === null ? null : dayDate(day).getDate()
  const canSave = day !== null && !timePassed && (preset !== 'custom' || custom !== null)

  const options: { preset: RepeatPreset; label: string }[] =
    day === null
      ? []
      : [
          { preset: 'none', label: t('schedule.noRepeat') },
          { preset: 'daily', label: t('schedule.everyDay') },
          { preset: 'weekdays', label: t('schedule.weekdays') },
          { preset: 'weekly', label: t(`schedule.everyWeekday_${weekdayOf(day)}`) },
          { preset: 'monthly', label: t('schedule.everyMonthOn', { day: monthDay }) + (monthDay! >= 29 ? t('schedule.orLastDay') : '') },
          { preset: 'custom', label: t('schedule.custom') },
        ]

  return (
    <form
      className="flex w-[268px] flex-col gap-3 p-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) onSubmit({ on: day, time, recurrence: rule })
      }}
    >
      <Calendar
        mode="single"
        className="w-full p-0"
        locale={locale}
        weekStartsOn={1}
        today={dayDate(today)}
        selected={day === null ? undefined : dayDate(day)}
        defaultMonth={dayDate(day ?? today)}
        disabled={(date) => format(date, 'yyyy-MM-dd') < today}
        labelDay={(date) => longDay(format(date, 'yyyy-MM-dd'), t, language)}
        onSelect={(date) => date && setDay(format(date, 'yyyy-MM-dd'))}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="schedule-time">{t('schedule.time')}</Label>
        <div className="flex items-center gap-2">
          <select
            id="schedule-time"
            value={time ?? ''}
            disabled={day === null}
            aria-invalid={timePassed || undefined}
            aria-describedby={timePassed ? 'schedule-time-error' : undefined}
            onChange={(event) => setTime(event.target.value === '' ? null : event.target.value)}
            className="h-9 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
          >
            <option value="">{t('schedule.noTime')}</option>
            {TIMES.map((option) => (
              <option key={option} value={option} disabled={passed(option)}>
                {option}
              </option>
            ))}
          </select>
          {time !== null && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setTime(null)}>
              <X size={14} /> {t('schedule.clearTime')}
            </Button>
          )}
        </div>
        {timePassed && (
          <p id="schedule-time-error" role="alert" className="text-xs text-destructive">
            {t('schedule.timePassed')}
          </p>
        )}
      </div>

      {day !== null && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">{t('schedule.repeat')}</legend>
          {options.map((option) => (
            <label key={option.preset} className={cn('flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/60')}>
              <input
                type="radio"
                name="schedule-repeat"
                value={option.preset}
                checked={preset === option.preset}
                onChange={() => {
                  setPreset(option.preset)
                  // Personalizado starts from the rule the task has, or every week on the chosen day.
                  if (option.preset === 'custom' && custom === null) setCustom(defaultCustomRule(day))
                }}
                className="accent-primary"
              />
              {option.label}
            </label>
          ))}
          {preset === 'custom' && (
            // Keyed by the day: the editor starts again from a new day.
            <CustomRecurrence key={day} day={day} rule={custom ?? defaultCustomRule(day)} onChange={setCustom} />
          )}
          {preset !== 'custom' && rule !== null && (
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              {repeatsLabel(rule, t, language)}
            </p>
          )}
        </fieldset>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSave || pending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}
