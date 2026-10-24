import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'
import { InvalidDumpError, NotANewInstallationError, dumpData, hasImport, restoreData } from '../../src/local/data-transfer.ts'

const open: PGlite[] = []

async function fresh(): Promise<PGlite> {
  const client = new PGlite()
  open.push(client)
  await applyMigrations(drizzle(client) as unknown as Database)
  return client
}

async function counts(client: PGlite) {
  const result = await client.query<{ table: string; n: number }>(
    `SELECT 'users' AS "table", count(*)::int AS n FROM users UNION ALL SELECT 'workspaces', count(*)::int FROM workspaces UNION ALL SELECT 'files', count(*)::int FROM files`,
  )
  return Object.fromEntries(result.rows.map((row) => [row.table, row.n]))
}

async function seed(client: PGlite) {
  await client.exec(`
    INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled, preferences) VALUES ('11111111-1111-1111-1111-111111111111', 'o''brien@example.com', 'x', true, false, true, false, '{"n":"O''Brien \\\\ q"}');
    INSERT INTO workspaces (id, name, created_by_user_id, is_archived, created_at) VALUES ('22222222-2222-2222-2222-222222222222', 'Notes', '11111111-1111-1111-1111-111111111111', false, now());
  `)
}

afterEach(async () => {
  while (open.length) await open.pop()!.close()
})

