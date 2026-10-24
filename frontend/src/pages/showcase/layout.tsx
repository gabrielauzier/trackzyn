import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ShowcaseSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * One component on display: its name, the import line to copy, and a live
 * example. `wide` spans both columns of the grid.
 */
export function Specimen({
  name,
  importFrom,
  wide,
  className,
  children,
}: {
  name: string
  importFrom?: string
  wide?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0 rounded-xl border border-border/60 bg-card', wide && 'lg:col-span-2', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/40 px-4 py-2.5">
        <h3 className="text-sm font-medium">{name}</h3>
        {importFrom && (
          <code className="truncate font-mono text-[11px] text-muted-foreground">{importFrom}</code>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function SpecimenGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
}

/** Small caption above a group of variants inside a specimen. */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="mt-4 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 first:mt-0">{children}</p>
}
