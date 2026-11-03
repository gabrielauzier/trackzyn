import { Archive, BarChart3, Component, FolderOpen, LayoutGrid, Plus } from 'lucide-react'

/**
 * Sidebar destinations. Lives outside `app-layout.tsx` so the filtering
 * below can be tested without mounting the whole layout.
 *
 * A link may name a `feature` flag from `/api/info`: it is shown only when
 * the server reports that flag on. Use it to ship optional modules that a
 * deployment can switch off from the environment.
 *
 * A link marked `write` leads to an action that changes data, so it is
 * hidden from a `viewer`.
 */
export type NavItem =
  | { type: 'link'; key: string; path: string; icon: React.ElementType; feature?: string; write?: boolean }
  | { type: 'separator'; labelKey: string }

export const navItems: NavItem[] = [
  { type: 'separator', labelKey: 'nav.groupWorkspace' },
  { type: 'link', key: 'newList', path: '/?new=1', icon: Plus, write: true },
  { type: 'link', key: 'allLists', path: '/', icon: LayoutGrid },
  { type: 'link', key: 'archivedLists', path: '/lists/archived', icon: Archive },
  { type: 'link', key: 'reports', path: '/reports', icon: BarChart3 },
  { type: 'link', key: 'files', path: '/files', icon: FolderOpen },
  { type: 'separator', labelKey: 'nav.groupDevelopers' },
  { type: 'link', key: 'components', path: '/components', icon: Component },
]

/**
 * Drop links whose feature flag is off, and write actions when the user
 * cannot write, then drop any section header left with nothing under it.
 * Without the second pass, hiding a section's only link leaves a floating
 * heading.
 */
export function visibleNavItems(
  items: NavItem[],
  isEnabled: (flag: string) => boolean,
  canWrite = true,
): NavItem[] {
  const kept = items.filter(
    (item) =>
      item.type !== 'link' ||
      ((item.feature === undefined || isEnabled(item.feature)) && (canWrite || !item.write)),
  )
  return kept.filter((item, index) => {
    if (item.type !== 'separator') return true
    // Links always follow their own header, so the item right after a
    // header is either one of its links or the next header.
    const next = kept[index + 1]
    return next !== undefined && next.type === 'link'
  })
}
