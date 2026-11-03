import { useTranslation } from 'react-i18next'

import { formatDateRange } from '@/lib/date-range-format'

interface PrintHeaderProps {
  from: string
  to: string
  /** The list of the filter, or `Todas as listas`. */
  listName: string
}

/** The top of the printed overview: the period and the list (REPORT-23). Hidden on screen. */
export function PrintHeader({ from, to, listName }: PrintHeaderProps) {
  const { t, i18n } = useTranslation()
  return (
    <div className="print-only mb-4 border-b border-border pb-3">
      <p className="text-lg font-semibold">{t('reports.print.title')}</p>
      <p className="text-sm">{t('reports.print.period', { period: formatDateRange(from, to, i18n.language) })}</p>
      <p className="text-sm">{t('reports.print.list', { name: listName })}</p>
    </div>
  )
}
