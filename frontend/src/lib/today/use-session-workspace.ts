import { useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/workspace-context'
import { authHeaders } from '@/lib/api'
import type { Workspace } from '@/types'

/** Whether `GET /api/lists/:id` finds the list in `workspaceId`. Axios always sends the current workspace, so fetch. */
async function foundIn(listId: string, workspaceId: string): Promise<boolean> {
  const response = await fetch(`/api/lists/${listId}`, { headers: { ...authHeaders(), 'X-Workspace-Id': workspaceId } })
  return response.ok
}

/**
 * The other workspace that holds the open session's list, when the list is not one the page already knows (HOJE-20).
 * The focus state names only the list, so each of the user's workspaces is asked for it, the current one first. Null
 * while it is not known, when `listId` is null or known here, or when the list is in the current workspace.
 */
export function useSessionWorkspace(listId: string | null, knownHere: boolean): Workspace | null {
  const { current, workspaces } = useWorkspace()
  const query = useQuery({
    queryKey: ['session-workspace', listId],
    enabled: listId !== null && !knownHere && current !== null,
    // A list never changes workspace.
    staleTime: Infinity,
    queryFn: async () => {
      const ordered = [current!, ...workspaces.filter((workspace) => workspace.id !== current!.id)]
      for (const workspace of ordered) if (await foundIn(listId!, workspace.id)) return workspace.id
      return null
    },
  })
  if (listId === null || knownHere || !query.data || query.data === current?.id) return null
  return workspaces.find((workspace) => workspace.id === query.data) ?? null
}
