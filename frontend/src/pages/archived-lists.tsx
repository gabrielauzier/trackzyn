import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Archive } from 'lucide-react'
import { lists as listsApi } from '@/lib/api'
import { useWorkspace } from '@/contexts/workspace-context'
import { PageHeader } from '@/components/page-header'
import { ListCard } from '@/components/lists/list-card'
import { ListDialog } from '@/components/lists/list-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { ListCard as ListCardData } from '@/types'

export default function ArchivedListsPage() {
  const { t } = useTranslation()
  const { current, canWrite } = useWorkspace()
  const [renaming, setRenaming] = useState<ListCardData | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['lists', { archived: true }],
    queryFn: () => listsApi.list({ archived: true }),
  })
  const lists = data?.lists ?? []

  return (
    <div>
      <PageHeader section={current?.name ?? ''} title={t('nav.archivedLists')} />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card px-6 py-14 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Archive size={20} />
          </span>
          <p className="text-sm font-medium">{t('lists.archivedEmptyTitle')}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{t('lists.archivedEmptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} canWrite={canWrite} onRename={setRenaming} />
          ))}
        </div>
      )}

      {canWrite && <ListDialog open={!!renaming} list={renaming} onClose={() => setRenaming(null)} />}
    </div>
  )
}
