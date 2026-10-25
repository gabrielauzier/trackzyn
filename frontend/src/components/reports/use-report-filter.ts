import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { defaultRange } from '@/lib/reports'
import type { ReportQuery } from '@/types'

/** The period (YYYY-MM-DD, both ends included) and the list of a report; `listId` null is every list. */
export interface ReportFilter {
  from: string
  to: string
  listId: string | null
}

export function toReportQuery({ from, to, listId }: ReportFilter): ReportQuery {
  return listId === null ? { from, to } : { from, to, list_id: listId }
}

const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status

/**
 * The filter of the reports page. It starts on every list and the current week (REPORT-01). A changed
 * filter stays only once the server accepts it: a 422 brings back the last accepted one (REPORT-13), and a
 * 404 of a deleted list goes back to every list; both leave a notice.
 */
export function useReportFilter(timezone: string | null | undefined) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ReportFilter>(() => ({ ...defaultRange(timezone), listId: null }))
  const [notice, setNotice] = useState<string | null>(null)
  const accepted = useRef(filter)

  const change = useCallback((next: ReportFilter) => {
    setNotice(null)
    setFilter(next)
  }, [])

  /** Runs a report request for `requested` and settles the filter by its answer. */
  const run = useCallback(
    async <T>(fetch: (query: ReportQuery) => Promise<T>, requested: ReportFilter): Promise<T> => {
      try {
        const data = await fetch(toReportQuery(requested))
        accepted.current = requested
        return data
      } catch (error) {
        const status = statusOf(error)
        if (status === 422) {
          setFilter(accepted.current)
          setNotice(t('reports.filters.invalidPeriod'))
        } else if (status === 404 && requested.listId !== null) {
          setFilter({ ...requested, listId: null })
          setNotice(t('reports.filters.listDeleted'))
        }
        throw error
      }
    },
    [t],
  )

  return { filter, notice, change, run }
}
