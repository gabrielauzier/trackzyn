import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  localStorage.removeItem('i18nextLng')
  vi.resetModules()
  window.history.replaceState({}, '', '/')
})

it('ships English and Brazilian Portuguese bundled', async () => {
  vi.resetModules()
  const { default: i18n, i18nReady } = await import('@/lib/i18n')
  await i18nReady
  expect(i18n.hasResourceBundle('en', 'translation')).toBe(true)
  expect(i18n.hasResourceBundle('pt-BR', 'translation')).toBe(true)
})

it('restores a persisted locale before initialization resolves', async () => {
  localStorage.setItem('i18nextLng', 'pt-BR')
  vi.resetModules()
  const { default: i18n, i18nReady } = await import('@/lib/i18n')
  await i18nReady
  expect(i18n.language).toBe('pt-BR')
  expect(i18n.t('nav.dashboard')).toBe((await import('./pt-BR.json')).default.nav.dashboard)
  expect(document.documentElement.lang).toBe('pt-BR')
})

it('falls back to English for a language without a bundle', async () => {
  localStorage.setItem('i18nextLng', 'xx')
  vi.resetModules()
  const { default: i18n, i18nReady } = await import('@/lib/i18n')
  await i18nReady
  expect(i18n.t('nav.dashboard')).toBe((await import('./en.json')).default.nav.dashboard)
})
