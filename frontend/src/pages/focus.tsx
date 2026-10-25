import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, CircleCheck, House, Maximize2, Minimize2 } from 'lucide-react'

import { AddTaskForm } from '@/components/board/add-task-form'
import { formatDuration } from '@/components/board/format-duration'
import { ElsewhereDialog } from '@/components/focus/elsewhere-dialog'
import { ExtendPrompt } from '@/components/focus/extend-prompt'
import { FocusControls } from '@/components/focus/focus-controls'
import { FocusTaskCard } from '@/components/focus/focus-task-card'
import { OfflineConflicts } from '@/components/focus/offline-conflicts'
import { SoundSettings } from '@/components/focus/sound-settings'
import { ListBadge } from '@/components/lists/list-badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/contexts/workspace-context'
import { lists as listsApi } from '@/lib/api'
import { deviceId } from '@/lib/focus/device-id'
import { useFocus } from '@/lib/focus/use-focus'
import { useFocusSounds } from '@/lib/sounds/use-focus-sounds'
import type { FocusState } from '@/types'

/**
 * Whether opening the focus screen starts the first task of Today (FOCUS-02): unless a session of this
 * device already runs on this list (coming back from the board, FOCUS-16) or the estimate of that task
 * is already used up (it waits for `Estender`, Edge Case). A session on another device is asked to be
 * taken over (SYNC-02). Nothing starts while a stale session waits for `Manter` or `Cortar no último
 * sinal` (SYNC-11).
 */
function shouldStart(state: FocusState, listId: string): boolean {
  // A session left open by a crash waits for the user's answer, not for a new start (SYNC-11).
  if (state.stale !== null) return false
  const first = state.today.tasks[0]
  if (!first || first.awaiting_extend) return false
  const session = state.session
  if (session === null) return true
  if (session.device_id !== deviceId()) return true
  return session.kind === 'task' && session.list_id !== listId
}

/**
 * Whether the task the screen showed left Today without being completed: deleted, moved out of Today
 * or its list archived (FOCUS-15).
 */
function taskLeft(before: FocusState, after: FocusState): boolean {
  const id = before.task?.id
  if (!id || after.task?.id === id) return false
  if (after.today.tasks.some((task) => task.id === id)) return false
  return after.today.done <= before.today.done
}

/** `/focus/:listId`: focus on the pending tasks of Today of the list (`03-foco.png`). */
export default function FocusPage() {
  const { listId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { canWrite } = useWorkspace()
  const { state, display, actions, conflicts, expired } = useFocus(listId)
  const [collapsed, setCollapsed] = useState(false)
  const { playComplete } = useFocusSounds(state, display)
  // A completion made here plays its sound here, once (SOUND-01).
  const complete = (taskId: string) => {
    playComplete()
    void actions.complete(taskId)
  }

  const { data: allLists } = useQuery({
    queryKey: ['lists', { archived: false }],
    queryFn: () => listsApi.list({ archived: false }),
  })

  // Start once per list, on the first state the server answers.
  const started = useRef<string | null>(null)
  useEffect(() => {
    if (!state || !canWrite || started.current === listId) return
    started.current = listId
    if (shouldStart(state, listId)) void actions.start(state.today.tasks[0]!.id)
  }, [state, canWrite, listId, actions])

  // Compared while rendering, against the state the screen showed last.
  const [seen, setSeen] = useState<{ state: FocusState | null; left: boolean }>({ state: null, left: false })
  if (state !== seen.state) {
    setSeen({ state, left: seen.left || (state !== null && seen.state !== null && taskLeft(seen.state, state)) })
  }
  const left = seen.left

  const board = `/lists/${listId}`
  if (left) return <Navigate to={board} replace />

  const list = allLists?.lists.find((item) => item.id === listId)
  const otherLists = (allLists?.lists ?? []).filter((item) => item.id !== listId)
  const elsewhere = conflicts.find((conflict) => conflict.code === 'focus_elsewhere')
  const refused = conflicts.filter((conflict) => conflict.code !== 'focus_elsewhere')
  const elsewhereTask = elsewhere?.action.type === 'start' ? elsewhere.action.task_id : null

  const today = state?.today
  const total = today ? today.done + today.pending : 0
  const percent = total > 0 && today ? Math.round((today.done / total) * 100) : 0
  const task = state?.task ?? null
  const others = today?.tasks.filter((item) => item.id !== task?.id) ?? []
  const clear = display?.mode === 'all_clear' || display?.mode === 'idle'

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1 px-2" aria-label={t('focus.page.pickList')}>
              {list && <ListBadge name={list.name} color={list.color} size="sm" />}
              <ChevronDown size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {otherLists.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => navigate(`/focus/${item.id}`)}>
                <ListBadge name={item.name} color={item.color} size="sm" />
                {item.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="flex-1 text-2xl font-bold">{t('board.columns.today')}</h1>
        <SoundSettings />
        <Button variant="ghost" size="icon-sm" aria-label={t('focus.page.home')} onClick={() => navigate(board)}>
          <House />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('focus.page.collapse')}
          aria-pressed={collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <Maximize2 /> : <Minimize2 />}
        </Button>
      </header>

      {!state || !display || !today ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          {!collapsed && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('focus.page.estimate', { estimate: formatDuration(today.estimate_minutes * 60, i18n.language) })}
              </p>
              <div className="flex items-center gap-3">
                <Progress value={percent} aria-label={t('board.progress', { done: today.done, total })} className="h-1.5 flex-1" />
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {t('board.progress', { done: today.done, total })}
                </span>
              </div>
            </div>
          )}

          {clear ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm font-medium text-muted-foreground">
              <CircleCheck size={24} className="text-primary" aria-hidden />
              {t('board.allClear')}
            </div>
          ) : display.mode === 'break' ? (
            <FocusTaskCard title={t('focus.break.open')} display={display} />
          ) : display.mode === 'awaiting_extend' && task ? (
            <div className="space-y-3 rounded-xl border-2 border-primary bg-card px-4 py-3">
              <p className="truncate text-base font-medium">{task.title}</p>
              {canWrite && <ExtendPrompt onExtend={() => actions.extend(task.id)} onComplete={() => complete(task.id)} />}
            </div>
          ) : (
            task && <FocusTaskCard title={task.title} display={display} />
          )}

          {canWrite && !clear && (
            <FocusControls display={display} taskId={task?.id ?? null} pending={today.pending} actions={{ ...actions, complete }} />
          )}

          {!collapsed && (
            <>
              {others.length > 0 && (
                <ul className="space-y-2" aria-label={t('focus.page.next')}>
                  {others.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{item.title}</span>
                      {item.estimate_minutes !== null && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDuration(item.estimate_minutes * 60, i18n.language)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && <AddTaskForm listId={listId} column="today" />}
            </>
          )}

          <OfflineConflicts conflicts={refused} expired={expired} onRetry={actions.retry} onDiscard={actions.discard} />
        </>
      )}

      <ElsewhereDialog
        taskId={elsewhereTask}
        onTakeOver={(taskId) => {
          if (elsewhere) actions.discard(elsewhere.action_id)
          void actions.start(taskId, true)
        }}
        onClose={() => elsewhere && actions.discard(elsewhere.action_id)}
      />
    </div>
  )
}
