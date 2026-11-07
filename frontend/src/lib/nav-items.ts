import { Archive, BarChart3, CalendarCheck, CalendarDays, Component, FolderOpen, LayoutGrid, Plus } from 'lucide-react'

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
 *
 * A link marked `admin` is for the instance's superuser (`is_superuser`)
 * only: hidden from everyone else, and drawn with the `admin` badge (#32).
 */
export type NavItem =
  | { type: 'link'; key: string; path: string; icon: React.ElementType; feature?: string; write?: boolean; admin?: boolean }
  | { type: 'separator'; labelKey: string }

export const navItems: NavItem[] = [
  { type: 'separator', labelKey: 'nav.groupWorkspace' },
  { type: 'link', key: 'newList', path: '/?new=1', icon: Plus, write: true },
  { type: 'link', key: 'allLists', path: '/', icon: LayoutGrid },
  { type: 'link', key: 'archivedLists', path: '/lists/archived', icon: Archive },
  { type: 'link', key: 'agenda', path: '/agenda', icon: CalendarDays },
  // `/planejar` opens the plan of tomorrow (PLAN-30).
  { type: 'link', key: 'plan', path: '/planejar', icon: CalendarCheck },
  { type: 'link', key: 'reports', path: '/reports', icon: BarChart3 },
  { type: 'link', key: 'files', path: '/files', icon: FolderOpen, admin: true },
  { type: 'separator', labelKey: 'nav.groupDevelopers' },
  { type: 'link', key: 'components', path: '/components', icon: Component, admin: true },
]

/** The paths of the superuser-only links: the palette hides them, and what leads to them, from everyone else. */
export const adminPaths: string[] = navItems.flatMap((item) => (item.type === 'link' && item.admin ? [item.path] : []))

/**
 * Drop links whose feature flag is off, write actions when the user cannot
 * write, and admin links when the user is not a superuser, then drop any
 * section header left with nothing under it.
 * Without the second pass, hiding a section's only link leaves a floating
 * heading.
 */
export function visibleNavItems(
  items: NavItem[],
  isEnabled: (flag: string) => boolean,
  canWrite = true,
  isSuperuser = false,
): NavItem[] {
  const kept = items.filter(
    (item) =>
      item.type !== 'link' ||
      ((item.feature === undefined || isEnabled(item.feature)) &&
        (canWrite || !item.write) &&
        (isSuperuser || !item.admin)),
  )
  return kept.filter((item, index) => {
    if (item.type !== 'separator') return true
    // Links always follow their own header, so the item right after a
    // header is either one of its links or the next header.
    const next = kept[index + 1]
    return next !== undefined && next.type === 'link'
  })
}
