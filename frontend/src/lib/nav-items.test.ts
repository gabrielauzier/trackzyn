import { describe, it, expect } from 'vitest'
import { navItems, visibleNavItems, type NavItem } from './nav-items'

const linkKeys = (items: NavItem[]) =>
  items.flatMap((item) => (item.type === 'link' ? [item.key] : []))

const separators = (items: NavItem[]) =>
  items.flatMap((item) => (item.type === 'separator' ? [item.labelKey] : []))

describe('visibleNavItems', () => {
  it('keeps every unflagged link for a superuser who can write', () => {
    expect(linkKeys(visibleNavItems(navItems, () => false, true, true))).toEqual(linkKeys(navItems))
  })

  it('admin links and their empty header are hidden from non-admins', () => {
    const asMember = visibleNavItems(navItems, () => false, true, false)
    expect(linkKeys(asMember)).not.toContain('files')
    expect(linkKeys(asMember)).not.toContain('components')
    expect(separators(asMember)).not.toContain('nav.groupDevelopers')
    // The rest of the workspace section stays.
    expect(linkKeys(asMember)).toEqual(['newList', 'allLists', 'archivedLists', 'agenda', 'plan', 'reports'])
    expect(separators(asMember)).toEqual(['nav.groupWorkspace'])
    // Not a superuser is the default.
    expect(visibleNavItems(navItems, () => false)).toEqual(asMember)

    const asAdmin = visibleNavItems(navItems, () => false, true, true)
    expect(linkKeys(asAdmin)).toEqual(expect.arrayContaining(['files', 'components']))
    expect(separators(asAdmin)).toEqual(['nav.groupWorkspace', 'nav.groupDevelopers'])
  })

  it('hides a flagged link while its feature is off', () => {
    const items: NavItem[] = [
      { type: 'separator', labelKey: 'nav.a' },
      { type: 'link', key: 'always', path: '/a', icon: 'span' },
      { type: 'link', key: 'beta', path: '/b', icon: 'span', feature: 'beta' },
    ]
    expect(linkKeys(visibleNavItems(items, () => false))).toEqual(['always'])
    expect(linkKeys(visibleNavItems(items, (f) => f === 'beta'))).toEqual(['always', 'beta'])
  })

  it('drops a section header left with no links', () => {
    const items: NavItem[] = [
      { type: 'separator', labelKey: 'nav.a' },
      { type: 'link', key: 'always', path: '/a', icon: 'span' },
      { type: 'separator', labelKey: 'nav.b' },
      { type: 'link', key: 'beta', path: '/b', icon: 'span', feature: 'beta' },
    ]
    expect(separators(visibleNavItems(items, () => false))).toEqual(['nav.a'])
  })

  it('hides write actions from a user who cannot write', () => {
    const items: NavItem[] = [
      { type: 'separator', labelKey: 'nav.a' },
      { type: 'link', key: 'create', path: '/?new=1', icon: 'span', write: true },
      { type: 'link', key: 'browse', path: '/', icon: 'span' },
    ]
    expect(linkKeys(visibleNavItems(items, () => false, false))).toEqual(['browse'])
    expect(linkKeys(visibleNavItems(items, () => false, true))).toEqual(['create', 'browse'])
  })

  it('opens the workspace section with the three list entries', () => {
    const lists = navItems.filter((item) => item.type === 'link').slice(0, 3)
    expect(lists.map((item) => item.type === 'link' && [item.key, item.path])).toEqual([
      ['newList', '/lists?new=1'],
      ['allLists', '/lists'],
      ['archivedLists', '/lists/archived'],
    ])
  })
})
