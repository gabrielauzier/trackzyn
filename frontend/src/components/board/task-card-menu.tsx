import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Calendar, CalendarClock, CalendarX, Clock, Copy, MoreVertical, Repeat, Replace, SkipForward, Trash2 } from 'lucide-react'
import { SchedulePicker, type ScheduleValue } from '@/components/schedule/schedule-picker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { todayInTimezone } from '@/lib/date-utils'
import { addDays, clockIn, longDay, repeatsLabel, weekdayOf } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import type { RecurrenceRule, TaskSchedule } from '@/types'

/** What a schedule item of the menu changes; a field left out keeps its value. */
export interface ScheduleChange {
  scheduled_on?: string | null
  scheduled_time?: string | null
  recurrence?: RecurrenceRule | null
}

interface TaskCardMenuProps {
  /** The lists the task can go to: every list but its own. */
  lists: { id: string; name: string }[]
  onDuplicate: () => void
  onChangeList: (listId: string) => void
  onDelete: () => void
  /** One column to the left; absent in the first column, where the item is off. */
  onMoveLeft?: () => void
  /** One column to the right; absent in Done, the last column, where the item is off. */
  onMoveRight?: () => void
  /** The schedule of the task; `Agendar` is off in Done (US-1). */
  schedule?: {
    task: TaskSchedule
    done: boolean
    /** The workspace's timezone, which decides today and the time that has passed. */
    timeZone: string | null | undefined
    onChange: (change: ScheduleChange) => void
    /** `Pular esta ocorrência`, for an occurrence of a series (D18). */
    onSkip: () => void
  }
}

/** The "more actions" of a task card: move one column, change list, schedule, duplicate and delete. */
export function TaskCardMenu({ lists, onDuplicate, onChangeList, onDelete, onMoveLeft, onMoveRight, schedule }: TaskCardMenuProps) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="size-6" aria-label={t('board.moreActions')}>
            <MoreVertical size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* The arrows that sat on the card (2026-11-06). */}
          <DropdownMenuItem disabled={!onMoveLeft} onSelect={onMoveLeft}>
            <ArrowLeft size={14} /> {t('board.moveLeft')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!onMoveRight} onSelect={onMoveRight}>
            <ArrowRight size={14} /> {t('board.moveRight')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Replace size={14} /> {t('board.changeList')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {lists.length === 0 ? (
                <DropdownMenuItem disabled>{t('board.noOtherLists')}</DropdownMenuItem>
              ) : (
                lists.map((list) => (
                  <DropdownMenuItem key={list.id} onSelect={() => onChangeList(list.id)}>
                    {list.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {schedule && <ScheduleSubmenu schedule={schedule} onPick={() => setPicking(true)} />}
          {schedule?.task.series && !schedule.done && (
            <DropdownMenuItem onSelect={schedule.onSkip}>
              <SkipForward size={14} /> {t('schedule.skip')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy size={14} /> {t('board.duplicateTask')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 size={14} /> {t('board.deleteTask')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {schedule && (
        <Dialog open={picking} onOpenChange={setPicking}>
          <DialogContent className="w-auto sm:max-w-fit">
            <DialogHeader>
              <DialogTitle>{t('schedule.pickerTitle')}</DialogTitle>
            </DialogHeader>
            <SchedulePicker
              value={{ on: schedule.task.scheduled_on, time: schedule.task.scheduled_time, recurrence: schedule.task.series?.rule ?? null }}
              timeZone={schedule.timeZone}
              onCancel={() => setPicking(false)}
              onSubmit={(value) => {
                setPicking(false)
                schedule.onChange(pickedChange(schedule.task, value))
              }}
            />
          </DialogContent>
        </Dialog>
        )}
    </>
  )
}

/** The picker's value as a change: the rule goes only when it is not the one the task has. */
function pickedChange(task: TaskSchedule, value: ScheduleValue): ScheduleChange {
  const change: ScheduleChange = { scheduled_on: value.on, scheduled_time: value.time }
  if (JSON.stringify(value.recurrence) !== JSON.stringify(task.series?.rule ?? null)) change.recurrence = value.recurrence
  return change
}

/** `Agendar` (US-1, US-9): the schedule now and its rule, the day shortcuts, the picker, and stopping or removing. */
function ScheduleSubmenu({ schedule, onPick }: { schedule: NonNullable<TaskCardMenuProps['schedule']>; onPick: () => void }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const { task, timeZone, onChange } = schedule
  const now = new Date()
  const today = todayInTimezone(timeZone, now)
  // The next Monday after today, a week on when today is Monday.
  const nextMonday = addDays(today, 8 - weekdayOf(today))
  const shortcuts = [
    { day: today, label: t('schedule.today') },
    { day: addDays(today, 1), label: t('schedule.tomorrow') },
    { day: nextMonday, label: t('schedule.nextMonday') },
  ]
  // The shortcuts keep the time and the rule; today with a time that has passed goes without a time (D24).
  const shortcut = (day: string) =>
    onChange(day === today && task.scheduled_time !== null && task.scheduled_time <= clockIn(timeZone, now) ? { scheduled_on: day, scheduled_time: null } : { scheduled_on: day })
  const when = task.scheduled_on === null ? null : `${longDay(task.scheduled_on, t, language)}${task.scheduled_time ? ` · ${task.scheduled_time}` : ''}`

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={schedule.done}>
        <CalendarClock size={14} /> {t('schedule.menu')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {when && (
          <>
            <DropdownMenuLabel className="flex items-start gap-2 text-xs font-normal text-muted-foreground">
              <Calendar size={12} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex flex-col gap-0.5">
                <span>
                  {t('schedule.scheduledForPrefix')} <strong className="font-semibold text-foreground first-letter:uppercase inline-block">{when}</strong>
                </span>
                {task.series && (
                  <span className="flex items-center gap-1 text-primary">
                    <Repeat size={11} aria-hidden="true" /> {repeatsLabel(task.series.rule, t, language)}
                  </span>
                )}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {shortcuts.map(({ day, label }) => {
          const current = task.scheduled_on === day
          return (
            // The day of the task is marked by the background, as in the design; the role keeps it checked for assistive tech.
            <DropdownMenuItem
              key={label}
              role="menuitemcheckbox"
              aria-checked={current}
              className={cn(current && 'bg-muted')}
              onSelect={() => shortcut(day)}
            >
              <span className="flex-1">{label}</span>
              <span className="text-xs text-muted-foreground first-letter:uppercase">{longDay(day, t, language)}</span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPick}>
          <Clock size={14} /> {t('schedule.pick')}
        </DropdownMenuItem>
        {(task.series || task.scheduled_on) && <DropdownMenuSeparator />}
        {task.series && (
          <DropdownMenuItem onSelect={() => onChange({ recurrence: null })}>
            <Repeat size={14} /> {t('schedule.stopRepeating')}
          </DropdownMenuItem>
        )}
        {task.scheduled_on && (
          <DropdownMenuItem variant="destructive" onSelect={() => onChange({ scheduled_on: null })}>
            <CalendarX size={14} /> {t('schedule.remove')}
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
