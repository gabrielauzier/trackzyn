import type { TokenScope } from '../../src/db/schema.ts'

/** The table "Escopos e rotas" of the spec, by hand: a route that changes its scope must change this too (AD-007). */
export const TOKEN_ROUTES: ReadonlyArray<{ method: string; url: string; scope: TokenScope }> = [
  { method: 'GET', url: '/api/lists', scope: 'lists:read' },
  { method: 'GET', url: '/api/lists/:list_id', scope: 'lists:read' },
  { method: 'GET', url: '/api/lists/:list_id/board', scope: 'tasks:read' },
  { method: 'GET', url: '/api/tasks/:task_id', scope: 'tasks:read' },
  { method: 'POST', url: '/api/tasks', scope: 'tasks:create' },
  { method: 'PATCH', url: '/api/tasks/:task_id', scope: 'tasks:write' },
  { method: 'POST', url: '/api/tasks/:task_id/move', scope: 'tasks:write' },
  { method: 'POST', url: '/api/tasks/:task_id/move-to-list', scope: 'tasks:write' },
  { method: 'POST', url: '/api/tasks/:task_id/duplicate', scope: 'tasks:write' },
  { method: 'POST', url: '/api/tasks/:task_id/subtasks', scope: 'tasks:write' },
  { method: 'PATCH', url: '/api/subtasks/:subtask_id', scope: 'tasks:write' },
  { method: 'POST', url: '/api/subtasks/:subtask_id/move', scope: 'tasks:write' },
  { method: 'DELETE', url: '/api/tasks/:task_id', scope: 'tasks:delete' },
  { method: 'DELETE', url: '/api/subtasks/:subtask_id', scope: 'tasks:delete' },
]

export const routeKey = (route: { method: string; url: string }) => `${route.method} ${route.url}`
