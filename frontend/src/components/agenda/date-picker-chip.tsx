import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'

interface DatePickerChipProps {
  /** Today in the workspace timezone, YYYY-MM-DD. */
  today: string
  /** The day the agenda shows, whose month the calendar opens on. */
  shown: string
  /** The chosen day, YYYY-MM-DD. */
  onPick: (day: string) => void
  /** The chip's text; `Hoje` when absent. */
  label?: string
}

/** The calendar works in local dates; a YYYY-MM-DD day is read as that day at local midnight. */
const localDate = (day: string) => new Date(`${day}T00:00:00`)

/**
 * The `Hoje` chip (AGENDA-39): it opens the calendar of the month, with today filled in indigo, the month
 * arrows and `Ir para hoje`; choosing a day hands it over and closes the calendar (AGENDA-40, AGENDA-41).
 */
export function DatePickerChip({ today, shown, onPick, label }: DatePickerChipProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)

  const pick = (day: string) => {
    setOpen(false)
    onPick(day)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CalendarDays size={14} />
          {label ?? t('agenda.today')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={resolveDateFnsLocale(i18n.resolvedLanguage ?? i18n.language)}
          // Today is the filled day, so it reads at a glance where now is.
          selected={localDate(today)}
          defaultMonth={localDate(shown)}
          onSelect={(date) => date && pick(format(date, 'yyyy-MM-dd'))}
        />
        <div className="border-t p-2">
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => pick(today)}>
            {t('agenda.goToToday')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
