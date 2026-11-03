import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { admin } from '@/lib/api'
import { resolveDisplayLocale, resolveDateLocale } from '@/lib/format'
import { resolveSupportedLang } from '@/lib/i18n'

/**
 * Resolve the BCP-47 locale used for displaying numbers and dates.
 *
 * Uses the admin-wide `number_format` setting; when the admin leaves it on
 * "auto" the separators follow the UI language. An explicit choice
 * (1,000.00 / 1.000,00 / 1 000,00) overrides that for everyone.
 */
export function useDisplayLocale(): string {
  const { i18n } = useTranslation()

  const { data } = useQuery({
    queryKey: ['admin', 'number-format'],
    queryFn: () => admin.numberFormat(),
    staleTime: Infinity,
    retry: false,
  })

  const fallback = i18n.language === 'en' ? 'en-US' : i18n.language
  return resolveDisplayLocale(data?.format, undefined, fallback)
}

/**
 * Resolve the locale used for displaying *dates*. Month/day words follow the
 * user's app language; only the field order (day-first vs month-first) follows
 * the admin number/date format setting. Pair currency rendering with
 * {@link useDisplayLocale} and date rendering with this hook.
 */
export function useDateLocale(): string {
  const { i18n } = useTranslation()

  const { data: numberData } = useQuery({
    queryKey: ['admin', 'number-format'],
    queryFn: () => admin.numberFormat(),
    staleTime: Infinity,
    retry: false,
  })

  const { data: dateData } = useQuery({
    queryKey: ['admin', 'date-format'],
    queryFn: () => admin.dateFormat(),
    staleTime: Infinity,
    retry: false,
  })

  const language = resolveSupportedLang(i18n.resolvedLanguage ?? i18n.language)
  return resolveDateLocale(
    dateData?.format,
    numberData?.format,
    undefined,
    language,
  )
}
