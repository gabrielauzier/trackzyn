import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { ReportFilter } from '@/components/reports/use-report-filter'
import { ListBadge } from '@/components/lists/list-badge'
import { Badge } from '@/components/ui/badge'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { lists } from '@/lib/api'

const ALL = 'all'

interface ReportFiltersProps {
  filter: ReportFilter
  onChange: (next: ReportFilter) => void
  /** Why the last change did not stay (REPORT-13, deleted list). */
  notice: string | null
}

/** The list filter, active lists then archived ones labeled (REPORT-07, REPORT-08), and the period. */
export function ReportFilters({ filter, onChange, notice }: ReportFiltersProps) {
  const { t } = useTranslation()
  const active = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => lists.list({ archived: false }) })
  const archived = useQuery({ queryKey: ['lists', { archived: true }], queryFn: () => lists.list({ archived: true }) })
  const options = [...(active.data?.lists ?? []), ...(archived.data?.lists ?? [])]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={filter.listId ?? ALL}
          onValueChange={(value) => onChange({ ...filter, listId: value === ALL ? null : value })}
        >
          <SelectTrigger aria-label={t('reports.filters.list')} className="min-w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('reports.filters.allLists')}</SelectItem>
            {options.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                <ListBadge name={list.name} color={list.color} size="sm" />
                {list.name}
                {list.is_archived && ' '}
                {list.is_archived && <Badge variant="outline">{t('reports.filters.archived')}</Badge>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker
          from={filter.from}
          to={filter.to}
          label={t('reports.filters.period')}
          onChange={(from, to) => onChange({ ...filter, from, to })}
        />
      </div>
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
    </div>
  )
}
