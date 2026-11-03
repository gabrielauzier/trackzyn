import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCli } from '../src/cli.ts'
import { users, workspaceMembers } from '../src/db/schema.ts'
import { type TestApp, createTestApp } from './support/test-app.ts'

describe('CLI', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await createTestApp()
  })
  afterAll(async () => {
    await t.close()
  })

  it('C36 create-user prints the success line and creates the personal workspace', async () => {
    const result = await runCli(t.ctx.db, ['create-user', 'cli-user@example.com', 'cli-pass-12345'])
    expect(result).toEqual({ code: 0, output: 'User created successfully: cli-user@example.com\n' })
    const [user] = await t.ctx.db.select().from(users).where(eq(users.email, 'cli-user@example.com'))
    expect(user?.isSuperuser).toBe(false)
    expect(user?.isVerified).toBe(true)
    const memberships = await t.ctx.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, user!.id))
    expect(memberships).toHaveLength(1)

    const again = await runCli(t.ctx.db, ['create-user', 'cli-user@example.com', 'x'])
    expect(again.code).toBe(1)
    expect(again.output).toBe("Error: User with email 'cli-user@example.com' already exists.\n")
  })

  it('C36 create-admin sets is_superuser', async () => {
    const result = await runCli(t.ctx.db, ['create-admin', 'cli-admin@example.com', 'cli-pass-12345'])
    expect(result).toEqual({ code: 0, output: 'Admin created successfully: cli-admin@example.com\n' })
    const [user] = await t.ctx.db.select().from(users).where(eq(users.email, 'cli-admin@example.com'))
    expect(user?.isSuperuser).toBe(true)
  })

  it('C36 bad arguments print usage and exit 1', async () => {
    for (const argv of [[], ['create-user'], ['create-user', 'a@example.com'], ['frobnicate', 'a@example.com', 'pw'], ['create-user', 'a', 'b', 'c']]) {
      const result = await runCli(t.ctx.db, argv)
      expect(result.code).toBe(1)
      expect(result.output).toContain('create-user <email> <password>')
    }
    // The real entry point, with no database configured: the arguments are checked first.
    const run = spawnSync('npm', ['run', '--silent', 'cli', '--', 'create-user', 'only-one-argument'], {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
    })
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('create-admin <email> <password>')
  })
})
