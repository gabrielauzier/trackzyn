import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { BoardGroup } from '@/lib/board/blocks'

interface GroupContainerProps {
  group: BoardGroup
  /** The tasks of the group in this column (EDGE-05). */
  count: number
  /** The group's cards, in its order. */
  children: ReactNode
  /** What the title row carries, as the handle that drags the whole container (GRP-09). */
  handle?: Record<string, unknown>
  containerRef?: Ref<HTMLDivElement>
  titleRef?: Ref<HTMLDivElement>
  className?: string
}

/** A group of tasks on the board: a grey block with the name and `<n> tarefas` on top, and its cards inside (GRP-04). */
export function GroupContainer({ group, count, children, handle, containerRef, titleRef, className }: GroupContainerProps) {
  const { t } = useTranslation()
  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={t('board.groupLabel', { name: group.name })}
      data-group-id={group.id}
      className={cn('flex flex-col gap-2 rounded-xl bg-muted p-2', className)}
    >
      <div ref={titleRef} className="flex min-w-0 items-center gap-2 px-1.5 pt-0.5" {...handle}>
        <span className="truncate text-sm font-bold">{group.name}</span>
        <span className="text-xs whitespace-nowrap text-muted-foreground">{t('board.taskCount', { count })}</span>
      </div>
      {children}
    </div>
  )
}
