import { describe, expect, it } from 'vitest'
import en from './en.json'
import ptBR from './pt-BR.json'

function keysOf(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key))
}

describe('locale keys', () => {
  it('en and pt-BR have identical keys', () => {
    const english = keysOf(en).sort()
    const portuguese = keysOf(ptBR).sort()
    expect(portuguese.filter((key) => !english.includes(key)), 'only in pt-BR').toEqual([])
    expect(english.filter((key) => !portuguese.includes(key)), 'only in en').toEqual([])
  })

  it('covers the connect screen, the menu and the update banner', () => {
    const keys = keysOf(en)
    for (const prefix of ['desktop.connect.', 'desktop.menu.', 'desktop.update.']) {
      expect(keys.some((key) => key.startsWith(prefix)), prefix).toBe(true)
    }
    for (const key of ['desktop.menu.file', 'desktop.menu.edit', 'desktop.menu.view', 'desktop.menu.window', 'desktop.menu.help', 'desktop.menu.switchServer', 'desktop.update.restart']) {
      expect(keys, key).toContain(key)
    }
  })
})
