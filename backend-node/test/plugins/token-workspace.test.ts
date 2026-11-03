import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppContext } from '../../src/context.ts'
import { authGuards } from '../../src/plugins/auth.ts'
import { requireWrite, workspaceContext } from '../../src/plugins/workspace.ts'
import { invite, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp, register } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

function testRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { requireUser } = authGuards(ctx)
  const reading = [requireUser, workspaceContext(ctx)]
  const answer = async (request: { workspace: { workspace: { id: string }; member: { role: string } } }) => ({
    workspace_id: request.workspace.workspace.id,
    role: request.workspace.member.role,
  })
  app.get('/test/read', { config: { tokenScope: 'any' }, preValidation: reading }, answer)
  app.post('/test/write', { config: { tokenScope: 'any' }, preValidation: [...reading, requireWrite] }, answer)
}

let t: TestApp
let owner: Awaited<ReturnType<typeof ownerViewerStranger>>['owner']
let workspaceId: string
let strangerWorkspaceId: string

beforeAll(async () => {
  t = await createTestApp({}, { routes: testRoutes })
  ;({ owner, workspaceId, strangerWorkspaceId } = await ownerViewerStranger(t))
})
afterAll(async () => {
  await t.close()
})

const read = (token: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url: '/test/read', headers: { ...bearer(token), ...headers } })
const write = (token: string) => t.app.inject({ method: 'POST', url: '/test/write', headers: bearer(token) })
const asOwner = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url, headers: bearer(owner.token), payload })
const newWorkspace = async (name: string) => (await asOwner('POST', '/api/workspaces', { name, self_membership: true })).json().id as string

describe('the workspace of a token', () => {
  it('SCOPE-01 without the header uses the workspace of the token, not the default of the user', async () => {
    const other = await newWorkspace('Other')
    const defaultOfUser = (await read(owner.token)).json().workspace_id as string
    const bound = defaultOfUser === other ? workspaceId : other
    expect(bound).not.toBe(defaultOfUser)

    const token = await mintToken(t, owner.token, bound)
    const reply = await read(token.value)
    expect(reply.statusCode).toBe(200)
    expect(reply.json().workspace_id).toBe(bound)
  })

  it('SCOPE-01 accepts the header when it names the same workspace, in any case', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    for (const header of [workspaceId, workspaceId.toUpperCase()]) {
      const reply = await read(token.value, { 'x-workspace-id': header })
      expect(reply.statusCode).toBe(200)
      expect(reply.json().workspace_id).toBe(workspaceId)
    }
  })

  it('SCOPE-02 refuses another workspace in the header, even one the owner belongs to', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    const mine = await newWorkspace('Also mine')
    for (const header of [mine, strangerWorkspaceId, 'not-a-uuid']) {
      const reply = await read(token.value, { 'x-workspace-id': header })
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ detail: 'Token is bound to another workspace' })
    }
  })

  it('SCOPE-08 a member removed from the workspace gets 404', async () => {
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    const token = await mintToken(t, editor.token, workspaceId)
    expect((await read(token.value)).statusCode).toBe(200)

    expect((await asOwner('DELETE', `/api/workspaces/${workspaceId}/members/${editor.id}`)).statusCode).toBe(204)
    for (const headers of [{}, { 'x-workspace-id': workspaceId }] as Array<Record<string, string>>) {
      const reply = await read(token.value, headers)
      expect(reply.statusCode).toBe(404)
      expect(reply.json()).toEqual({ detail: 'Workspace not found' })
    }
  })

  it('SCOPE-08 an archived workspace gets 404', async () => {
    const archived = await newWorkspace('To archive')
    const token = await mintToken(t, owner.token, archived)
    expect((await read(token.value)).statusCode).toBe(200)

    expect((await asOwner('POST', `/api/workspaces/${archived}/archive`)).statusCode).toBe(200)
    const reply = await read(token.value)
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({ detail: 'Workspace not found' })
  })

  it('SCOPE-07 SCOPE-11 a demotion applies to the next write, and reading goes on', async () => {
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    const token = await mintToken(t, editor.token, workspaceId)
    const before = await write(token.value)
    expect(before.statusCode).toBe(200)
    expect(before.json().role).toBe('editor')

    expect((await asOwner('PATCH', `/api/workspaces/${workspaceId}/members/${editor.id}`, { role: 'viewer' })).statusCode).toBe(200)
    const after = await write(token.value)
    expect(after.statusCode).toBe(403)
    expect(after.json()).toEqual({ detail: 'Read-only role' })
    expect((await read(token.value)).json().role).toBe('viewer')
  })

  it('SCOPE-10 the session JWT keeps choosing any workspace it belongs to', async () => {
    const someone = await register(t)
    const reply = await read(someone.token, { 'x-workspace-id': workspaceId })
    expect(reply.statusCode).toBe(404)
    expect((await read(owner.token, { 'x-workspace-id': workspaceId })).json().workspace_id).toBe(workspaceId)
    expect((await read(owner.token, { 'x-workspace-id': 'not-a-uuid' })).statusCode).toBe(400)
  })
})
