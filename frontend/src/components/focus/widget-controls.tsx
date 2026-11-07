import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleCheck, ListChecks, Maximize2, NotebookPen, Pause, Play, SkipForward, Square, TimerReset } from 'lucide-react'

import { BreakPicker } from '@/components/focus/break-picker'
import type { FocusControlActions } from '@/components/focus/focus-controls'
import { Button } from '@/components/ui/button'
import { onWidgetHover } from '@/lib/desktop/focus-window'
import type { Display } from '@/lib/focus/display'
import { formatClock } from '@/lib/focus/format-clock'
import { cn } from '@/lib/utils'

const DRAG_REGION = '[-webkit-app-region:drag]'
const NO_DRAG_REGION = '[-webkit-app-region:no-drag]'
/** How long the controls stay after the cursor leaves, so moving between them does not flicker. */
export const HIDE_DELAY_MS = 150

interface WidgetControlsProps {
  display: Display
  /** The task in focus; `null` with nothing left in Today. `subtasks` is absent in an answer stored before it existed. */
  task: { id: string; title: string; spent_seconds?: number; subtasks?: { done: number; total: number } } | null
  /** Pending tasks of Today; with one, there is nothing to skip to (FOCUS-07). */
  pending: number
  /** Whether the user may change the workspace; without it, only `Expandir`. */
  canWrite: boolean
  actions: FocusControlActions & { extend: (taskId: string) => unknown }
  onNotes: () => void
  /** Opens or closes the subtasks panel, left of `Anotações` (#16). */
  onSubtasks?: () => void
  /** Whether the subtasks panel is open. */
  subtasksOpen?: boolean
  /** The pointer went down on `Subtarefas`, before the notes field loses focus to it. */
  onSubtasksPointerDown?: () => void
  /** The pointer went down on `Anotações`, before the notes field loses focus to it. */
  onNotesPointerDown?: () => void
  onExpand: () => void
  /** Told when the break picker opens and closes, so the widget can grow for it. */
  onPanelChange: (open: boolean) => void
}

interface IconButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  onPointerDown?: () => void
  children: ReactNode
}

function IconButton({ label, onClick, disabled, pressed, onPointerDown, children }: IconButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={pressed ? 'bg-accent text-accent-foreground' : undefined}
    >
      {children}
    </Button>
  )
}

/**
 * The focus widget: the title of the task, cut with an ellipsis, and the timer (WIDGET-07); with the
 * cursor over it (or the keyboard inside it, or the break picker open), `Intervalo`, `Anotações`, `Pausar` or `Retomar`, `Pular`,
 * `Concluir` and `Expandir` (WIDGET-08), and `Estender` and `Concluir` at `00:00:00` (WIDGET-13).
 * With nothing left in Today, `Tudo limpo` and `Expandir` (WIDGET-16). The whole window drags, and only
 * the row of buttons stays out of the drag area (WIDGET-06).
 *
 * Over a drag region the page gets no mouse events, so on the desktop the cursor comes from the main
 * process, which reads it against the window bounds (#34); the controls hide `HIDE_DELAY_MS` after it
 * leaves. Without that report (a bridge from before it), the page's own mouse events stand in.
 */
