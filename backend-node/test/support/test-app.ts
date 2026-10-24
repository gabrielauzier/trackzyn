import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.ts'
import { type Config, loadConfig } from '../../src/config.ts'
import type { AppContext } from '../../src/context.ts'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'
import { LocalStorageProvider } from '../../src/ports/local-storage.ts'
import { InProcessQueue } from '../../src/ports/in-process-queue.ts'
import { MemoryStore } from '../../src/ports/memory-store.ts'

export interface TestApp {
  app: FastifyInstance
  ctx: AppContext
  close(): Promise<void>
}

/**
 * The application on an in-memory PostgreSQL (PGlite) and in-memory ports: no Redis, no
 * external database. `env` overrides settings the way environment variables would.
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const client = new PGlite()
  const db = drizzle(client) as unknown as Database
  await applyMigrations(db)

  const config: Config = loadConfig(
    { SECRET_KEY: 'test-signing-key', TRUSTED_PROXY_HOPS: '1', ...env },
    { envFiles: [], secretsDirs: [] },
  )
  const storage = new LocalStorageProvider(mkdtempSync(join(tmpdir(), 'launchkit-node-files-')))
  const ctx: AppContext = { config, db, keyValueStore: new MemoryStore(), jobQueue: new InProcessQueue(), storage }
  const app = await buildApp(ctx)
  return {
    app,
    ctx,
    close: async () => {
      await app.close()
      await ctx.jobQueue.close()
      await ctx.keyValueStore.close()
      await client.close()
    },
  }
}

let ipCounter = 0
export const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`

export const PASSWORD = 'integration-pass-123'
let emailCounter = 0
export const uniqueEmail = () => `user-${++emailCounter}@example.com`

export async function register(t: TestApp, email = uniqueEmail(), password = PASSWORD) {
  const created = await t.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'x-forwarded-for': freshIp() },
    payload: { email, password },
  })
  const session = await t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'x-forwarded-for': freshIp(), 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ username: email, password }).toString(),
  })
  return {
    email,
    password,
    id: created.json().id as string,
    token: session.json().access_token as string,
  }
}

export async function bootstrapAdmin(t: TestApp) {
  const email = uniqueEmail()
  const reply = await t.app.inject({
    method: 'POST',
    url: '/api/setup/create-admin',
    headers: { 'x-forwarded-for': freshIp() },
    payload: { email, password: PASSWORD },
  })
  return { email, token: reply.json().access_token as string }
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}`, 'x-forwarded-for': freshIp() })
