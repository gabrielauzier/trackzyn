import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Backups kept after a successful migration. */
export const KEPT_BACKUPS = 3

interface Options<T> {
  userData: string
  /** Starts the backend on `userData/db`; resolves with how many migrations it applied. */
  run: () => Promise<T & { migrationsApplied: number }>
  now?: () => number
}

// ISO 8601 without ':' and '.', which Windows does not allow in a folder name.
const stamp = (time: number) => new Date(time).toISOString().replace(/[:.]/g, '-')

async function prune(backupsDir: string): Promise<void> {
  const names = (await readdir(backupsDir)).filter((name) => /^db-/.test(name)).sort()
  for (const old of names.slice(0, Math.max(0, names.length - KEPT_BACKUPS))) {
    await rm(path.join(backupsDir, old), { recursive: true, force: true })
  }
}

/**
 * Copies the database before anything opens it (opening already rewrites files), runs the backend,
 * and keeps the copy as `backups/db-<ISO>` only if migrations ran. If the backend fails the copy is
 * put back over `db`, so the failed start leaves the database exactly as it was. The copy
 * (`backups/.pending`) is only promoted or deleted after the backend started; if the process dies
 * first, the next start finds it and begins from it.
 */
export async function startWithBackup<T>({ userData, run, now = Date.now }: Options<T>): Promise<T & { migrationsApplied: number }> {
  const dbDir = path.join(userData, 'db')
  const backupsDir = path.join(userData, 'backups')
  const pending = path.join(backupsDir, '.pending')
  const partial = `${pending}.tmp`
  // A `.pending` left by an earlier start is the good copy of a migration that never finished.
  const leftover = existsSync(pending)
  const hadDatabase = leftover || existsSync(dbDir)

  if (hadDatabase) {
    await mkdir(backupsDir, { recursive: true })
    // A copy that was interrupted is not a backup; `db` was not touched while it was made.
    await rm(partial, { recursive: true, force: true })
    if (leftover) {
      // The previous start died (or failed) with `db` half migrated: begin again from the good copy.
      await rm(dbDir, { recursive: true, force: true })
      await cp(pending, dbDir, { recursive: true })
    } else {
      try {
        await cp(dbDir, partial, { recursive: true })
        await rename(partial, pending)
      } catch (error) {
        // A copy that failed is not a backup, and must not wait for the next start to disappear.
        await rm(partial, { recursive: true, force: true })
        throw error
      }
    }
  }

  let result: T & { migrationsApplied: number }
  try {
    result = await run()
  } catch (error) {
    await rm(dbDir, { recursive: true, force: true })
    if (hadDatabase) await rename(pending, dbDir)
    throw error
  }

  if (hadDatabase) {
    if (result.migrationsApplied > 0) {
      await rename(pending, path.join(backupsDir, `db-${stamp(now())}`))
      await prune(backupsDir)
    } else {
      await rm(pending, { recursive: true, force: true })
    }
  }
  return result
}
