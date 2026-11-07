import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Copy, MoreVertical, Replace, Trash2 } from 'lucide-react'
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
  /** One column to the left; absent in the first column, where the item is off. */
  onMoveLeft?: () => void
  /** One column to the right; absent in Done, the last column, where the item is off. */
  onMoveRight?: () => void
}

/** The "more actions" of a task card: move one column, change list, duplicate and delete. */
export function TaskCardMenu({ lists, onDuplicate, onChangeList, onDelete, onMoveLeft, onMoveRight }: TaskCardMenuProps) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-6" aria-label={t('board.moreActions')}>
          <MoreVertical size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* The arrows that sat on the card (2026-11-06). */}
        <DropdownMenuItem disabled={!onMoveLeft} onSelect={onMoveLeft}>
          <ArrowLeft size={14} /> {t('board.moveLeft')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!onMoveRight} onSelect={onMoveRight}>
          <ArrowRight size={14} /> {t('board.moveRight')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
