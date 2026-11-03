import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { personalAccessTokens } from '../../src/db/schema.ts'
import { generateToken } from '../../src/services/access-tokens.ts'
import { writeAccessToken } from '../../src/services/tokens.ts'
import { invite, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'

const DAY_MS = 86_400_000

let t: TestApp
let owner: Awaited<ReturnType<typeof ownerViewerStranger>>['owner']
let viewer: Awaited<ReturnType<typeof ownerViewerStranger>>['viewer']
let stranger: Awaited<ReturnType<typeof ownerViewerStranger>>['stranger']
let workspaceId: string

beforeAll(async () => {
  t = await createTestApp()
  ;({ owner, viewer, stranger, workspaceId } = await ownerViewerStranger(t))
})
afterAll(async () => {
  await t.close()
})

let nameCounter = 0
const uniqueName = () => `token-${++nameCounter}`
const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: uniqueName(),
  workspace_id: workspaceId,
  scopes: ['lists:read', 'tasks:create'],
  expires_in_days: 90,
  ...overrides,
})

const post = (token: string, payload: unknown) => t.app.inject({ method: 'POST', url: '/api/tokens', headers: bearer(token), payload: payload as object })
const list = (token: string) => t.app.inject({ method: 'GET', url: '/api/tokens', headers: bearer(token) })
const revoke = (token: string, id: string) => t.app.inject({ method: 'DELETE', url: `/api/tokens/${id}`, headers: bearer(token) })
type TokenRead = { id: string; status: string; revoked_at: string | null; [field: string]: unknown }
const listed = async (token: string, id: string) => ((await list(token)).json() as TokenRead[]).find((row) => row.id === id)

describe('POST /api/tokens', () => {
  it.each([30, 90, 365])('TOKEN-03 answers 201 with the id, the full token and expires_at for %i days', async (days) => {
    const before = Date.now()
    const reply = await post(owner.token, validBody({ expires_in_days: days }))
    const after = Date.now()

    expect(reply.statusCode).toBe(201)
    const body = reply.json() as { id: string; token: string; expires_at: string }
    expect(Object.keys(body).sort()).toEqual(['expires_at', 'id', 'token'])
    expect(body.token).toMatch(/^tkz_[A-Za-z0-9_-]{43}$/)
    expect(await listed(owner.token, body.id)).toBeDefined()
    const expiresAt = new Date(body.expires_at).getTime()
    expect(expiresAt).toBeGreaterThanOrEqual(before + days * DAY_MS)
    expect(expiresAt).toBeLessThanOrEqual(after + days * DAY_MS)
  })

  it('TOKEN-03 accepts a name of 100 characters', async () => {
    const reply = await post(owner.token, validBody({ name: 'n'.repeat(100) }))
    expect(reply.statusCode).toBe(201)
  })

  it('TOKEN-07 answers 422 in the current format for an empty name', async () => {
    const reply = await post(owner.token, validBody({ name: '' }))
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toEqual({
      detail: [{ type: 'string_too_short', loc: ['body', 'name'], msg: 'String should have at least 1 characters' }],
    })
  })

  it('TOKEN-17 answers 422 for a name with a NUL character and creates nothing', async () => {
    const countBefore = ((await list(owner.token)).json() as unknown[]).length
    const reply = await post(owner.token, validBody({ name: 'a\u0000b' }))
    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail[0].loc).toEqual(['body', 'name'])
    expect((await list(owner.token)).json()).toHaveLength(countBefore)
  })

  it('TOKEN-07 answers 422 in the current format for a name of 101 characters', async () => {
    const reply = await post(owner.token, validBody({ name: 'n'.repeat(101) }))
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toEqual({
      detail: [{ type: 'string_too_long', loc: ['body', 'name'], msg: 'String should have at most 100 characters' }],
    })
  })

  it.each([
    ['empty scopes', { scopes: [] }, ['body', 'scopes']],
    ['an unknown scope', { scopes: ['tasks:admin'] }, ['body', 'scopes', 0]],
    ['expires_in_days of 60', { expires_in_days: 60 }, ['body', 'expires_in_days']],
  ])('TOKEN-07 answers 422 for %s and creates nothing', async (_case, overrides, loc) => {
    const countBefore = ((await list(owner.token)).json() as unknown[]).length
    const reply = await post(owner.token, validBody(overrides))
    expect(reply.statusCode).toBe(422)
    expect((reply.json() as { detail: Array<{ loc: unknown[] }> }).detail[0]?.loc).toEqual(loc)
    expect(((await list(owner.token)).json() as unknown[]).length).toBe(countBefore)
  })

  it('TOKEN-08 answers 409 for the name of an active token', async () => {
    const name = uniqueName()
    expect((await post(owner.token, validBody({ name }))).statusCode).toBe(201)
    const reply = await post(owner.token, validBody({ name }))
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toEqual({ detail: 'Token name already in use' })
  })

  it('TOKEN-09 answers 409 past 50 active tokens', async () => {
    const user = await invite(t, owner.token, workspaceId, 'editor')
    await t.ctx.db.insert(personalAccessTokens).values(
      Array.from({ length: 50 }, (_, index) => ({
        id: randomUUID(),
        userId: user.id,
        workspaceId,
        name: `seed-${index}`,
        tokenHash: generateToken().tokenHash,
        lastFour: 'abcd',
        scopes: ['lists:read' as const],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + DAY_MS),
      })),
    )
    const reply = await post(user.token, validBody())
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toEqual({ detail: 'Token limit reached' })
  })

  it('TOKEN-10 answers 404 for a workspace of someone else', async () => {
    const reply = await post(stranger.token, validBody())
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({ detail: 'Workspace not found' })
  })

  it('TOKEN-11 answers 403 to a viewer asking for a write scope, and 201 for read scopes', async () => {
    const refused = await post(viewer.token, validBody({ scopes: ['tasks:create'] }))
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ detail: 'Read-only role' })
    expect((await post(viewer.token, validBody({ scopes: ['lists:read', 'tasks:read'] }))).statusCode).toBe(201)
  })
})

