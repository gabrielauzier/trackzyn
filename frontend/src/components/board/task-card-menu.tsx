import { useTranslation } from 'react-i18next'
import { Copy, MoreVertical, Replace, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TaskCardMenuProps {
  /** The lists the task can go to: every list but its own. */
  lists: { id: string; name: string }[]
  onDuplicate: () => void
  onChangeList: (listId: string) => void
  onDelete: () => void
}

/** The "more actions" of a task card: duplicate, change list and delete. */
export function TaskCardMenu({ lists, onDuplicate, onChangeList, onDelete }: TaskCardMenuProps) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-6" aria-label={t('board.moreActions')}>
          <MoreVertical size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Replace size={14} /> {t('board.changeList')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {lists.length === 0 ? (
              <DropdownMenuItem disabled>{t('board.noOtherLists')}</DropdownMenuItem>
            ) : (
              lists.map((list) => (
                <DropdownMenuItem key={list.id} onSelect={() => onChangeList(list.id)}>
                  {list.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy size={14} /> {t('board.duplicateTask')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 size={14} /> {t('board.deleteTask')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
