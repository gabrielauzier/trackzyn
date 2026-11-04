import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, ZoomIn } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ALL_DAYS, WORK_DAYS, type WeekDay, toggleDay } from '@/lib/agenda/week-days'
import { ZOOMS, type Zoom } from '@/lib/agenda/zoom'
import { cn } from '@/lib/utils'

interface AgendaViewMenuProps {
  /** The week days shown, 0 for Monday to 6 for Sunday. */
  days: WeekDay[]
  /** Whether the menu offers the week days: only in the week view (DAYS-07, DAYS-08). */
  showDays: boolean
  zoom: Zoom
  onDaysChange: (days: WeekDay[]) => void
  onZoomChange: (zoom: Zoom) => void
}

/** A Monday, to name the week days in the reader's language. */
const MONDAY = Date.UTC(2026, 10, 2)

function dayName(day: WeekDay, locale: string): string {
  const name = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(MONDAY + day * 86_400_000))
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

/**
 * The view options of the agenda (DAYS-01 to DAYS-18): a button in the corner of the grid that opens a menu with the
 * week days to show (week view only) and the zoom. Every change applies at once, and the menu stays open.
 */
export function AgendaViewMenu({ days, showDays, zoom, onDaysChange, onZoomChange }: AgendaViewMenuProps) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const filtered = showDays && days.length < ALL_DAYS.length
  const label = filtered ? t('agenda.viewMenu.labelFiltered', { shown: days.length }) : t('agenda.viewMenu.label')
  const shortcut = (target: WeekDay[], text: string) => {
    const active = target.length === days.length && target.every((day) => days.includes(day))
    return (
      <button
        type="button"
        aria-pressed={active}
        className={cn(
          'h-7 rounded-full px-2.5 text-xs font-medium',
          active ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground hover:bg-muted/70',
        )}
        onClick={() => onDaysChange(target)}
      >
        {text}
      </button>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="relative inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:border-primary data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {filtered && (
            <span data-filter-dot aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-card bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={t('agenda.viewMenu.label')} className="flex w-72 flex-col gap-3 p-3">
        {showDays && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-2">
              <span id={`${id}-days`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('agenda.viewMenu.days')}
              </span>
              <span className="flex gap-1">
                {shortcut(ALL_DAYS, t('agenda.viewMenu.allDays'))}
                {shortcut(WORK_DAYS, t('agenda.viewMenu.workDays'))}
              </span>
            </div>
            <div role="group" aria-labelledby={`${id}-days`} className="flex flex-col">
              {ALL_DAYS.map((day) => {
                const name = dayName(day, i18n.language)
                const checked = days.includes(day)
                // The last shown day stays: the week always shows one (DAYS-13).
                const onlyOne = checked && days.length === 1
                return (
                  <label
                    key={day}
                    className={cn('flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-sm', onlyOne ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted')}
                  >
                    <Checkbox
                      aria-label={name}
                      checked={checked}
                      disabled={onlyOne}
                      onCheckedChange={() => onDaysChange(toggleDay(days, day))}
                    />
                    <span aria-hidden>{name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
        {showDays && <div className="-mx-3 h-px bg-border" />}
        <div className="flex items-center justify-between px-2">
          <span id={`${id}-zoom`} className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ZoomIn className="size-3.5" aria-hidden />
            {t('agenda.zoom')}
          </span>
          <div role="group" aria-labelledby={`${id}-zoom`} className="flex rounded-lg bg-muted p-0.5">
            {ZOOMS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={zoom === option}
                className={cn(
                  'rounded-md px-2.5 py-1 text-sm font-medium tabular-nums',
                  zoom === option ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
                onClick={() => onZoomChange(option)}
              >
                {t('agenda.zoomLevel', { level: option })}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
