import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeZip } from '../src/main/zip'

const desktop = path.resolve(__dirname, '..')
let work = ''
let harness = ''

beforeAll(async () => {
  work = mkdtempSync(path.join(tmpdir(), 'trackzyn-crash-'))
  // Inside desktop/ so the external @electric-sql/pglite resolves from its node_modules.
  const cache = path.join(desktop, 'node_modules', '.cache', 'import-crash')
  mkdirSync(cache, { recursive: true })
  harness = path.join(cache, 'harness.cjs')
  await build({
    entryPoints: [path.join(__dirname, 'import-crash-harness.ts')],
    outfile: harness,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['@electric-sql/pglite', 'pg-native'],
    define: { 'import.meta.dirname': '__dirname', 'import.meta.url': '__importMetaUrl' },
    banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
    nodePaths: [path.join(desktop, 'node_modules')],
    logLevel: 'error',
  })
}, 60_000)
afterAll(() => rmSync(work, { recursive: true, force: true }))

const USER = `INSERT INTO "users" ("id", "email", "hashed_password", "is_active", "is_superuser", "is_verified", "is_2fa_enabled") VALUES ('11111111-1111-1111-1111-111111111111', 'a@b.c', 'x', 'true', 'false', 'true', 'false');\n`

function exportZip(): string {
  const file = path.join(work, 'export.zip')
  writeFileSync(
    file,
    writeZip([
      { name: 'manifest.json', data: Buffer.from(JSON.stringify({ formatVersion: 1, appVersion: '1', schemaRevision: 0 })) },
      { name: 'db.sql', data: Buffer.from(`TRUNCATE "users" CASCADE;\n${USER}`) },
      { name: 'files/new.txt', data: Buffer.from('imported') },
    ]),
  )
  return file
}

function child(mode: string, userData: string, point = '', zip = '') {
  const result = spawnSync(process.execPath, [harness, mode, userData, point, zip], {
    env: { ...process.env, HARNESS_MIGRATIONS: path.resolve(desktop, '../backend-node/drizzle') },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const state = /STATE (.*)/.exec(result.stdout)?.[1]
  return { signal: result.signal, status: result.status, stderr: result.stderr, state: state ? (JSON.parse(state) as { users: number; files: Record<string, string> }) : null, out: result.stdout }
}

const ORIGINAL = { 'old.txt': 'original', 'sub/o.txt': 'o' }
const IMPORTED = { 'new.txt': 'imported' }

function newInstallation(): string {
  const userData = mkdtempSync(path.join(work, 'ud-'))
  expect(child('recover', userData).status).toBe(0)
  for (const [name, text] of Object.entries(ORIGINAL)) {
    mkdirSync(path.dirname(path.join(userData, 'files', name)), { recursive: true })
    writeFileSync(path.join(userData, 'files', name), text)
  }
  return userData
}

const leftovers = (userData: string) =>
  ['files.import-old', 'files.import-new', 'import.journal.json'].filter((name) => existsSync(path.join(userData, name)))

describe('an import killed by SIGKILL', () => {
  // The points where a crash must leave the database and the files both before or both after.
  const POINTS: Array<[string, 'before' | 'after']> = [
    ['staged', 'before'],
    ['journaled', 'before'],
    ['mid-swap', 'before'],
    ['swapped', 'before'],
    ['restoring', 'before'],
    ['precommit', 'before'],
    ['committed', 'after'],
    ['cleaned', 'after'],
  ]

  for (const [point, expected] of POINTS) {
    it(`at ${point}: after the recovery both are ${expected} the import`, () => {
      const userData = newInstallation()
      const killed = child('import', userData, point, exportZip())
      expect(killed.signal, killed.stderr).toBe('SIGKILL')

      const recovered = child('recover', userData)
      expect(recovered.status, recovered.stderr).toBe(0)
      expect(recovered.state).toEqual(expected === 'before' ? { users: 0, files: ORIGINAL } : { users: 1, files: IMPORTED })
      expect(leftovers(userData)).toEqual([])

      // And the recovered installation behaves: a second recovery changes nothing.
      expect(child('recover', userData).state).toEqual(recovered.state)
    })
  }

  it('a later import that is refused removes nothing and the recovery still restores the original', () => {
    const userData = newInstallation()
    expect(child('import', userData, 'restoring', exportZip()).signal).toBe('SIGKILL')
    // Without a recovery in between, the journal blocks a new import instead of overwriting the original copy.
    const blocked = child('import', userData, '', exportZip())
    expect(blocked.status).not.toBe(0)
    expect(existsSync(path.join(userData, 'files.import-old'))).toBe(true)
    const recovered = child('recover', userData)
    expect(recovered.state).toEqual({ users: 0, files: ORIGINAL })
    expect(leftovers(userData)).toEqual([])
  })

  it('an import refused because the database has users never touches the folders', () => {
    const userData = newInstallation()
    expect(child('import-after-recover', userData, '', exportZip()).state?.users).toBe(1)
    // Now the database has users: the same file is refused, and the files are what the first import left.
    const refused = child('import-after-recover', userData, '', exportZip())
    expect(refused.out).toContain('"reason":"not-new"')
    expect(refused.state).toEqual({ users: 1, files: IMPORTED })
    expect(leftovers(userData)).toEqual([])
  })
})
