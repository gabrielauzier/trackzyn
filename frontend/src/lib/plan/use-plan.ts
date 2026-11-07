import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { useWorkspace } from '@/contexts/workspace-context'
import { plans as plansApi } from '@/lib/api'
import type { PlanRead, Workday } from '@/types'
import { toInput, type DraftBlock } from './draft'

/** The plan is the user's, in one workspace, for one day (PLAN-12). */
export const planKey = (workspaceId: string | null, day: string) => ['plan', workspaceId, day] as const
/** Under `['plan']`: saving a plan gives tasks a day, so the candidates read again with it. */
export const candidatesKey = (workspaceId: string | null, day: string) => ['plan', workspaceId, day, 'candidates'] as const

/** Where the last `Confirmar plano` stands: a refused base version is a `conflict` (PLAN-35), anything else `failed` (PLAN-37). */
export type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'failed'

/** What `Confirmar plano` sends: the draft and the version it was built on. */
export interface SaveInput {
  baseVersion: number
  blocks: DraftBlock[]
}

const isConflict = (error: unknown) => isAxiosError(error) && error.response?.status === 409

/**
 * The plan of `day`, its candidate tasks, saving the whole day and the workday (PLAN-08, PLAN-22). Saving updates the
 * plan in place and reads again the plans, the scheduled tasks of the Agenda and the board, which share `['lists']`.
 * A refused save leaves the draft to the page, untouched (PLAN-35, PLAN-37).
 */
export function usePlan(day: string) {
  const client = useQueryClient()
  const workspaceId = useWorkspace().current?.id ?? null

  const plan = useQuery({ queryKey: planKey(workspaceId, day), queryFn: () => plansApi.get(day), retry: false })
  const candidates = useQuery({ queryKey: candidatesKey(workspaceId, day), queryFn: () => plansApi.candidates(day), retry: false })

  const save = useMutation({
    mutationFn: ({ baseVersion, blocks }: SaveInput) => plansApi.save(day, { base_version: baseVersion, blocks: toInput(blocks) }),
    onSuccess: (saved) => {
      client.setQueryData(planKey(workspaceId, day), saved)
      for (const key of ['plan', 'plans', 'lists']) void client.invalidateQueries({ queryKey: [key] })
    },
  })

  const workday = useMutation({
    mutationFn: (next: Workday) => plansApi.setWorkday(next),
    onSuccess: (saved) => {
      client.setQueryData<PlanRead>(planKey(workspaceId, day), (data) => data && { ...data, workday: saved })
      void client.invalidateQueries({ queryKey: ['plan'] })
    },
  })

  let saveState: SaveState = 'idle'
  if (save.isPending) saveState = 'saving'
  else if (save.isSuccess) saveState = 'saved'
  else if (save.isError) saveState = isConflict(save.error) ? 'conflict' : 'failed'

  return {
    plan,
    candidates: candidates.data?.tasks ?? [],
    candidatesQuery: candidates,
    /** Sends the whole draft as the plan of the day (PLAN-08). */
    save: save.mutate,
    saveState,
    /** Back to `idle`, once the page showed the outcome. */
    clearSave: save.reset,
    /** Keeps the workday in the user's preferences; the plan then carries it (PLAN-22). */
    saveWorkday: workday.mutate,
    workday,
  }
}
