import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppContext } from '../../src/context.ts'
import { personalAccessTokens, users } from '../../src/db/schema.ts'
import { authGuards } from '../../src/plugins/auth.ts'
import { generateToken } from '../../src/services/access-tokens.ts'
import { ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, bootstrapAdmin, createTestApp, register } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

/** Routes only this test declares, so the hook is proved apart from the real scope table. */
function testRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { requireUser, requireSuperuser } = authGuards(ctx)
  const whoAmI = async (request: { user: { id: string } }) => ({ user_id: request.user.id })
  app.get('/test/scoped', { config: { tokenScope: 'tasks:read' }, preValidation: [requireUser] }, whoAmI)
  app.get('/test/any', { config: { tokenScope: 'any' }, preValidation: [requireUser] }, whoAmI)
  app.get('/test/admin', { config: { tokenScope: 'any' }, preValidation: [requireSuperuser] }, whoAmI)
}

let t: TestApp
let owner: Awaited<ReturnType<typeof ownerViewerStranger>>['owner']
let workspaceId: string

beforeAll(async () => {
  t = await createTestApp({}, { routes: testRoutes })
  ;({ owner, workspaceId } = await ownerViewerStranger(t))
})
afterAll(async () => {
  await t.close()
})

const call = (token: string, url: string, method: 'GET' | 'POST' | 'DELETE' | 'HEAD' = 'GET') =>
  t.app.inject({ method, url, headers: bearer(token) })
const row = async (id: string) => {
  const [found] = await t.ctx.db.select().from(personalAccessTokens).where(eq(personalAccessTokens.id, id))
  return found!
}
const setRow = (id: string, values: Partial<typeof personalAccessTokens.$inferInsert>) =>
  t.ctx.db.update(personalAccessTokens).set(values).where(eq(personalAccessTokens.id, id))

function expectSame401(reply: Awaited<ReturnType<typeof call>>) {
  expect(reply.statusCode).toBe(401)
  expect(reply.json()).toEqual({ detail: 'Unauthorized' })
  expect(reply.headers['www-authenticate']).toBe('Bearer')
}

describe('authentication', () => {
  it('AUTH-01 authenticates the request as the owner of an active token', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await call(token.value, '/test/any')
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ user_id: owner.id })
  })

  it('AUTH-01 accepts the Bearer scheme in any case, like the session JWT', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await t.app.inject({ method: 'GET', url: '/test/any', headers: { authorization: `bearer ${token.value}` } })
    expect(reply.json()).toEqual({ user_id: owner.id })
  })

  it('AUTH-02 an unknown token gets the 401', async () => {
    expectSame401(await call(generateToken().plaintext, '/test/any'))
  })

  it('AUTH-08 a malformed token with the prefix gets the same 401', async () => {
    expectSame401(await call('tkz_short', '/test/any'))
    expectSame401(await call(`${generateToken().plaintext}x`, '/test/any'))
  })

  it('AUTH-03 AUTH-10 an expired token gets the same 401', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    await setRow(token.id, { expiresAt: new Date(Date.now() - 1000) })
    expectSame401(await call(token.value, '/test/any'))
  })

  it('AUTH-04 the first request after a revocation gets the same 401', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    expect((await call(token.value, '/test/any')).statusCode).toBe(200)
    expect((await call(owner.token, `/api/tokens/${token.id}`, 'DELETE')).statusCode).toBe(204)
    expectSame401(await call(token.value, '/test/any'))
  })

  it('AUTH-05 a token of an inactive owner gets the same 401', async () => {
    const someone = await register(t)
    const created = await t.app.inject({ method: 'POST', url: '/api/workspaces', headers: bearer(someone.token), payload: { name: 'Mine', self_membership: true } })
    const token = await mintToken(t, someone.token, created.json().id as string)
    await t.ctx.db.update(users).set({ isActive: false }).where(eq(users.id, someone.id))
    expectSame401(await call(token.value, '/test/any'))
  })

  it('AUTH-02 an invalid token is refused even on a public or unknown route', async () => {
    const invalid = generateToken().plaintext
    expectSame401(await call(invalid, '/api/health'))
    expectSame401(await call(invalid, '/api/does-not-exist'))
  })
})

