import type { Locale } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'

import { resolveSupportedLang, type SupportedLang } from '@/lib/i18n'

// One entry per SupportedLang — the Record type makes a missing locale a
// compile error when a language is added to lib/i18n.ts.
const DATE_FNS_LOCALE: Record<SupportedLang, Locale> = {
  en: enUS,
  'pt-BR': ptBR,
}

export function resolveDateFnsLocale(language?: string | null): Locale {
  return DATE_FNS_LOCALE[resolveSupportedLang(language)]
}
