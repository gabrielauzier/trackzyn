import { describe, it, expect } from 'vitest'
import { navItems, visibleNavItems, type NavItem } from './nav-items'

const linkKeys = (items: NavItem[]) =>
  items.flatMap((item) => (item.type === 'link' ? [item.key] : []))

const separators = (items: NavItem[]) =>
  items.flatMap((item) => (item.type === 'separator' ? [item.labelKey] : []))

describe('visibleNavItems', () => {
  it('keeps every unflagged link', () => {
    expect(linkKeys(visibleNavItems(navItems, () => false))).toEqual(linkKeys(navItems))
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
      ['newList', '/?new=1'],
      ['allLists', '/'],
      ['archivedLists', '/lists/archived'],
    ])
  })
})