describe('deny by default', () => {
  it.each([
    ['GET', '/api/users/me'],
    ['GET', '/api/tokens'],
    ['POST', '/api/tokens'],
    ['DELETE', '/api/tokens/00000000-0000-4000-8000-000000000000'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/health'],
    ['GET', '/api/info'],
  ] as const)('SCOPE-03 SCOPE-06 %s %s answers 403 to a token with every scope', async (method, url) => {
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await call(token.value, url, method)
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ detail: 'Route not available for tokens' })
  })

  it('SCOPE-04 the generated HEAD of a route with a scope is denied too', async () => {
    const token = await mintToken(t, owner.token, workspaceId, ['tasks:read'])
    expect((await call(token.value, '/test/scoped')).statusCode).toBe(200)
    expect((await call(token.value, '/test/scoped', 'HEAD')).statusCode).toBe(403)
  })

  it('SCOPE-05 a route answers 403 without its scope and passes with it', async () => {
    const without = await mintToken(t, owner.token, workspaceId, ['lists:read', 'tasks:create'])
    const reply = await call(without.value, '/test/scoped')
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ detail: 'Missing scope: tasks:read' })

    const withIt = await mintToken(t, owner.token, workspaceId, ['tasks:read'])
    const passed = await call(withIt.value, '/test/scoped')
    expect(passed.statusCode).toBe(200)
    expect(passed.json()).toEqual({ user_id: owner.id })
  })

  it('a route declared as `any` passes with any scope', async () => {
    const token = await mintToken(t, owner.token, workspaceId, ['lists:read'])
    expect((await call(token.value, '/test/any')).statusCode).toBe(200)
  })

  it('a route that does not exist still answers 404 to a valid token', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await call(token.value, '/api/does-not-exist')
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({ detail: 'Not Found' })
    expect((await call(token.value, '/api/does-not-exist', 'HEAD')).statusCode).toBe(404)
  })

  it('requireSuperuser refuses a token even when its owner is a superuser', async () => {
    const fresh = await createTestApp({}, { routes: testRoutes })
    try {
      const admin = await bootstrapAdmin(fresh)
      const created = await fresh.app.inject({ method: 'POST', url: '/api/workspaces', headers: bearer(admin.token), payload: { name: 'Admin', self_membership: true } })
      const token = await mintToken(fresh, admin.token, created.json().id as string)
      expect((await fresh.app.inject({ method: 'GET', url: '/test/admin', headers: bearer(admin.token) })).statusCode).toBe(200)

      const reply = await fresh.app.inject({ method: 'GET', url: '/test/admin', headers: bearer(token.value) })
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ detail: 'Forbidden' })
    } finally {
      await fresh.close()
    }
  })
})

describe('rate limit', () => {
  it('RATE-01 the 60th request passes, the 61st gets 429 with Retry-After: 60, and another token is not affected', async () => {
    const busy = await mintToken(t, owner.token, workspaceId)
    const other = await mintToken(t, owner.token, workspaceId)

    for (let n = 1; n <= 60; n += 1) {
      // Denied requests count as well: half of them go to a route tokens cannot reach.
      const url = n % 2 === 0 ? '/test/any' : '/api/health'
      expect((await call(busy.value, url)).statusCode, `request ${n}`).toBe(n % 2 === 0 ? 200 : 403)
    }
    const limited = await call(busy.value, '/test/any')
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({ detail: 'Too many requests' })
    expect(limited.headers['retry-after']).toBe('60')

    expect((await call(other.value, '/test/any')).statusCode).toBe(200)
  })
})