export function WidgetControls({
  display,
  task,
  pending,
  canWrite,
  actions,
  onNotes,
  onSubtasks,
  subtasksOpen = false,
  onSubtasksPointerDown,
  onNotesPointerDown,
  onExpand,
  onPanelChange,
}: WidgetControlsProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [picking, setPicking] = useState(false)
  const shown = hovered || focused || picking
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A click focuses the button it hits; only focus from the keyboard keeps the controls on screen.
  const pointer = useRef(false)

  // Whether the desktop reports the cursor; then the page's own mouse events are ignored.
  const reported = useRef(false)

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = null
  }
  const enter = () => {
    cancelHide()
    setHovered(true)
  }
  const leave = () => {
    cancelHide()
    hideTimer.current = setTimeout(() => setHovered(false), HIDE_DELAY_MS)
  }
  useEffect(() => {
    const clear = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    const off = onWidgetHover((hovering) => {
      clear()
      if (hovering) setHovered(true)
      else hideTimer.current = setTimeout(() => setHovered(false), HIDE_DELAY_MS)
    })
    reported.current = off !== null
    return () => {
      off?.()
      clear()
    }
  }, [])

  const expand = (
    <IconButton label={t('focus.widget.expand')} onClick={onExpand}>
      <Maximize2 />
    </IconButton>
  )
  const breakPicker = (
    <BreakPicker
      iconOnly
      onPick={(minutes) => actions.takeBreak(minutes)}
      onOpenChange={(open) => {
        setPicking(open)
        onPanelChange(open)
      }}
    />
  )
  const notes = (
    <>
      {onSubtasks && (
        <IconButton label={t('focus.widget.subtasks')} pressed={subtasksOpen} onClick={onSubtasks} onPointerDown={onSubtasksPointerDown}>
          <ListChecks />
        </IconButton>
      )}
      <IconButton label={t('focus.widget.notes')} onClick={onNotes} onPointerDown={onNotesPointerDown}>
        <NotebookPen />
      </IconButton>
    </>
  )
  const counter = task?.subtasks && task.subtasks.total > 0 ? task.subtasks : null

  const clear = display.mode === 'all_clear' || display.mode === 'idle' || (task === null && display.mode !== 'break')
  const running = display.mode === 'countdown' || display.mode === 'countup'

  let controls: ReactNode = null
  if (!canWrite) {
    controls = expand
  } else if (display.mode === 'break') {
    controls = (
      <>
        <IconButton label={t('focus.controls.endBreak')} onClick={() => actions.endBreak()}>
          <Square />
        </IconButton>
        {expand}
      </>
    )
  } else if (task && display.mode === 'awaiting_extend') {
    controls = (
      <>
        <IconButton label={t('focus.extend.extend')} onClick={() => actions.extend(task.id)}>
          <TimerReset />
        </IconButton>
        <IconButton label={t('focus.controls.complete')} onClick={() => actions.complete(task.id)}>
          <Check />
        </IconButton>
        {breakPicker}
        {notes}
        <IconButton label={t('focus.controls.skip')} disabled={pending <= 1} onClick={() => actions.skip(task.id)}>
          <SkipForward />
        </IconButton>
        {expand}
      </>
    )
  } else if (task) {
    controls = (
      <>
        {breakPicker}
        {notes}
        {running ? (
          <IconButton label={t('focus.controls.pause')} onClick={() => actions.pause()}>
            <Pause />
          </IconButton>
        ) : (
          <IconButton label={t(task.spent_seconds === 0 ? 'focus.controls.start' : 'focus.controls.resume')} onClick={() => actions.start(task.id)}>
            <Play />
          </IconButton>
        )}
        <IconButton label={t('focus.controls.skip')} disabled={pending <= 1} onClick={() => actions.skip(task.id)}>
          <SkipForward />
        </IconButton>
        <IconButton label={t('focus.controls.complete')} onClick={() => actions.complete(task.id)}>
          <Check />
        </IconButton>
        {expand}
      </>
    )
  }

  return (
    <div
      role="group"
      aria-label={t('focus.widget.label')}
      tabIndex={0}
      onMouseOver={() => {
        if (!reported.current) enter()
      }}
      onMouseLeave={() => {
        if (!reported.current) leave()
      }}
      onPointerDown={() => (pointer.current = true)}
      onKeyDown={() => (pointer.current = false)}
      onFocus={() => {
        if (!pointer.current) setFocused(true)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
      className={cn('flex h-16 w-full shrink-0 flex-col justify-center gap-0.5 px-3 outline-none select-none', DRAG_REGION)}
    >
      {clear ? (
        <div className="flex items-center gap-2">
          <CircleCheck size={18} className="shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{t('board.allClear')}</span>
          <span className={NO_DRAG_REGION}>{expand}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {display.mode === 'break' ? t('focus.break.open') : task?.title}
            </span>
            {display.mode !== 'break' && counter && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-px text-xs font-medium text-primary tabular-nums">
                {counter.done}/{counter.total}
              </span>
            )}
            <span role="timer" className="shrink-0 font-mono text-lg font-bold tabular-nums">
              {formatClock(display.mode === 'awaiting_extend' ? 0 : display.seconds)}
            </span>
          </div>
          {shown && (
            <div data-widget-controls className={cn('-mx-1.5 flex items-center justify-between', NO_DRAG_REGION)}>
              {controls}
            </div>
          )}
        </>
      )}
    </div>
  )
}