describe('data transfer', () => {
  it('dumps and restores users, workspaces and quoting into a new database', async () => {
    const source = await fresh()
    await seed(source)
    const dump = await dumpData(source)
    expect(dump.schemaRevision).toBeGreaterThan(0)

    const target = await fresh()
    await restoreData(target, dump)
    expect(await counts(target)).toEqual({ users: 1, workspaces: 1, files: 0 })
    const prefs = await target.query<{ email: string; preferences: { n: string } }>(`SELECT email, preferences FROM users`)
    expect(prefs.rows[0]).toEqual({ email: "o'brien@example.com", preferences: { n: "O'Brien \\ q" } })
  })

  it('restores lists, tasks and subtasks with the same counts and ids', async () => {
    const source = await fresh()
    await seed(source)
    const ws = '22222222-2222-2222-2222-222222222222'
    await source.exec(`
      INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('a0000000-0000-0000-0000-000000000001', '${ws}', 'Work', 1, 0, '11111111-1111-1111-1111-111111111111', now());
      INSERT INTO lists (id, workspace_id, name, color, position, is_archived, created_at) VALUES ('a0000000-0000-0000-0000-000000000002', '${ws}', 'Home', 8, 1, true, now());
      INSERT INTO tasks (id, list_id, title, notes, estimate_minutes, "column", position, created_at) VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Write', 'it''s; notes', 87, 'today', 0, now());
      INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Read', 'backlog', 0, now());
      INSERT INTO tasks (id, list_id, title, "column", position, completed_at, created_at) VALUES ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Shop', 'done', 0, '2026-10-23T12:00:00Z', now());
      INSERT INTO subtasks (id, task_id, title, done, position) VALUES ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Outline', true, 0);
      INSERT INTO subtasks (id, task_id, title, position) VALUES ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Draft', 1);
    `)
    const snapshot = async (client: PGlite) => ({
      lists: (await client.query('SELECT * FROM lists ORDER BY id')).rows,
      tasks: (await client.query('SELECT * FROM tasks ORDER BY id')).rows,
      subtasks: (await client.query('SELECT * FROM subtasks ORDER BY id')).rows,
    })
    const before = await snapshot(source)

    const target = await fresh()
    await restoreData(target, await dumpData(source))
    const after = await snapshot(target)
    expect([after.lists.length, after.tasks.length, after.subtasks.length]).toEqual([2, 3, 2])
    expect(after.tasks.map((row) => (row as { id: string }).id)).toEqual([
      'b0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000003',
    ])
    expect(after).toEqual(before)
  })

  it('refuses a database with users and leaves it alone', async () => {
    const source = await fresh()
    await seed(source)
    const dump = await dumpData(source)
    await expect(restoreData(source, dump)).rejects.toBeInstanceOf(NotANewInstallationError)
    expect(await counts(source)).toEqual({ users: 1, workspaces: 1, files: 0 })
  })

  it('rolls back a dump that fails halfway and refuses a newer schema', async () => {
    const target = await fresh()
    await expect(restoreData(target, { schemaRevision: 1, sql: `INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('11111111-1111-1111-1111-111111111111','a@b.c','x',true,false,true,false);\nINSERT INTO nowhere VALUES (1);` })).rejects.toBeInstanceOf(InvalidDumpError)
    expect(await counts(target)).toEqual({ users: 0, workspaces: 0, files: 0 })
    await expect(restoreData(target, { schemaRevision: 999, sql: '' })).rejects.toBeInstanceOf(InvalidDumpError)
    void sql
  })

  const USER = `INSERT INTO "users" ("id", "email", "hashed_password", "is_active", "is_superuser", "is_verified", "is_2fa_enabled") VALUES ('11111111-1111-1111-1111-111111111111', 'a@b.c', 'x', 'true', 'false', 'true', 'false');`

  it('refuses a dump with transaction control or statements outside the dump grammar, leaving the database untouched', async () => {
    const hostile: Array<[string, string]> = [
      ['commit in the middle', `${USER}\nCOMMIT;\nDROP TABLE workspaces;\nINSERT INTO nowhere VALUES (1);`],
      ['commit then failure', `${USER}\nCOMMIT;\nINSERT INTO "nowhere" ("a") VALUES ('1');`],
      ['rollback and begin', `BEGIN;\n${USER}\nROLLBACK;`],
      ['ddl', `DROP TABLE "workspaces";`],
      ['alter', `ALTER TABLE "users" ADD COLUMN "x" text;`],
      ['create', `CREATE TABLE "evil" ("a" int);`],
      ['update', `UPDATE "users" SET "email" = 'x';`],
      ['delete', `DELETE FROM "users";`],
      ['select', `SELECT pg_sleep(0);`],
      ['function call in values', `INSERT INTO "users" ("id") VALUES (pg_sleep(0));`],
      ['two statements in one line', `${USER} DROP TABLE "users";`],
      ['insert into another schema', `INSERT INTO "drizzle"."__drizzle_migrations" ("id") VALUES ('1');`],
      ['truncate another schema', `TRUNCATE "drizzle"."__drizzle_migrations" CASCADE;`],
      ['comment hiding a statement', `-- ok\n${USER}\n/* x */ DROP TABLE "users";`],
      ['unterminated literal', `INSERT INTO "users" ("id") VALUES ('1);`],
      ['copy', `COPY "users" FROM STDIN;`],
    ]
    const target = await fresh()
    const before = await counts(target)
    const schemaBefore = (await target.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0]!.n
    for (const [label, text] of hostile) {
      await expect(restoreData(target, { schemaRevision: 1, sql: text }), label).rejects.toBeInstanceOf(InvalidDumpError)
      expect(await counts(target), label).toEqual(before)
    }
    const schemaAfter = (await target.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0]!.n
    expect(schemaAfter).toBe(schemaBefore)
  })

  it('still restores literals that contain semicolons, newlines and keywords', async () => {
    const source = await fresh()
    await source.exec(`INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled, preferences) VALUES ('11111111-1111-1111-1111-111111111111', 'a@b.c', 'x', true, false, true, false, '{"n":"COMMIT; DROP TABLE x;\\nline -- two"}')`)
    const target = await fresh()
    await restoreData(target, await dumpData(source))
    const row = await target.query<{ preferences: { n: string } }>(`SELECT preferences FROM users`)
    expect(row.rows[0]?.preferences.n).toBe('COMMIT; DROP TABLE x;\nline -- two')
  })

  async function fingerprint(client: PGlite) {
    const one = async (query: string) => JSON.stringify((await client.query(query)).rows)
    return {
      counts: await counts(client),
      pgClass: await one(`SELECT relname FROM pg_class ORDER BY relname`),
      pgProc: await one(`SELECT count(*)::int AS n FROM pg_proc`),
      pgAuthid: await one(`SELECT rolname FROM pg_authid ORDER BY rolname`),
      pgDbRoleSetting: await one(`SELECT count(*)::int AS n FROM pg_db_role_setting`),
      pgNamespace: await one(`SELECT nspname FROM pg_namespace ORDER BY nspname`),
      searchPath: await one(`SHOW search_path`),
      tables: await one(`SELECT table_schema, table_name FROM information_schema.tables ORDER BY 1, 2`),
    }
  }

  const U = `INSERT INTO "users" ("id", "email", "hashed_password", "is_active", "is_superuser", "is_verified", "is_2fa_enabled") VALUES ('11111111-1111-1111-1111-111111111111', 'a@b.c', 'x', 'true', 'false', 'true', 'false');\n`

  it('survives the round 2 attacks: nothing of the file reaches the SQL engine, the database fingerprint is unchanged', async () => {
    const attacks: Array<[string, string]> = [
      ['CR ends a comment: commit and drop', `-- x\rCOMMIT;\rDROP TABLE "workspaces";\n`],
      ['CR ends a comment: set search_path', `-- x\rSET search_path = evil;\n`],
      ['CR ends a comment after a valid row', `${U}-- x\rCOMMIT;\rDROP TABLE "workspaces";\n`],
      ['CRLF comment', `-- x\r\nCOMMIT;\n`],
      ['block comment', `/* x */ ${U}`],
      ['comment header', `-- trackzyn data dump\n${U}`],
      ['tab', `TRUNCATE\t"users" CASCADE;\n`],
      ['CRLF after truncate', `TRUNCATE "users" CASCADE;\r\n`],
      ['CR after truncate', `TRUNCATE "users" CASCADE;\r`],
      ['CR inside truncate', `TRUNCATE "users"\r CASCADE;\n`],
      ['CRLF after insert', U.replace(');\n', ');\r\n')],
      ['CR inside insert', U.replace(') VALUES (', ')\rVALUES (')],
      ['control character', `TRUNCATE "users"\u0001 CASCADE;\n`],
      ['truncate pg_class', `TRUNCATE "pg_class" CASCADE;\n`],
      ['truncate pg_catalog.pg_class', `TRUNCATE "pg_catalog"."pg_class" CASCADE;\n`],
      ['truncate information_schema', `TRUNCATE "information_schema"."tables" CASCADE;\n`],
      ['insert pg_authid', `INSERT INTO "pg_authid" ("rolname") VALUES ('evil');\n`],
      ['insert pg_db_role_setting', `INSERT INTO "pg_db_role_setting" ("setdatabase") VALUES ('0');\n`],
      ['insert pg_catalog.pg_authid', `INSERT INTO "pg_catalog"."pg_authid" ("rolname") VALUES ('evil');\n`],
      ['insert information_schema', `INSERT INTO "information_schema"."tables" ("table_name") VALUES ('x');\n`],
      ['drizzle migrations', `TRUNCATE "__drizzle_migrations" CASCADE;\n`],
      ['unknown column', `INSERT INTO "users" ("nope") VALUES ('x');\n`],
      ['value count mismatch', `INSERT INTO "users" ("id", "email") VALUES ('x');\n`],
      ['on conflict', `${U.replace(');\n', ') ON CONFLICT DO NOTHING;\n')}`],
      ['returning', `${U.replace(');\n', ') RETURNING "id";\n')}`],
      ['truncate without cascade', `TRUNCATE "users";\n`],
      ['truncate restart identity', `TRUNCATE "users" RESTART IDENTITY CASCADE;\n`],
      ['lowercase keywords', `truncate "users" cascade;\n`],
      ['double space', `TRUNCATE  "users" CASCADE;\n`],
      ['missing final newline is fine but not a second statement on one line', `TRUNCATE "users" CASCADE; TRUNCATE "users" CASCADE;\n`],
      ['unterminated literal', `INSERT INTO "users" ("id") VALUES ('1);\n`],
      ['dollar quoting outside a literal', `INSERT INTO "users" ("id") VALUES ($$x$$);\n`],
      ['number outside a literal', `INSERT INTO "users" ("id") VALUES (1);\n`],
    ]
    const target = await fresh()
    await seed(target)
    // The users exist, so a hostile text must be refused as invalid (its own text is judged first).
    const empty = await fresh()
    for (const database of [empty, target]) {
      const before = await fingerprint(database)
      for (const [label, text] of attacks) {
        await expect(restoreData(database, { schemaRevision: 1, sql: text }), label).rejects.toBeInstanceOf(InvalidDumpError)
        expect(await fingerprint(database), label).toEqual(before)
      }
    }
  })

  it('judges the text of the dump before it looks at the users', async () => {
    const target = await fresh()
    await seed(target)
    await expect(restoreData(target, { schemaRevision: 1, sql: `COMMIT;\n` })).rejects.toBeInstanceOf(InvalidDumpError)
    await expect(restoreData(target, { schemaRevision: 1, sql: U })).rejects.toBeInstanceOf(NotANewInstallationError)
  })

  it('restores literals with semicolons, quotes, newlines, comments, dollar quotes, unicode, json and NULL', async () => {
    const names = [
      "it's; a 'quote'",
      'line1\nline2\r\nline3\rline4',
      '-- not a comment /* nor this */ COMMIT; DROP TABLE x;',
      '$$ dollar $tag$ body $tag$ $$',
      'unicode: ñ 日本語 😀 \u0000'.replace('\u0000', ''),
      'NULL',
      'back\\slash \\n',
      '',
    ]
    const source = await fresh()
    await source.exec(
      `INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled, preferences) VALUES ('11111111-1111-1111-1111-111111111111', 'a@b.c', 'x', true, false, true, false, '{"k":["a;b","--","\\n"],"n":null}')`,
    )
    for (const [index, name] of names.entries()) {
      await source.query(`INSERT INTO workspaces (id, name, created_by_user_id, is_archived, created_at, icon) VALUES ($1, $2, '11111111-1111-1111-1111-111111111111', false, now(), $3)`, [
        `00000000-0000-0000-0000-00000000000${index}`,
        name,
        index === 0 ? null : 'NULL',
      ])
    }
    const target = await fresh()
    await restoreData(target, await dumpData(source))
    const copy = await target.query<{ name: string; icon: string | null }>(`SELECT name, icon FROM workspaces ORDER BY id`)
    expect(copy.rows.map((row) => row.name)).toEqual(names)
    expect(copy.rows.map((row) => row.icon)).toEqual([null, ...Array(names.length - 1).fill('NULL')])
    const prefs = await target.query<{ preferences: unknown }>(`SELECT preferences FROM users`)
    expect(prefs.rows[0]?.preferences).toEqual({ k: ['a;b', '--', '\n'], n: null })
  })

  it('writes a dump with no comment line', async () => {
    const dump = await dumpData(await fresh())
    expect(dump.sql).not.toMatch(/--|\/\*|\r/)
  })

  it('rolls back a dump that the database refuses halfway, whatever the reason', async () => {
    const USER2 = (id: string, email = "'b@c.d'") =>
      `INSERT INTO "users" ("id", "email", "hashed_password", "is_active", "is_superuser", "is_verified", "is_2fa_enabled") VALUES ('${id}', ${email}, 'x', 'true', 'false', 'true', 'false');\n`
    const id1 = '11111111-1111-1111-1111-111111111111'
    const id2 = '22222222-2222-2222-2222-222222222222'
    const WS = (user: string) => `INSERT INTO "workspaces" ("id", "name", "created_by_user_id", "is_archived", "created_at") VALUES ('33333333-3333-3333-3333-333333333333', 'n', '${user}', 'false', '2026-01-01');\n`
    const failing: Array<[string, string]> = [
      ['foreign key', `${USER2(id1)}${WS('99999999-9999-9999-9999-999999999999')}`],
      ['duplicate primary key', `${USER2(id1)}${USER2(id1, "'other@c.d'")}`],
      ['duplicate unique email', `${USER2(id1)}${USER2(id2)}`],
      ['not null', `${USER2(id1)}${USER2(id2, 'NULL')}`],
      ['invalid uuid', `${USER2(id1)}${USER2('not-a-uuid')}`],
      ['truncate then a failing insert', `TRUNCATE "users" CASCADE;\n${USER2(id1)}${USER2('not-a-uuid')}`],
    ]
    const target = await fresh()
    const before = await fingerprint(target)
    for (const [label, text] of failing) {
      await expect(restoreData(target, { schemaRevision: 1, sql: text }), label).rejects.toBeInstanceOf(InvalidDumpError)
      expect(await fingerprint(target), label).toEqual(before)
    }
    // The marker of a failed restore is not left behind either.
    expect(await hasImport(target, 'unmarked')).toBe(false)
  })

  it('answers "no" only when the marker table does not exist, and fails closed on any other error', async () => {
    const client = await fresh()
    expect(await hasImport(client, 'x')).toBe(false)
    await restoreData(client, { schemaRevision: 1, sql: '' }, 'x')
    expect(await hasImport(client, 'x')).toBe(true)
    expect(await hasImport(client, 'y')).toBe(false)
    await client.close()
    open.splice(open.indexOf(client), 1)
    await expect(hasImport(client, 'x')).rejects.toThrow()
  })

  it('treats only 42P01 and 3F000 as "no marker yet" and propagates every other error code', async () => {
    const failing = (code: string) => ({ query: async () => { throw Object.assign(new Error(`error ${code}`), { code }) } }) as never
    for (const code of ['42P01', '3F000']) expect(await hasImport(failing(code), 'x'), code).toBe(false)
    for (const code of ['42501', '42703', '42601', '42883', '08006', '57P01', 'XX000']) {
      await expect(hasImport(failing(code), 'x'), code).rejects.toThrow(`error ${code}`)
    }
    await expect(hasImport({ query: async () => { throw new Error('no code at all') } } as never, 'x')).rejects.toThrow('no code at all')
  })
})
