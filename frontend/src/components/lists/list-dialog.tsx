import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { lists as listsApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { TaskList } from '@/types'

const COLORS = [1, 2, 3, 4, 5, 6, 7, 8] as const

interface ListDialogProps {
  open: boolean
  /** The list to rename; omit to create a new one. */
  list?: Pick<TaskList, 'id' | 'name' | 'color'> | null
  onClose: () => void
}

export function ListDialog({ open, list, onClose }: ListDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{list ? t('lists.renameTitle') : t('lists.createTitle')}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from the list's current values. */}
        <ListForm list={list ?? null} onDone={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function ListForm({ list, onDone }: { list: ListDialogProps['list'] | null; onDone: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const schema = z.object({
    name: z.string().trim().min(1, t('lists.nameRequired')).max(100, t('lists.nameTooLong')),
    color: z.number().int().min(1).max(8),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: list?.name ?? '', color: list?.color ?? 1 },
  })

  const save = useMutation({
    mutationFn: (values: Values) => (list ? listsApi.update(list.id, values) : listsApi.create(values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
      onDone()
    },
    onError: (e) => form.setError('root.server', { message: extractApiError(e, t('common.error')) }),
  })

  const serverError = form.formState.errors.root?.server?.message

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common.name')}</FormLabel>
              <FormControl>
                <Input autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel id="list-color-label">{t('common.color')}</FormLabel>
              <div role="radiogroup" aria-labelledby="list-color-label" className="flex flex-wrap gap-2">
                {COLORS.map((color) => {
                  const selected = field.value === color
                  return (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={t('lists.colorOption', { number: color })}
                      onClick={() => field.onChange(color)}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background transition-shadow',
                        selected && 'ring-2 ring-ring',
                      )}
                      style={{ backgroundColor: `var(--chart-${color})` }}
                    >
                      {selected && <Check size={14} />}
                    </button>
                  )
                })}
              </div>
            </FormItem>
          )}
        />
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {list ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
