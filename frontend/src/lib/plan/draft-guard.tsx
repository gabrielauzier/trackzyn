import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { longDay } from '@/lib/schedule'

interface DraftGuardValue {
  /** The day whose plan holds an unsaved draft, or null when nothing is left unsaved. */
  setDraftDay: (day: string | null) => void
  /** Leaves at once without a draft; with one, asks `Descartar o rascunho?` first (PLAN-36). */
  confirmLeave: (leave: () => void) => void
}

/** Outside the provider nothing guards: leaving goes at once. */
const DraftGuardContext = createContext<DraftGuardValue>({
  setDraftDay: () => undefined,
  confirmLeave: (leave) => leave(),
})

/**
 * Guards the way out of an unsaved plan (PLAN-36). The app runs on `BrowserRouter`, which has no `useBlocker`, so the
 * links of the sidebar and the day arrows ask through `confirmLeave`, and closing or reloading the tab through
 * `beforeunload`. `Continuar planejando` stays; `Descartar` leaves and drops the draft.
 */
export function DraftGuardProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  const [draftDay, setDraftDay] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const pending = useRef<(() => void) | null>(null)

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
    leave?.()
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

export const useDraftGuard = () => useContext(DraftGuardContext)
