import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AppWindow } from 'lucide-react'
import { admin as adminApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { DESKTOP_TITLEBARS, toDesktopTitlebar, type DesktopTitlebar } from '@/lib/desktop-titlebar'
import { DESKTOP_TITLEBAR_QUERY } from '@/hooks/use-desktop-titlebar'

/** A small drawing of the window with each bar: the bar, the sidebar and the page, in the theme's tones. */
function TitlebarSketch({ style }: { style: DesktopTitlebar }) {
  const bar = style !== 'integrated'
  return (
    <div aria-hidden className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-sidebar">
      {bar && (
        <div className={cn('absolute inset-x-0 top-0 flex h-2.5 items-center px-1', style !== 'contained' && 'border-b border-border')}>
          {style === 'thin' && <span className="mx-auto h-0.5 w-6 rounded-full bg-muted-foreground/40" />}
          {style === 'search' && <span className="mx-auto h-1.5 w-8 rounded-sm border border-border bg-background" />}
          {style === 'contained' && <span className="ml-5 h-0.5 w-2 rounded-full bg-muted-foreground/40" />}
        </div>
      )}
      <div className={cn('absolute bottom-0 left-0 w-5', bar ? 'top-2.5' : 'top-0', style !== 'contained' && 'border-r border-border')}>
        {!bar && <span className="absolute left-1 top-1 flex gap-px">{[0, 1, 2].map((dot) => <span key={dot} className="size-[3px] rounded-full bg-muted-foreground/40" />)}</span>}
      </div>
      <div
        className={cn(
          'absolute bottom-0 left-5 right-0 top-2.5 bg-background',
          style === 'contained' && 'rounded-tl-md border-l border-t border-border',
        )}
      />
      {!bar && <div className="absolute left-5 right-0 top-0 h-2.5 bg-background" />}
    </div>
  )
}

/** The admin's choice of the desktop app's top bar, for everyone; the web, with no bar, is not affected. */
export function DesktopTitlebarSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // 404 when unset: the page in a card, as the app ships.
  const { data: setting } = useQuery({
    queryKey: ['admin', 'settings', 'desktop_titlebar'],
    queryFn: () => adminApi.getSetting('desktop_titlebar').catch(() => null),
    retry: false,
  })
  const current = toDesktopTitlebar(setting?.value)

  const save = useMutation({
    mutationFn: (value: DesktopTitlebar) => adminApi.updateSetting('desktop_titlebar', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'desktop_titlebar'] })
      queryClient.invalidateQueries({ queryKey: DESKTOP_TITLEBAR_QUERY })
      toast.success(t('admin.settings.updated'))
    },
    onError: () => {
      toast.error(t('common.error'))
    },
  })

  return (
    <section aria-labelledby="desktop-titlebar-title" className="rounded-xl border border-border/60 bg-card overflow-hidden mb-8">
      <div className="px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2 mb-0.5">
          <AppWindow size={15} className="text-muted-foreground" />
          <h3 id="desktop-titlebar-title" className="text-sm font-semibold text-foreground">{t('admin.settings.titlebarTitle')}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{t('admin.settings.titlebarDesc')}</p>
      </div>
      <div role="radiogroup" aria-labelledby="desktop-titlebar-title" className="divide-y divide-border/40">
        {DESKTOP_TITLEBARS.map((style) => {
          const selected = current === style
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => !selected && save.mutate(style)}
              disabled={save.isPending}
              className="flex items-center gap-4 w-full px-5 py-4 text-left hover:bg-muted/40 transition-colors"
            >
              <div className={`h-4 w-4 rounded-full border-2 shrink-0 ${selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`}>
                {selected && <div className="h-full w-full rounded-full bg-primary ring-2 ring-background ring-inset" />}
              </div>
              <TitlebarSketch style={style} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t(`admin.settings.titlebar.${style}`)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t(`admin.settings.titlebar.${style}Desc`)}</p>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