describe('GET /api/tokens', () => {
  it('MANAGE-01 returns the fields of the token, never its value or hash', async () => {
    const name = uniqueName()
    const created = (await post(owner.token, validBody({ name }))).json() as { id: string; token: string; expires_at: string }

    const reply = await list(owner.token)

    expect(reply.statusCode).toBe(200)
    expect(reply.body).not.toContain(created.token)
    expect(reply.body).not.toContain('token_hash')
    const row = (reply.json() as TokenRead[]).find((token) => token.id === created.id)
    expect(row).toEqual({
      id: created.id,
      name,
      workspace_id: workspaceId,
      workspace_name: 'Shared',
      scopes: ['lists:read', 'tasks:create'],
      display_hint: `tkz_…${created.token.slice(-4)}`,
      created_at: expect.any(String),
      expires_at: created.expires_at,
      last_used_at: null,
      revoked_at: null,
      status: 'active',
    })
  })

  it('MANAGE-01 returns only the tokens of the user', async () => {
    const created = (await post(owner.token, validBody())).json() as { id: string }
    expect(await listed(viewer.token, created.id)).toBeUndefined()
    expect(await listed(owner.token, created.id)).toBeDefined()
  })
})

describe('DELETE /api/tokens/:token_id', () => {
  it('MANAGE-04 answers 204 and the list shows the token as revoked', async () => {
    const created = (await post(owner.token, validBody())).json() as { id: string }
    const reply = await revoke(owner.token, created.id)
    expect(reply.statusCode).toBe(204)
    expect(reply.body).toBe('')
    const row = await listed(owner.token, created.id)
    expect(row?.status).toBe('revoked')
    expect(row?.revoked_at).toEqual(expect.any(String))
  })

  it('MANAGE-05 answers 204 again and keeps revoked_at', async () => {
    const created = (await post(owner.token, validBody())).json() as { id: string }
    await revoke(owner.token, created.id)
    const first = (await listed(owner.token, created.id))?.revoked_at
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect((await revoke(owner.token, created.id)).statusCode).toBe(204)
    expect((await listed(owner.token, created.id))?.revoked_at).toBe(first)
  })

  it('MANAGE-06 answers 404 for the token of another user', async () => {
    const created = (await post(owner.token, validBody())).json() as { id: string }
    expect((await revoke(viewer.token, created.id)).statusCode).toBe(404)
    expect((await listed(owner.token, created.id))?.status).toBe('active')
  })

  it('answers 422 for an id that is not a uuid', async () => {
    expect((await revoke(owner.token, 'not-a-uuid')).statusCode).toBe(422)
  })
})

describe('without a session', () => {
  const routes: Array<['POST' | 'GET' | 'DELETE', string]> = [
    ['POST', '/api/tokens'],
    ['GET', '/api/tokens'],
    ['DELETE', `/api/tokens/${randomUUID()}`],
  ]

  it.each(routes)('AUTH-09 %s %s answers 401 with no token', async (method, url) => {
    const reply = await t.app.inject({ method, url, payload: method === 'POST' ? validBody() : undefined })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({ detail: 'Unauthorized' })
  })

  it.each(routes)('AUTH-09 %s %s answers 401 with an expired JWT', async (method, url) => {
    const expired = await writeAccessToken({ ...t.ctx.config, accessTokenExpireMinutes: -1 }, owner.id)
    const reply = await t.app.inject({ method, url, headers: bearer(expired), payload: method === 'POST' ? validBody() : undefined })
    expect(reply.statusCode).toBe(401)
    expect(reply.json()).toEqual({ detail: 'Unauthorized' })
  })
})
