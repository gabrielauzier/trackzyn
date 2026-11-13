import { useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/workspace-context'
import { lists as listsApi } from '@/lib/api'
import type { ListCard } from '@/types'

/**
 * The lists an item can go to (QUICK-01): the active lists of the workspace, and none for a member who does
 * not write in them (a viewer), as the board decides `canWrite`.
 */
export function useWritableLists(): ListCard[] {
  const { canWrite } = useWorkspace()
  const { data } = useQuery({
    queryKey: ['lists', { archived: false }],
    queryFn: () => listsApi.list({ archived: false }),
    enabled: canWrite,
  })
  if (!canWrite) return []
  return (data?.lists ?? []).filter((list) => !list.is_archived)
}
