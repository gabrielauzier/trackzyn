import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, FileText, FolderOpen, Image as ImageIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { files as filesApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { formatFileSize } from '@/lib/file-size'
import { useDisplayLocale, useDateLocale } from '@/hooks/use-display-locale'
import { useWorkspace } from '@/contexts/workspace-context'
import { PageHeader } from '@/components/page-header'
import { FileDropzone } from '@/components/file-dropzone'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { StoredFile } from '@/types'

export default function FilesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { canWrite } = useWorkspace()
  const locale = useDisplayLocale()
  const dateLocale = useDateLocale()
  const [progress, setProgress] = useState<number | null>(null)
  const [renameTarget, setRenameTarget] = useState<StoredFile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StoredFile | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['file-settings'],
    queryFn: filesApi.settings,
    staleTime: Infinity,
  })
  const { data: list, isLoading } = useQuery({ queryKey: ['files'], queryFn: filesApi.list })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['files'] })

  const uploadMutation = useMutation({
    mutationFn: async (picked: File[]) => {
      for (const file of picked) {
        await filesApi.upload(file, setProgress)
      }
    },
    onSuccess: (_, picked) => toast.success(t('files.uploaded', { count: picked.length })),
    onError: (e) => toast.error(extractApiError(e, t('files.uploadError'))),
    onSettled: () => {
      setProgress(null)
      void invalidate()
    },
  })

  const renameMutation = useMutation({
    mutationFn: () => filesApi.rename(renameTarget!.id, renameValue),
    onSuccess: () => {
      setRenameTarget(null)
      void invalidate()
    },
    onError: (e) => toast.error(extractApiError(e, t('common.error'))),
  })

  const deleteMutation = useMutation({
    mutationFn: () => filesApi.remove(deleteTarget!.id),
    onSuccess: () => {
      toast.success(t('files.deleted'))
      setDeleteTarget(null)
      void invalidate()
    },
    onError: (e) => toast.error(extractApiError(e, t('common.error'))),
  })

  const files = list ?? []

  return (
    <div>
      <PageHeader section={t('nav.groupWorkspace')} title={t('nav.files')} />

      {canWrite && (
        <div className="mb-6">
          <FileDropzone
            accept={settings?.allowed_extensions}
            maxSizeMb={settings?.max_file_size_mb}
            disabled={uploadMutation.isPending}
            onFiles={(picked) => uploadMutation.mutate(picked)}
            onReject={(message) => toast.error(message)}
          />
          {progress !== null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t('files.uploading')} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FolderOpen size={20} />
            </span>
            <p className="text-sm font-medium">{t('files.emptyTitle')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('files.emptyHint')}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('files.name')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('files.size')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('files.uploadedAt')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const Icon = file.content_type.startsWith('image/') ? ImageIcon : FileText
                return (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Icon size={16} className="shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{file.filename}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">
                      {formatFileSize(file.size, locale)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {new Date(file.created_at).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                            <MoreHorizontal size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void filesApi.download(file)}>
                            <Download size={14} /> {t('files.download')}
                          </DropdownMenuItem>
                          {canWrite && (
                            <>
                              <DropdownMenuItem
                                onClick={() => {
                                  setRenameTarget(file)
                                  setRenameValue(file.filename)
                                }}
                              >
                                <Pencil size={14} /> {t('files.rename')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(file)}>
                                <Trash2 size={14} /> {t('common.delete')}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('files.rename')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              renameMutation.mutate()
            }}
          >
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus maxLength={255} />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!renameValue.trim() || renameMutation.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={!!deleteTarget}
        title={t('files.deleteTitle')}
        description={t('files.deleteDescription', { name: deleteTarget?.filename ?? '' })}
        isPending={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
