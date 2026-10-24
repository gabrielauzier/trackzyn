import { useQuery } from '@tanstack/react-query'
import { info } from '@/lib/api'

/**
 * Reads /api/info once per session. Optional modules check the returned
 * flags so their nav items / routes stay hidden when the server has the
 * feature disabled (see `app.core.feature_flags` on the backend).
 */
export function useFeatureFlags() {
  const { data, isLoading } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => info.get(),
    staleTime: 1000 * 60 * 60,
  })
  return {
    isLoading,
    features: data?.features ?? {},
    isEnabled: (flag: string) => !!data?.features?.[flag],
    updateCheckRepo: data?.update_check_repo ?? null,
  }
}
