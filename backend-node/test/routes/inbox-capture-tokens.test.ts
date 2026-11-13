import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { callTool, connect, listen } from '../support/mcp.ts'
import { inWorkspace, invite, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
let url: string
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
  vi.spyOn(t.ctx.keyValueStore, 'rateLimitHit').mockResolvedValue(0)
  url = await listen(t)
})
afterAll(async () => {
  await t.close()
})

async function setup() {
  const roles = await ownerViewerStranger(t)
  const inbox = async (token = roles.owner.token, workspace = roles.workspaceId) =>
    (await call('GET', '/api/inbox', token, workspace)).json().items as Array<Record<string, unknown>>
  const byToken = (token: string, payload: object) => t.app.inject({ method: 'POST', url: '/api/inbox', headers: bearer(token), payload })
  return { ...roles, inbox, byToken }
}

describe('CAP-09 capturing with a token', () => {
  it('POST /api/inbox with inbox:create puts the item in the inbox of the token owner, with the origin api and the token', async () => {
    const { owner, workspaceId, inbox, byToken } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['inbox:create'])
    const reply = await byToken(token.value, { text: '  Ligar para o contador  ', source: 'desktop' })
    expect(reply.statusCode).toBe(201)
    expect(reply.json()).toMatchObject({ text: 'Ligar para o contador', source: 'api', created_via: expect.stringMatching(/^token-/) })
    expect(await inbox()).toEqual([reply.json()])
  })

  it('the MCP tool capture puts the item in the inbox with the origin mcp and the token', async () => {
    const { owner, workspaceId, inbox } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['inbox:create'])
    const client = await connect(url, token.value)
    const result = await callTool(client, 'capture', { text: 'Revisar o contrato' })
    await client.close()
    expect(result.isError).toBe(false)
    expect(result.json()).toMatchObject({ text: 'Revisar o contrato', source: 'mcp', created_via: expect.stringMatching(/^token-/) })
    expect(await inbox()).toEqual([expect.objectContaining({ text: 'Revisar o contrato', source: 'mcp' })])
  })

  it('the MCP tool capture refuses an empty text with an error and creates nothing', async () => {
    const { owner, workspaceId, inbox } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['inbox:create'])
    const client = await connect(url, token.value)
    const result = await callTool(client, 'capture', { text: '   ' })
    await client.close()
    expect(result.isError).toBe(true)
    expect(await inbox()).toEqual([])
  })

  it('a viewer captures with a token too', async () => {
    const { viewer, workspaceId, inbox, byToken } = await setup()
    const token = await mintToken(t, viewer.token, workspaceId, ['inbox:create'])
    expect((await byToken(token.value, { text: 'Ideia' })).statusCode).toBe(201)
    expect((await inbox(viewer.token)).map((item) => item.text)).toEqual(['Ideia'])
  })
})

describe('CAP-10 a token without inbox:create', () => {
  it('POST /api/inbox answers 403 and creates nothing', async () => {
    const { owner, workspaceId, inbox, byToken } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['lists:read', 'tasks:read', 'tasks:create', 'tasks:write', 'tasks:delete'])
    const reply = await byToken(token.value, { text: 'Ligar' })
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ detail: 'Missing scope: inbox:create' })
    expect(await inbox()).toEqual([])
  })

  it('the MCP tool capture answers an error and creates nothing', async () => {
    const { owner, workspaceId, inbox } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['tasks:create'])
    const client = await connect(url, token.value)
    const result = await client.callTool({ name: 'capture', arguments: { text: 'Ligar' } })
    await client.close()
    expect(result.isError).toBe(true)
    expect(await inbox()).toEqual([])
  })

  it('reading the inbox with a token answers 403, even with inbox:create', async () => {
    const { owner, workspaceId } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['inbox:create'])
    for (const path of ['/api/inbox', '/api/inbox/count']) {
      const reply = await t.app.inject({ method: 'GET', url: path, headers: bearer(token.value) })
      expect(reply.statusCode, path).toBe(403)
    }
  })
})

describe('EDGE-08 a member who leaves the workspace', () => {
  it('loses their items of that workspace; their items of another workspace stay', async () => {
    const { owner, workspaceId, inbox } = await setup()
    const member = await invite(t, owner.token, workspaceId, 'editor')
    const theirOwn = (await t.app.inject({ method: 'POST', url: '/api/workspaces', headers: bearer(member.token), payload: { name: 'Own', self_membership: true } })).json().id as string
    expect((await call('POST', '/api/inbox', member.token, workspaceId, { text: 'Do compartilhado' })).statusCode).toBe(201)
    expect((await call('POST', '/api/inbox', member.token, theirOwn, { text: 'Do próprio' })).statusCode).toBe(201)
    await call('POST', '/api/inbox', owner.token, workspaceId, { text: 'Do dono' })

    const removed = await t.app.inject({ method: 'DELETE', url: `/api/workspaces/${workspaceId}/members/${member.id}`, headers: bearer(owner.token) })
    expect(removed.statusCode).toBe(204)

    expect((await inbox(member.token, theirOwn)).map((item) => item.text)).toEqual(['Do próprio'])
    expect((await inbox()).map((item) => item.text)).toEqual(['Do dono'])
    // Back in the workspace, the old items are gone.
    await t.app.inject({ method: 'POST', url: `/api/workspaces/${workspaceId}/members`, headers: bearer(owner.token), payload: { email: member.email, role: 'editor' } })
    expect(await inbox(member.token)).toEqual([])
  })
})
