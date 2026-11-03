import { useQuery } from '@tanstack/react-query'
import { useAutoUpdateCheck } from '@/hooks/use-auto-update-check'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import { isDesktop } from '@/lib/platform'

const SIX_HOURS = 1000 * 60 * 60 * 6

export type LatestRelease = {
  tagName: string
  htmlUrl: string
}

async function fetchLatestRelease(repo: string): Promise<LatestRelease | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) return null
  const payload = (await response.json()) as {
    tag_name?: string
    html_url?: string
  }
  if (!payload.tag_name || !payload.html_url) return null
  return { tagName: payload.tag_name, htmlUrl: payload.html_url }
}

/**
 * Latest GitHub release of the repository the server names in
 * `UPDATE_CHECK_REPO` (exposed through /api/info). With no repository
 * configured the query never runs, so nothing leaves the browser.
 */
export function useLatestRelease() {
  const { enabled } = useAutoUpdateCheck()
  const { updateCheckRepo } = useFeatureFlags()
  return useQuery<LatestRelease | null>({
    queryKey: ['latest-release', updateCheckRepo],
    queryFn: () => fetchLatestRelease(updateCheckRepo!),
    // The desktop app updates itself (electron-updater), so it never asks GitHub.
    enabled: enabled && !!updateCheckRepo && !isDesktop(),
    staleTime: SIX_HOURS,
    gcTime: SIX_HOURS,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