describe('last_used_at', () => {
  it('MANAGE-07 is written on the first use, even when the route then answers 403', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    expect((await row(token.id)).lastUsedAt).toBeNull()

    const before = Date.now()
    expect((await call(token.value, '/api/health')).statusCode).toBe(403)
    expect((await row(token.id)).lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('MANAGE-07 is kept within 60 s and rewritten after them', async () => {
    const token = await mintToken(t, owner.token, workspaceId)

    const recent = new Date(Date.now() - 50_000)
    await setRow(token.id, { lastUsedAt: recent })
    await call(token.value, '/test/any')
    expect((await row(token.id)).lastUsedAt).toEqual(recent)

    const old = new Date(Date.now() - 61_000)
    await setRow(token.id, { lastUsedAt: old })
    const before = Date.now()
    await call(token.value, '/test/any')
    expect((await row(token.id)).lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('MANAGE-07 a refused token writes nothing', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    const expiresAt = new Date(Date.now() - 1000)
    await setRow(token.id, { expiresAt })
    await call(token.value, '/test/any')
    expect((await row(token.id)).lastUsedAt).toBeNull()
  })
})

describe('log', () => {
  it('OBS-01 records token_id and user_id on the requests of a token and never its value', async () => {
    const lines: string[] = []
    const logged = await createTestApp({}, { server: { logger: { level: 'trace', stream: { write: (line: string) => void lines.push(line) } } }, routes: testRoutes })
    try {
      const { owner: me, workspaceId: mine } = await ownerViewerStranger(logged)
      const token = await mintToken(logged, me.token, mine)
      lines.length = 0

      await logged.app.inject({ method: 'GET', url: '/test/any', headers: bearer(token.value) })
      await logged.app.inject({ method: 'GET', url: '/api/health', headers: bearer(token.value) })

      const entries = lines.map((line) => JSON.parse(line) as { msg: string; token_id?: string; user_id?: string; statusCode?: number })
      const completed = entries.filter((entry) => entry.msg === 'request completed')
      expect(completed).toHaveLength(2)
      for (const entry of completed) {
        expect(entry.token_id).toBe(token.id)
        expect(entry.user_id).toBe(me.id)
      }
      expect(lines.join('')).not.toContain(token.value)
      expect(lines.join('')).not.toContain(token.value.slice(4))
    } finally {
      await logged.close()
    }
  })

  it('OBS-01 a rate-limited request of a token is recorded too', async () => {
    const lines: string[] = []
    const logged = await createTestApp({}, { server: { logger: { level: 'info', stream: { write: (line: string) => void lines.push(line) } } }, routes: testRoutes })
    try {
      const { owner: me, workspaceId: mine } = await ownerViewerStranger(logged)
      const token = await mintToken(logged, me.token, mine)
      for (let n = 0; n < 60; n += 1) await logged.app.inject({ method: 'GET', url: '/test/any', headers: bearer(token.value) })
      lines.length = 0

      const limited = await logged.app.inject({ method: 'GET', url: '/test/any', headers: bearer(token.value) })
      expect(limited.statusCode).toBe(429)
      const completed = lines.map((line) => JSON.parse(line) as { msg: string; token_id?: string }).find((entry) => entry.msg === 'request completed')
      expect(completed?.token_id).toBe(token.id)
    } finally {
      await logged.close()
    }
  })
})

describe('the session JWT', () => {
  it('SCOPE-10 takes none of the token steps', async () => {
    // A route without a scope stays open to the JWT, and a route with one needs nothing more.
    expect((await call(owner.token, '/api/users/me')).statusCode).toBe(200)
    expect((await call(owner.token, '/test/scoped')).json()).toEqual({ user_id: owner.id })
    for (let n = 0; n < 61; n += 1) expect((await call(owner.token, '/test/any')).statusCode).toBe(200)
  })

  it('SCOPE-10 an invalid JWT keeps its 401 without WWW-Authenticate, and public routes stay public for it', async () => {
    const reply = await call('not-a-jwt', '/api/users/me')
    expect(reply.statusCode).toBe(401)
    expect(reply.headers['www-authenticate']).toBeUndefined()
    expect((await call('not-a-jwt', '/api/health')).statusCode).toBe(200)
  })
})
