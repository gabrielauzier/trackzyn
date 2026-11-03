// Run as a child process by import-crash.test.ts (bundled with esbuild): the real importer on a real
// PGlite database, killing itself with SIGKILL at the point named on the command line.
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { connectPglite } from '../../backend-node/src/db/client.ts'
import { applyMigrations } from '../../backend-node/src/db/migrate.ts'
import { NotANewInstallationError, checkDump, hasImport, restoreData } from '../../backend-node/src/local/data-transfer.ts'
import { importData, recoverImport, type ImportPoint } from '../src/main/export-import'
import type { RestoreResult } from '../src/main/local-backend'

const [mode, userData, point, zip] = process.argv.slice(2)
const migrations = process.env.HARNESS_MIGRATIONS as string
const filesDir = path.join(userData, 'files')

function listing(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name)
      if (statSync(full).isDirectory()) walk(full)
      else out[path.relative(dir, full)] = readFileSync(full, 'utf8')
    }
  }
  try {
    walk(dir)
  } catch {
    // no folder
  }
  return out
}

const die = () => process.kill(process.pid, 'SIGKILL')
const reason = (error: unknown): RestoreResult =>
  error instanceof NotANewInstallationError ? { ok: false, reason: 'has-users' } : { ok: false, reason: 'invalid' }

async function main() {
  mkdirSync(userData, { recursive: true })
  const handle = await connectPglite(path.join(userData, 'db'))
  const client = handle.pglite!
  await applyMigrations(handle.db, migrations)
  const backendHasImport = (id: string) => hasImport(client, id)

  if (mode === 'recover' || mode === 'import-after-recover') {
    await recoverImport({ userData, filesDir, hasImport: backendHasImport })
  }
  if (mode === 'import' || mode === 'import-after-recover') {
    const result = await importData({
      source: zip,
      filesDir,
      userData,
      check: async (dump) => {
        try {
          await checkDump(client, dump)
          return { ok: true }
        } catch (error) {
          return reason(error)
        }
      },
      restore: async (dump, id) => {
        try {
          await restoreData(client, dump, id, {
            // 'restoring' dies after the first INSERT has run inside the transaction; 'precommit' just before the commit.
            // Flushes to disk before the kill. It does NOT make a missing transaction visible here (PGlite does not persist an
            // autocommitted INSERT in this window either); atomicity is proved by the in-process rollback test and by 'precommit'.
            afterStatement: async (_index, statement) => {
              if (point === 'restoring' && statement.kind === 'insert') {
                await client.syncToFs()
                die()
              }
            },
            beforeCommit: async () => {
              if (point === 'precommit') {
                await client.syncToFs()
                die()
              }
            },
          })
          return { ok: true }
        } catch (error) {
          return reason(error)
        }
      },
      hasImport: backendHasImport,
      hooks: {
        at: (current: ImportPoint) => {
          if (current === point) die()
        },
      },
    })
    process.stdout.write(`IMPORT ${JSON.stringify(result)}\n`)
  }
  const users = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM users')
  process.stdout.write(`STATE ${JSON.stringify({ users: users.rows[0]?.n, files: listing(filesDir) })}\n`)
  await client.close()
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
