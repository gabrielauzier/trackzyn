import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleCheck, Maximize2, NotebookPen, Pause, Play, SkipForward, Square, TimerReset } from 'lucide-react'

import { BreakPicker } from '@/components/focus/break-picker'
import type { FocusControlActions } from '@/components/focus/focus-controls'
import { Button } from '@/components/ui/button'
import type { Display } from '@/lib/focus/display'
import { formatClock } from '@/lib/focus/format-clock'
import { cn } from '@/lib/utils'

const DRAG_REGION = '[-webkit-app-region:drag]'
const NO_DRAG_REGION = '[-webkit-app-region:no-drag]'
/** How long the controls stay after the mouse leaves, so moving between them does not flicker. */
export const HIDE_DELAY_MS = 150

interface WidgetControlsProps {
  display: Display
  /** The task in focus; `null` with nothing left in Today. */
  task: { id: string; title: string } | null
  /** Pending tasks of Today; with one, there is nothing to skip to (FOCUS-07). */
  pending: number
  /** Whether the user may change the workspace; without it, only `Expandir`. */
  canWrite: boolean
  actions: FocusControlActions & { extend: (taskId: string) => unknown }
  onNotes: () => void
  onExpand: () => void
  /** Told when the break picker opens and closes, so the widget can grow for it. */
  onPanelChange: (open: boolean) => void
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

/**
 * The focus widget: the title of the task, cut with an ellipsis, and the timer (WIDGET-07); with the
 * mouse over it (or the keyboard inside it), `Intervalo`, `Anotações`, `Pausar` or `Retomar`, `Pular`,
 * `Concluir` and `Expandir` (WIDGET-08), and `Estender` and `Concluir` at `00:00:00` (WIDGET-13).
 * With nothing left in Today, `Tudo limpo` and `Expandir` (WIDGET-16). The background drags the
 * window and the buttons stay out of the drag area (WIDGET-06).
 */
export function WidgetControls({ display, task, pending, canWrite, actions, onNotes, onExpand, onPanelChange }: WidgetControlsProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [picking, setPicking] = useState(false)
  const shown = hovered || focused || picking
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A click focuses the button it hits; only focus from the keyboard keeps the controls on screen.
  const pointer = useRef(false)

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = null
  }
  useEffect(() => cancelHide, [])

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
    <IconButton label={t('focus.widget.notes')} onClick={onNotes}>
      <NotebookPen />
    </IconButton>
  )

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
          <IconButton label={t('focus.controls.resume')} onClick={() => actions.start(task.id)}>
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
        cancelHide()
        setHovered(true)
      }}
      onMouseLeave={() => {
        cancelHide()
        hideTimer.current = setTimeout(() => setHovered(false), HIDE_DELAY_MS)
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
            <span role="timer" className="shrink-0 font-mono text-lg font-bold tabular-nums">
              {formatClock(display.mode === 'awaiting_extend' ? 0 : display.seconds)}
            </span>
          </div>
          {shown && <div className={cn('-mx-1.5 flex items-center justify-between', NO_DRAG_REGION)}>{controls}</div>}
        </>
      )}
    </div>
  )
}
