import { Component, FolderOpen, LayoutDashboard } from 'lucide-react'

/**
 * Sidebar destinations. Lives outside `app-layout.tsx` so the filtering
 * below can be tested without mounting the whole layout.
 *
 * A link may name a `feature` flag from `/api/info`: it is shown only when
 * the server reports that flag on. Use it to ship optional modules that a
 * deployment can switch off from the environment.
 */
export type NavItem =
  | { type: 'link'; key: string; path: string; icon: React.ElementType; feature?: string }
  | { type: 'separator'; labelKey: string }

export const navItems: NavItem[] = [
  { type: 'separator', labelKey: 'nav.groupWorkspace' },
  { type: 'link', key: 'dashboard', path: '/', icon: LayoutDashboard },
  { type: 'link', key: 'files', path: '/files', icon: FolderOpen },
  { type: 'separator', labelKey: 'nav.groupDevelopers' },
  { type: 'link', key: 'components', path: '/components', icon: Component },
]

/**
 * Drop links whose feature flag is off, then drop any section header left
 * with nothing under it. Without the second pass, hiding a section's only
 * link leaves a floating heading.
 */
export function visibleNavItems(
  items: NavItem[],
  isEnabled: (flag: string) => boolean,
): NavItem[] {
  const kept = items.filter(
    (item) => item.type !== 'link' || item.feature === undefined || isEnabled(item.feature),
  )
  return kept.filter((item, index) => {
    if (item.type !== 'separator') return true
    // Links always follow their own header, so the item right after a
    // header is either one of its links or the next header.
    const next = kept[index + 1]
    return next !== undefined && next.type === 'link'
  })
}
