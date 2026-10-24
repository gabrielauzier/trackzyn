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
})
