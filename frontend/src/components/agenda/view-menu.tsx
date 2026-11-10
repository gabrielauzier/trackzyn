import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, ZoomIn } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ALL_DAYS, WORK_DAYS, type WeekDay, toggleDay } from '@/lib/agenda/week-days'
import { ZOOMS, type Zoom } from '@/lib/agenda/zoom'
import { cn } from '@/lib/utils'

interface AgendaViewMenuProps {
  /** The week days shown, 0 for Monday to 6 for Sunday. */
  days: WeekDay[]
  /** Whether the menu offers the week days: only in the week view (DAYS-07, DAYS-08). */
  showDays: boolean
  zoom: Zoom
  /** Whether the agenda hides the breaks (ADJ-21). */
  hideBreaks?: boolean
  onDaysChange: (days: WeekDay[]) => void
  onZoomChange: (zoom: Zoom) => void
  onHideBreaksChange?: (hide: boolean) => void
  /** Whether the agenda hides the scheduled tasks and the planned tasks. */
  hideScheduled?: boolean
  onHideScheduledChange?: (hide: boolean) => void
}

/** A Monday, to name the week days in the reader's language. */
const MONDAY = Date.UTC(2026, 10, 2)

function dayName(day: WeekDay, locale: string, weekday: 'long' | 'short' = 'long'): string {
  const name = new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' }).format(new Date(MONDAY + day * 86_400_000)).replace(/\.$/, '')
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

/**
 * The view options of the agenda (DAYS-01 to DAYS-18): a button in the corner of the grid that opens a menu with the
 * week days to show (week view only), `Exibir intervalos` (ADJ-21), `Exibir agendamentos` and the zoom. Both switches
 * are on when nothing is hidden. Every change applies at once, and the menu stays open.
 */
export function AgendaViewMenu({
  days,
  showDays,
  zoom,
  hideBreaks = false,
  hideScheduled = false,
  onDaysChange,
  onZoomChange,
  onHideBreaksChange,
  onHideScheduledChange,
}: AgendaViewMenuProps) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
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
          ref={trigger}
          type="button"
          aria-label={label}
          className="relative inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:border-primary data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {/* A hidden day, hidden breaks or hidden schedules: the view differs from the default (DAYS-14, ADJ-24). */}
          {(filtered || hideBreaks || hideScheduled) && (
            <span data-filter-dot aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-card bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        aria-label={t('agenda.viewMenu.label')}
        className="flex w-88 flex-col gap-3 p-3"
        // A non-modal popover gives the focus back on Esc only; every close, a click outside too, returns it (DAYS-04).
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          trigger.current?.focus()
        }}
      >
        {showDays && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-4 px-2">
              <span id={`${id}-days`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('agenda.viewMenu.days')}
              </span>
              <span className="flex gap-1">
                {shortcut(ALL_DAYS, t('agenda.viewMenu.allDays'))}
                {shortcut(WORK_DAYS, t('agenda.viewMenu.workDays'))}
              </span>
            </div>
            {/* One line of pills, short names shown and full names read, like the shortcuts above (DAYS-07). */}
            <div role="group" aria-labelledby={`${id}-days`} className="flex gap-1 px-2">
              {ALL_DAYS.map((day) => {
                const shown = days.includes(day)
                // The last shown day stays: the week always shows one (DAYS-13).
                const onlyOne = shown && days.length === 1
                return (
                  <button
                    key={day}
                    type="button"
                    data-day={day}
                    aria-label={dayName(day, i18n.language)}
                    aria-pressed={shown}
                    disabled={onlyOne}
                    className={cn(
                      'h-8 min-w-0 flex-1 rounded-full border-[1.5px] text-xs font-medium transition-colors disabled:cursor-not-allowed',
                      shown ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                    )}
                    onClick={() => onDaysChange(toggleDay(days, day))}
                  >
                    <span aria-hidden>{dayName(day, i18n.language, 'short')}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {showDays && <div className="-mx-3 h-px bg-border" />}
        <div data-hide-breaks className="flex items-center justify-between gap-4 px-2">
          <div className="flex flex-col gap-0.5">
            <label id={`${id}-breaks`} htmlFor={`${id}-breaks-switch`} className="text-sm font-medium">
              {t('agenda.viewMenu.showBreaks')}
            </label>
            <span id={`${id}-breaks-hint`} className="text-xs text-muted-foreground">
              {t('agenda.viewMenu.showBreaksHint')}
            </span>
          </div>
          <Switch
            id={`${id}-breaks-switch`}
            aria-labelledby={`${id}-breaks`}
            checked={!hideBreaks}
            onCheckedChange={(show) => onHideBreaksChange?.(!show)}
          />
        </div>
        <div data-hide-scheduled className="flex items-center justify-between gap-4 px-2">
          <div className="flex flex-col gap-0.5">
            <label id={`${id}-scheduled`} htmlFor={`${id}-scheduled-switch`} className="text-sm font-medium">
              {t('agenda.viewMenu.showScheduled')}
            </label>
            <span className="text-xs text-muted-foreground">{t('agenda.viewMenu.showScheduledHint')}</span>
          </div>
          <Switch
            id={`${id}-scheduled-switch`}
            aria-labelledby={`${id}-scheduled`}
            checked={!hideScheduled}
            onCheckedChange={(show) => onHideScheduledChange?.(!show)}
          />
        </div>
        <div className="-mx-3 h-px bg-border" />
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
