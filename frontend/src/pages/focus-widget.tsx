import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'

import { OfflineConflicts } from '@/components/focus/offline-conflicts'
import { WidgetControls } from '@/components/focus/widget-controls'
import { WidgetNotes } from '@/components/focus/widget-notes'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/contexts/workspace-context'
import {
  expandFocus,
  notifyFocusChanged,
  onFocusChanged,
  rememberedFocusList,
  resizeWidget,
} from '@/lib/desktop/focus-window'
import { taskLeft } from '@/lib/focus/task-left'
import { useFocus } from '@/lib/focus/use-focus'
import { useFocusSounds } from '@/lib/sounds/use-focus-sounds'
import type { FocusState } from '@/types'

/**
 * `/widget`: the focus in the desktop widget, on the same `useFocus` and sounds as the focus screen.
 * Every action tells the main window, and a change made there refreshes the widget (WIDGET-22). A task
 * that left Today closes the widget onto the board (WIDGET-17). The refused offline actions and the
 * dropped ones show in the widget, which grows for them.
 *
 * The widget mounts no `FocusGuard`: it exists only while the main window is open (minimized), whose
 * app-level guard keeps reporting the focus for the close dialog (SYNC-08) and asks about a stale
 * session on start (SYNC-11). Two windows reporting would overwrite each other.
 */
export default function FocusWidgetPage() {
  const { t } = useTranslation()
  const { canWrite } = useWorkspace()
  const queryClient = useQueryClient()
  // A paused task has no session to name its list: the widget starts on the last focus screen's list
  // and follows the list of the open session.
  const [listId, setListId] = useState(rememberedFocusList)
  const { state, display, actions, conflicts, expired } = useFocus(listId)
  const { playComplete } = useFocusSounds(state, display)
  const sessionList = state?.session?.list_id
  if (sessionList && sessionList !== listId) setListId(sessionList)

  const [notesOpen, setNotesOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [acknowledged, setAcknowledged] = useState(0)

  useEffect(
    () =>
      onFocusChanged(() => {
        void queryClient.invalidateQueries({ queryKey: ['focus'] })
      }),
    [queryClient],
  )

  // Compared while rendering, against the state the widget showed last.
  const [seen, setSeen] = useState<{ state: FocusState | null; left: boolean }>({ state: null, left: false })
  if (state !== seen.state) {
    setSeen({ state, left: seen.left || (state !== null && seen.state !== null && taskLeft(seen.state, state)) })
  }
  const left = seen.left
  useEffect(() => {
    if (left) void expandFocus('task_left')
  }, [left])

  const unseenExpired = expired - acknowledged
  const warnings = conflicts.length > 0 || unseenExpired > 0
  const panel = picking || warnings
  // The size the widget was last asked for; the notes field sizes it by itself.
  const sized = useRef(false)
  useEffect(() => {
    if (notesOpen || panel === sized.current) return
    sized.current = panel
    void resizeWidget(panel ? 'notes' : 'compact')
  }, [panel, notesOpen])

  // The other window reads the server again once the action was answered.
  const tell = (action: unknown) => {
    void Promise.resolve(action).finally(() => notifyFocusChanged())
  }
  const widgetActions = {
    start: (taskId: string) => tell(actions.start(taskId)),
    pause: () => tell(actions.pause()),
    skip: (taskId: string) => tell(actions.skip(taskId)),
    complete: (taskId: string) => {
      // A completion made here plays its sound here, once (SOUND-01).
      playComplete()
      tell(actions.complete(taskId))
    },
    extend: (taskId: string) => tell(actions.extend(taskId)),
    takeBreak: (minutes: number) => tell(actions.takeBreak(minutes)),
    endBreak: () => tell(actions.endBreak()),
  }

  if (!state || !display || left) return <div className="h-dvh bg-card" />
  const task = state.task

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-card text-card-foreground">
      <WidgetControls
        display={display}
        task={task}
        pending={state.today.pending}
        canWrite={canWrite}
        actions={widgetActions}
        onNotes={() => {
          sized.current = true
          setNotesOpen(true)
        }}
        onExpand={() => void expandFocus()}
        onPanelChange={setPicking}
      />
      {notesOpen && task ? (
        <WidgetNotes
          taskId={task.id}
          onClose={() => {
            sized.current = false
            setNotesOpen(false)
            notifyFocusChanged()
          }}
        />
      ) : (
        warnings && (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3 [-webkit-app-region:no-drag]">
            {unseenExpired > 0 && (
              <div role="status" className="flex items-start justify-between gap-2 text-sm">
                <span>{t('focus.conflicts.expired', { count: unseenExpired })}</span>
                <Button variant="ghost" size="sm" onClick={() => setAcknowledged(expired)}>
                  {t('common.close')}
                </Button>
              </div>
            )}
            <OfflineConflicts
              conflicts={conflicts}
              expired={0}
              onRetry={(actionId) => tell(actions.retry(actionId))}
              onDiscard={actions.discard}
            />
          </div>
        )
      )}
    </div>
  )
}
