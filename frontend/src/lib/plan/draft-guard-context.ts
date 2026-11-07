import { createContext, useContext } from 'react'

export interface DraftGuardValue {
  /** The day whose plan holds an unsaved draft, or null when nothing is left unsaved. */
  setDraftDay: (day: string | null) => void
  /** Leaves at once without a draft; with one, asks `Descartar o rascunho?` first (PLAN-36). */
  confirmLeave: (leave: () => void) => void
}

/** Outside the provider nothing guards: leaving goes at once. */
export const DraftGuardContext = createContext<DraftGuardValue>({
  setDraftDay: () => undefined,
  confirmLeave: (leave) => leave(),
})

/** The guard of an unsaved day plan (PLAN-36); see `DraftGuardProvider`. */
export const useDraftGuard = () => useContext(DraftGuardContext)
