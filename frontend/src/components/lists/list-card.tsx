import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { lists as listsApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { cn } from '@/lib/utils'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { ListBadge } from '@/components/lists/list-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ListCard as ListCardData } from '@/types'

const PREVIEW_ROWS = 4

interface ListCardProps {
  list: ListCardData
  /** False for a `viewer`: the `⋮` menu is not rendered at all. */
  canWrite: boolean
  /** Opens the list dialog to rename or recolour this list. */
  onRename: (list: ListCardData) => void
  className?: string
}

export function ListCard({ list, canWrite, onRename, className }: ListCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lists'] })
  const onError = (e: unknown) => toast.error(extractApiError(e, t('common.error')))

  const archiveMutation = useMutation({
    mutationFn: (isArchived: boolean) => listsApi.update(list.id, { is_archived: isArchived }),
    onSuccess: () => void refresh(),
    onError,
  })
  const deleteMutation = useMutation({
    mutationFn: () => listsApi.remove(list.id),
    onSuccess: () => {
      setConfirmDelete(false)
      void refresh()
    },
    onError,
  })

  const rows = Array.from({ length: PREVIEW_ROWS }, (_, i) => list.preview[i] ?? null)

  return (
    <Card className={cn('gap-3 p-4', className)}>
      <div className="flex items-center gap-3">
        <ListBadge name={list.name} color={list.color} />
        <Link to={`/lists/${list.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
          {list.name}
        </Link>
        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRename(list)}>
                <Pencil size={14} /> {t('lists.rename')}
              </DropdownMenuItem>
              {list.is_archived ? (
                <DropdownMenuItem onClick={() => archiveMutation.mutate(false)}>
                  <ArchiveRestore size={14} /> {t('lists.unarchive')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => archiveMutation.mutate(true)}>
                  <Archive size={14} /> {t('lists.archive')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-border/60 text-sm">
        {rows.map((row, i) => (
          <li key={row?.id ?? `empty-${i}`} className="h-8 truncate leading-8">
            {row?.title ?? ''}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">{t('lists.pendingCount', { count: list.pending_count })}</p>

      <DeleteConfirmationDialog
        open={confirmDelete}
        title={t('lists.deleteTitle')}
        description={t('lists.deleteDescription', { name: list.name })}
        isPending={deleteMutation.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </Card>
  )
}
