import { describe, expect, it } from 'vitest'

import { ICON_REGISTRY, ICON_MAP, isEmoji } from '@/lib/icon-registry'

describe('ICON_REGISTRY', () => {
  it('has no duplicate names', () => {
    // A duplicate would silently win in ICON_MAP and shadow the other entry.
    const names = ICON_REGISTRY.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every entry a name, a label and a component', () => {
    for (const entry of ICON_REGISTRY) {
      expect(entry.name, 'name').toMatch(/^[a-z0-9-]+$/)
      expect(entry.label, `${entry.name} label`).not.toBe('')
      expect(entry.icon, `${entry.name} icon`).toBeDefined()
    }
  })
})

describe('ICON_MAP', () => {
  it('exposes every catalogue entry for lookup', () => {
    expect(Object.keys(ICON_MAP)).toHaveLength(ICON_REGISTRY.length)
    for (const entry of ICON_REGISTRY) {
      expect(ICON_MAP[entry.name]).toBe(entry.icon)
    }
  })

  it('returns nothing for a name it does not know', () => {
    // CategoryIcon relies on this being undefined so it can fall back rather
    // than render a blank box.
    expect(ICON_MAP['not-a-real-icon']).toBeUndefined()
  })
})

describe('isEmoji', () => {
  it('recognises an emoji icon value', () => {
    expect(isEmoji('🍔')).toBe(true)
    expect(isEmoji('🏠')).toBe(true)
    expect(isEmoji('💰')).toBe(true)
  })

  it('rejects a lucide icon name', () => {
    expect(isEmoji('shopping-cart')).toBe(false)
    expect(isEmoji('house')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isEmoji('')).toBe(false)
  })

  it('rejects a long string that merely contains an emoji', () => {
    expect(isEmoji('food 🍔')).toBe(false)
  })
})
