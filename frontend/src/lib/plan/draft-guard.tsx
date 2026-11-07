import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { longDay } from '@/lib/schedule'
import { DraftGuardContext } from './draft-guard-context'

/** Marks the extra history entry of the plan that the browser's Back pops instead of leaving the plan. */
const SENTINEL = 'planDraftGuard'

const onSentinel = () => (window.history.state as Record<string, unknown> | null)?.[SENTINEL] === true

/** A second entry of the same URL and router state, so Back lands on the plan itself and react-router stays put. */
const pushSentinel = () => window.history.pushState({ ...(window.history.state ?? {}), [SENTINEL]: true }, '', window.location.href)

/**
 * Guards the way out of an unsaved plan (PLAN-36). The app runs on `BrowserRouter`, which has no `useBlocker`, so the
 * links of the sidebar, the workspace menu, the command palette and the day arrows ask through `confirmLeave`, closing or reloading the tab
 * through `beforeunload`, and the browser's Back through an extra history entry of the plan that Back pops.
 * `Continuar planejando` stays; `Descartar` leaves and drops the draft.
 */
export function DraftGuardProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const [draftDay, setDraftDay] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const pending = useRef<(() => void) | null>(null)
  /** `Descartar` is popping the extra entry before it leaves: that pop is not a Back to ask about. */
  const leaving = useRef(false)
  const armed = draftDay !== null

  useEffect(() => {
    if (draftDay === null) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers ask only when returnValue is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [draftDay])

  useEffect(() => {
    if (!armed) return
    pushSentinel()
    const onPop = () => {
      if (leaving.current || onSentinel()) return
      // Back popped the extra entry: put it back and ask; `Descartar` then goes back for real.
      pushSentinel()
      pending.current = () => window.history.back()
      setAsking(true)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Saved or discarded on the page: the extra entry goes, so Back leaves at once.
      if (!leaving.current && onSentinel()) window.history.back()
    }
  }, [armed])

  const confirmLeave = useCallback(
    (leave: () => void) => {
      if (draftDay === null) return leave()
      pending.current = leave
      setAsking(true)
    },
    [draftDay],
  )

  const stay = () => {
    pending.current = null
    setAsking(false)
  }
  const discard = () => {
    const leave = pending.current
    pending.current = null
    setAsking(false)
    setDraftDay(null)
    if (!leave) return
    if (!onSentinel()) return leave()
    // Leave from the plan's own entry, so no extra entry of the plan stays behind in the history.
    leaving.current = true
    const afterPop = () => {
      leaving.current = false
      leave()
    }
    window.addEventListener('popstate', afterPop, { once: true })
    window.history.back()
  }

  const value = useMemo(() => ({ setDraftDay, confirmLeave }), [confirmLeave])
  const language = i18n.resolvedLanguage ?? i18n.language

  return (
    <DraftGuardContext.Provider value={value}>
      {children}
      <DeleteConfirmationDialog
        open={asking}
        title={t('plan.leave.title')}
        description={t('plan.leave.description', { day: draftDay ? longDay(draftDay, t, language) : '' })}
        isPending={false}
        cancelLabel={t('plan.leave.stay')}
        confirmLabel={t('plan.leave.discard')}
        onClose={stay}
        onConfirm={discard}
      />
    </DraftGuardContext.Provider>
  )
}
