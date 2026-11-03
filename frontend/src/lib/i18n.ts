import i18n, { type BackendModule, type ResourceLanguage } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ptBR from '@/locales/pt-BR.json'
import en from '@/locales/en.json'

// Keep the default and Brazilian Portuguese bundles available immediately;
// other languages are separate build assets loaded by i18next when selected.
const localeLoaders = import.meta.glob<{ default: ResourceLanguage }>([
  '../locales/*.json', '!../locales/en.json', '!../locales/pt-BR.json',
])

function syncHtmlLang(lng: string) {
  document.documentElement.lang = lng
}

export const i18nReady = i18n
  .use<BackendModule>({
    type: 'backend',
    init() {},
    read(language, _namespace, callback) {
      const load = localeLoaders[`../locales/${language}.json`]
      if (!load) {
        callback(null, {})
        return
      }
      load().then(
        ({ default: resource }) => callback(null, resource),
        (error: Error) => callback(error, false),
      )
    },
  })
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      en: { translation: en },
    },
    partialBundledLanguages: true,
    initAsync: false,
    fallbackLng: 'en',
    // English is the default. Honour an explicit, persisted choice
    // (querystring/localStorage/cookie) but do NOT auto-pick the browser
    // language — otherwise a pt-BR/es-* browser would override the English
    // default before the user ever chooses.
    detection: {
      order: ['querystring', 'localStorage', 'cookie'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

syncHtmlLang(i18n.language || 'en')
i18n.on('languageChanged', syncHtmlLang)

export type SupportedLang = 'en' | 'pt-BR'

// Single source of truth for language pickers. To add a locale: drop a
// `locales/<code>.json` next to en.json (it is lazy-loaded by the backend
// module above), add the code to SupportedLang, and add one entry here.
export const SUPPORTED_LANGS: { code: SupportedLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pt-BR', label: 'Português (BR)' },
]

// Normalise any browser/i18n language tag to one of our supported keys.
// Match on the primary subtag so 'pt', 'pt-PT' and 'pt-BR' all land on the
// Portuguese bundle instead of silently falling back to English.
export function resolveSupportedLang(lng?: string | null): SupportedLang {
  const tag = (lng ?? '').toLowerCase()
  if (tag.startsWith('pt')) return 'pt-BR'
  return 'en'
}

export default i18n
