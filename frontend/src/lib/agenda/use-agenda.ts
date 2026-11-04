import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'

import { sessions as sessionsApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import type { AgendaSession, AgendaSessionChanges, AgendaSessionInput } from '@/types'

/** The week (or any period) of the agenda and its list filter; `listId` null is every list. */
export interface AgendaPeriod {
  from: string
  to: string
  listId: string | null
}

export const agendaKey = ({ from, to, listId }: AgendaPeriod) => ['agenda', from, to, listId] as const

type AgendaData = { sessions: AgendaSession[] }

/** A session the server has not confirmed yet. */
export const PENDING_PREFIX = 'pending-'

/**
 * The message of a refused session write. The time errors read in the app's own words, whatever the
 * API detail says (AGENDA-23, AGENDA-24); anything else shows the API message.
 */
export function sessionErrorMessage(error: unknown, t: TFunction): string {
  const code = (error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code
  if (code === 'invalid_time') return t('agenda.errors.future')
  if (code === 'invalid_duration') return t('agenda.errors.duration')
  return extractApiError(error, t('common.error'))
}

/** What a new session shows on the grid before the server answers. */
export type SessionPreview = Pick<AgendaSession, 'task_title' | 'list_id' | 'list_name' | 'list_color'>

type Snapshot = [readonly unknown[], AgendaData | undefined][]

/** Changes every cached agenda period at once and keeps what they held, to undo it. */
async function applyToAll(client: QueryClient, change: (sessions: AgendaSession[]) => AgendaSession[]): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: ['agenda'] })
  const snapshot = client.getQueriesData<AgendaData>({ queryKey: ['agenda'] })
  client.setQueriesData<AgendaData>({ queryKey: ['agenda'] }, (data) => data && { sessions: change(data.sessions) })
  return snapshot
}

function restore(client: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) client.setQueryData(key, data)
}

/**
 * The agenda of a period and its writes. Every write shows at once and goes back if the server refuses
 * it (AGENDA-35); once answered, the agenda, the boards, the focus and the reports read again (AGENDA-46).
 */
export function useAgenda(period: AgendaPeriod) {
  const { t } = useTranslation()
  const client = useQueryClient()

  const query = useQuery({
    queryKey: agendaKey(period),
    queryFn: () =>
      sessionsApi.list(
        period.listId === null ? { from: period.from, to: period.to } : { from: period.from, to: period.to, list_id: period.listId },
      ),
    placeholderData: keepPreviousData,
    retry: false,
  })

  const refresh = () => {
    if (client.isMutating() > 1) return
    for (const key of ['agenda', 'lists', 'focus', 'reports']) void client.invalidateQueries({ queryKey: [key] })
  }

  /** The panel shows a refused creation itself, so it gets no toast. */
  const create = useMutation({
    mutationFn: ({ input }: { input: AgendaSessionInput; preview: SessionPreview }) => sessionsApi.create(input),
    onMutate: ({ input, preview }) =>
      applyToAll(client, (sessions) => [
        ...sessions,
        {
          id: `${PENDING_PREFIX}${crypto.randomUUID()}`,
          kind: input.kind,
          origin: 'manual',
          task_id: input.kind === 'task' ? input.task_id : null,
          ...preview,
          started_at: input.started_at,
          ended_at: input.ended_at,
        },
      ]),
    onError: (_error, _variables, snapshot) => restore(client, snapshot),
    onSettled: refresh,
  })

  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: AgendaSessionChanges }) => sessionsApi.update(id, changes),
    onMutate: ({ id, changes }) =>
      applyToAll(client, (sessions) => sessions.map((session) => (session.id === id ? { ...session, ...changes } : session))),
    onError: (error, _variables, snapshot) => {
      restore(client, snapshot)
      toast.error(sessionErrorMessage(error, t))
    },
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: (id: string) => sessionsApi.remove(id),
    onMutate: (id) => applyToAll(client, (sessions) => sessions.filter((session) => session.id !== id)),
    onError: (error, _id, snapshot) => {
      restore(client, snapshot)
      toast.error(sessionErrorMessage(error, t))
    },
    onSettled: refresh,
  })

  return { query, create, update, remove }
}
