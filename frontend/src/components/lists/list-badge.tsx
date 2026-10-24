import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'w-6 h-6 rounded-md text-xs',
  md: 'w-8 h-8 rounded-lg text-sm',
  lg: 'w-10 h-10 rounded-xl text-base',
} as const

interface ListBadgeProps {
  name: string
  /** Index 1..8 into the `--chart-N` palette. */
  color: number
  size?: keyof typeof SIZES
  className?: string
}

/** The list's initial, upper-cased, on its palette colour. */
export function ListBadge({ name, color, size = 'md', className }: ListBadgeProps) {
  const initial = (Array.from(name.trim())[0] ?? '').toLocaleUpperCase()
  return (
    <span
      aria-hidden="true"
      data-slot="list-badge"
      className={cn(SIZES[size], 'flex shrink-0 items-center justify-center font-semibold text-white', className)}
      style={{ backgroundColor: `var(--chart-${color})` }}
    >
      {initial}
    </span>
  )
}
