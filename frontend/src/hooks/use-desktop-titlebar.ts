import { useQuery } from '@tanstack/react-query'
import { admin } from '@/lib/api'
import { toDesktopTitlebar, type DesktopTitlebar } from '@/lib/desktop-titlebar'
import { isDesktop } from '@/lib/platform'

export const DESKTOP_TITLEBAR_QUERY = ['admin', 'desktop-titlebar'] as const

/** The top bar the admin chose for the desktop app; on the web, which draws none, nothing is asked. */
export function useDesktopTitlebar(): DesktopTitlebar {
  const desktop = isDesktop()
  const { data } = useQuery({
    queryKey: DESKTOP_TITLEBAR_QUERY,
    queryFn: () => admin.desktopTitlebar(),
    enabled: desktop,
    staleTime: Infinity,
    retry: false,
  })
  return toDesktopTitlebar(data?.style)
}
