import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startWithBackup } from './backup'
import { checksumDir } from './test-support'

let userData = ''
const dbDir = () => path.join(userData, 'db')
const backups = () => (existsSync(path.join(userData, 'backups')) ? readdirSync(path.join(userData, 'backups')).sort() : [])

function seedDatabase() {
  mkdirSync(path.join(dbDir(), 'base'), { recursive: true })
  writeFileSync(path.join(dbDir(), 'PG_VERSION'), '17')
  writeFileSync(path.join(dbDir(), 'base', 'rel-1'), 'rows rows rows')
}

const ISO_NAME = /^db-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/

beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), 'launchkit-backup-'))
})
afterEach(() => rmSync(userData, { recursive: true, force: true }))

describe('migration backups', () => {
  it('copies the database before a pending migration runs', async () => {
    seedDatabase()
    const before = checksumDir(dbDir())
    let seenAtRun: string | null = null
    const result = await startWithBackup({
      userData,
      now: () => Date.UTC(2026, 9, 16, 12, 34, 56, 789),
      run: async () => {
        // The backend is about to open (and change) the database: the copy must already exist.
        seenAtRun = checksumDir(path.join(userData, 'backups', '.pending'))
        writeFileSync(path.join(dbDir(), 'base', 'rel-1'), 'migrated')
        return { migrationsApplied: 1, port: 1234 }
      },
    })
    expect(result.port).toBe(1234)
    expect(seenAtRun).toBe(before)
    expect(backups()).toEqual(['db-2026-10-16T12-34-56-789Z'])
    expect(checksumDir(path.join(userData, 'backups', 'db-2026-10-16T12-34-56-789Z'))).toBe(before)
    expect(checksumDir(dbDir())).not.toBe(before)
  })

  it('keeps only the three most recent backups', async () => {
    seedDatabase()
    const older = ['2026-01-01T00-00-00-000Z', '2026-02-01T00-00-00-000Z', '2026-03-01T00-00-00-000Z', '2026-04-01T00-00-00-000Z']
    for (const stamp of older) mkdirSync(path.join(userData, 'backups', `db-${stamp}`), { recursive: true })
    await startWithBackup({ userData, now: () => Date.UTC(2026, 9, 16), run: async () => ({ migrationsApplied: 2 }) })
    const kept = backups()
    expect(kept).toHaveLength(3)
    expect(kept).toEqual(['db-2026-03-01T00-00-00-000Z', 'db-2026-04-01T00-00-00-000Z', 'db-2026-10-16T00-00-00-000Z'])
    for (const name of kept) expect(name).toMatch(ISO_NAME)
  })

  it('creates no backup when no migration is pending', async () => {
    seedDatabase()
    await startWithBackup({ userData, run: async () => ({ migrationsApplied: 0 }) })
    expect(backups()).toEqual([])
  })

  it('creates no backup for a database that does not exist yet', async () => {
    await startWithBackup({
      userData,
      run: async () => {
        mkdirSync(dbDir(), { recursive: true })
        return { migrationsApplied: 1 }
      },
    })
    expect(backups()).toEqual([])
  })

  it('restores the original database when the migration fails', async () => {
    seedDatabase()
    const before = checksumDir(dbDir())
    await expect(
      startWithBackup({
        userData,
        run: async () => {
          writeFileSync(path.join(dbDir(), 'base', 'rel-1'), 'half migrated')
          writeFileSync(path.join(dbDir(), 'base', 'rel-2'), 'new file')
          throw new Error('migration 0001 failed')
        },
      }),
    ).rejects.toThrow('migration 0001 failed')
    expect(checksumDir(dbDir())).toBe(before)
    expect(backups()).toEqual([])
  })

  it('removes the half-created database of a first start that fails', async () => {
    await expect(
      startWithBackup({
        userData,
        run: async () => {
          mkdirSync(dbDir(), { recursive: true })
          writeFileSync(path.join(dbDir(), 'junk'), 'x')
          throw new Error('boom')
        },
      }),
    ).rejects.toThrow('boom')
    expect(existsSync(dbDir())).toBe(false)
  })

  it('restores the database from the pending copy when the app died in the middle of a migration', async () => {
    seedDatabase()
    const original = checksumDir(dbDir())
    // First start: the migration half-changes the database and the process dies (run never settles).
    void startWithBackup({
      userData,
      run: () => {
        writeFileSync(path.join(dbDir(), 'base', 'rel-1'), 'half migrated')
        writeFileSync(path.join(dbDir(), 'base', 'rel-2'), 'new table')
        return new Promise<{ migrationsApplied: number }>(() => undefined)
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(checksumDir(dbDir())).not.toBe(original)

    // Second start: sees what the first one left and must begin from the good copy.
    let seenAtRun = ''
    await startWithBackup({
      userData,
      now: () => Date.UTC(2026, 9, 16, 12, 0, 0, 0),
      run: async () => {
        seenAtRun = checksumDir(dbDir())
        return { migrationsApplied: 1 }
      },
    })
    expect(seenAtRun).toBe(original)
    // The good copy was kept as this migration's backup, not deleted.
    expect(backups().filter((name) => ISO_NAME.test(name))).toHaveLength(1)
    expect(checksumDir(path.join(userData, 'backups', backups().find((name) => ISO_NAME.test(name))!))).toBe(original)
    expect(backups()).not.toContain('.pending')
  })

  it('puts the pending copy back when the restarted migration fails too', async () => {
    seedDatabase()
    const original = checksumDir(dbDir())
    void startWithBackup({
      userData,
      run: () => {
        writeFileSync(path.join(dbDir(), 'base', 'rel-1'), 'half migrated')
        return new Promise<{ migrationsApplied: number }>(() => undefined)
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await expect(
      startWithBackup({
        userData,
        run: async () => {
          writeFileSync(path.join(dbDir(), 'base', 'rel-1'), 'broken again')
          throw new Error('migration failed')
        },
      }),
    ).rejects.toThrow('migration failed')
    expect(checksumDir(dbDir())).toBe(original)
  })

  it('ignores a pending copy that was only half written', async () => {
    seedDatabase()
    const original = checksumDir(dbDir())
    mkdirSync(path.join(userData, 'backups', '.pending.tmp', 'base'), { recursive: true })
    writeFileSync(path.join(userData, 'backups', '.pending.tmp', 'PG_VERSION'), '17')
    let seenAtRun = ''
    await startWithBackup({
      userData,
      run: async () => {
        seenAtRun = checksumDir(dbDir())
        return { migrationsApplied: 0 }
      },
    })
    expect(seenAtRun).toBe(original)
    expect(backups()).toEqual([])
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('removes the half-made copy at once when the copy fails and leaves db alone', async () => {
    seedDatabase()
    const unreadable = path.join(dbDir(), 'base', 'rel-2')
    writeFileSync(unreadable, 'secret')
    chmodSync(unreadable, 0o000)
    try {
      const before = checksumDirNoRead()
      await expect(startWithBackup({ userData, run: async () => ({ migrationsApplied: 0 }) })).rejects.toThrow()
      expect(existsSync(path.join(userData, 'backups', '.pending.tmp'))).toBe(false)
      expect(existsSync(path.join(userData, 'backups', '.pending'))).toBe(false)
      expect(readdirSync(path.join(dbDir(), 'base')).sort()).toEqual(before)
    } finally {
      chmodSync(unreadable, 0o600)
    }
  })

  it('removes an old .pending.tmp at the start, so nothing of it ends up in the backup', async () => {
    seedDatabase()
    const original = checksumDir(dbDir())
    mkdirSync(path.join(userData, 'backups', '.pending.tmp'), { recursive: true })
    writeFileSync(path.join(userData, 'backups', '.pending.tmp', 'junk-from-an-old-copy'), 'x')
    await startWithBackup({ userData, now: () => Date.UTC(2026, 9, 16, 0, 0, 0, 0), run: async () => ({ migrationsApplied: 1 }) })
    const kept = backups().filter((name) => ISO_NAME.test(name))
    expect(kept).toHaveLength(1)
    expect(checksumDir(path.join(userData, 'backups', kept[0]))).toBe(original)
    expect(backups()).not.toContain('.pending.tmp')
  })
})

function checksumDirNoRead(): string[] {
  return readdirSync(path.join(dbDir(), 'base')).sort()
}
