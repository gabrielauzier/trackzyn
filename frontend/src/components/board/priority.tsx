import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, ChevronsUp, Equal, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Priority } from '@/types'

const PRIORITIES: readonly Priority[] = ['none', 'low', 'medium', 'high', 'ultra']

/** Low arrow down in blue, medium two bars in yellow, high arrow up in orange, ultra double arrow up in red (PRI-02). */
const LOOK: Record<Exclude<Priority, 'none'>, { Icon: LucideIcon; color: string }> = {
  low: { Icon: ChevronDown, color: 'text-blue-500' },
  medium: { Icon: Equal, color: 'text-amber-500' },
  high: { Icon: ChevronUp, color: 'text-orange-500' },
  ultra: { Icon: ChevronsUp, color: 'text-rose-500' },
}

/** The icon of a priority, with no text: the name is in the tooltip and the accessible label. None shows nothing (PRI-03). */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const { t } = useTranslation()
  if (priority === 'none') return null
  const { Icon, color } = LOOK[priority]
  const label = t('priority.label', { name: t(`priority.${priority}`).toLocaleLowerCase() })
  return (
    <Icon size={16} strokeWidth={2.6} role="img" aria-label={label} className={cn('shrink-0', color, className)}>
      <title>{label}</title>
    </Icon>
  )
}

/** The one priority select, with an icon beside each name, of the Processar, the task dialog and the group (PRI-04). */
export function PrioritySelect({
  value,
  onChange,
  id,
  className,
  'aria-label': ariaLabel,
}: {
  value: Priority
  onChange: (priority: Priority) => void
  id?: string
  className?: string
  'aria-label'?: string
}) {
  const { t } = useTranslation()
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Priority)}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((priority) => {
          const look = priority === 'none' ? null : LOOK[priority]
          return (
            <SelectItem key={priority} value={priority}>
              {look && <look.Icon aria-hidden strokeWidth={2.6} className={look.color} />}
              {t(`priority.${priority}`)}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
