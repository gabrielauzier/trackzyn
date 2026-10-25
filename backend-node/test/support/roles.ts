import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import { tasks } from '../../src/db/schema.ts'
import { type TestApp, bearer, register } from './test-app.ts'

export type User = Awaited<ReturnType<typeof register>>

/** An owner, a viewer of the owner's new workspace, and a stranger with a workspace of their own. */
export async function ownerViewerStranger(t: TestApp) {
  const owner = await register(t)
  const workspace = await t.app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: bearer(owner.token),
    payload: { name: 'Shared', self_membership: true },
  })
  const workspaceId = workspace.json().id as string
  const viewer = await register(t)
  const invited = await t.app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/members`,
    headers: bearer(owner.token),
    payload: { email: viewer.email, role: 'viewer' },
  })
  expect(invited.statusCode).toBe(201)

  const stranger = await register(t)
  const theirs = await t.app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: bearer(stranger.token),
    payload: { name: 'Theirs', self_membership: true },
  })
  return { owner, viewer, workspaceId, stranger, strangerWorkspaceId: theirs.json().id as string }
}

export const inWorkspace =
  (t: TestApp) =>
  (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token: string, workspaceId: string, payload?: unknown) =>
    t.app.inject({ method, url, headers: { ...bearer(token), 'x-workspace-id': workspaceId }, payload: payload as object })

/** A new user invited to `workspaceId` with `role` (an editor can write). */
export async function invite(t: TestApp, ownerToken: string, workspaceId: string, role: 'editor' | 'viewer') {
  const user = await register(t)
  const invited = await t.app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/members`,
    headers: bearer(ownerToken),
    payload: { email: user.email, role },
  })
  expect(invited.statusCode).toBe(201)
  return user
}

/** Who completed the task, read straight from the database (AD-006). */
export async function completedBy(t: TestApp, taskId: string): Promise<string | null | undefined> {
  const [row] = await t.ctx.db.select({ by: tasks.completedByUserId }).from(tasks).where(eq(tasks.id, taskId))
  return row?.by
}
