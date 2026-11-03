import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DataDump, RestoreResult } from './local-backend'
import { readZip, writeZip, ZipError, type ZipEntry } from './zip'

export const FORMAT_VERSION = 1

export interface Manifest {
  formatVersion: number
  appVersion: string
  schemaRevision: number
}

function listFiles(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else found.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  try {
    walk(root)
  } catch {
    // no uploads yet
  }
  return found
}

/** Writes `manifest.json`, `db.sql` and `files/` into a zip at `target` (via a temporary name, so a failure leaves nothing half written). */
export async function exportData(options: { dump: () => Promise<DataDump>; filesDir: string; appVersion: string; target: string }): Promise<void> {
  const dump = await options.dump()
  const manifest: Manifest = { formatVersion: FORMAT_VERSION, appVersion: options.appVersion, schemaRevision: dump.schemaRevision }
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: 'db.sql', data: Buffer.from(dump.sql) },
    ...listFiles(options.filesDir).map((relative) => ({ name: `files/${relative}`, data: readFileSync(path.join(options.filesDir, relative)) })),
  ]
  const temporary = `${options.target}.partial`
  writeFileSync(temporary, writeZip(entries))
  renameSync(temporary, options.target)
}

export type ImportResult = { ok: true; warning?: 'cleanup' } | { ok: false; reason: 'invalid' | 'not-new' }

/** Reads and checks the archive without touching anything; null when it is not a valid export. */
function parseExport(source: string): { manifest: Manifest; sql: string; files: ZipEntry[] } | null {
  let entries: ZipEntry[]
  try {
    entries = readZip(readFileSync(source))
  } catch (error) {
    if (error instanceof ZipError || error instanceof RangeError) return null
    throw error
  }
  const manifestEntry = entries.find((entry) => entry.name === 'manifest.json')
  const dbEntry = entries.find((entry) => entry.name === 'db.sql')
  if (!manifestEntry || !dbEntry) return null
  let manifest: Manifest
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf8')) as Manifest
  } catch {
    return null
  }
  if (manifest.formatVersion !== FORMAT_VERSION || !Number.isInteger(manifest.schemaRevision)) return null
  return { manifest, sql: dbEntry.data.toString('utf8'), files: entries.filter((entry) => entry.name.startsWith('files/') && !entry.name.endsWith('/')) }
}

/** The import's journal cannot be read: the recovery cannot tell which side of the import the data is on. */
export class ImportJournalError extends Error {
  constructor(readonly file: string) {
    super(`the import journal ${file} cannot be read`)
    this.name = 'ImportJournalError'
  }
}

/** The import failed and the folders could not be put back: the app must restart so the recovery runs before any use. */
export class ImportUnsettledError extends Error {
  constructor(cause: unknown) {
    super(`the import could not be undone: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ImportUnsettledError'
  }
}

export interface ImportHooks {
  /** Test seam: called at each point where a crash must leave a consistent state. */
  at?: (point: ImportPoint) => void | Promise<void>
}

export type ImportPoint = 'staged' | 'journaled' | 'mid-swap' | 'swapped' | 'restoring' | 'committed' | 'cleaned'

interface Journal {
  id: string
  hadFiles: boolean
}

const names = (filesDir: string) => ({ staging: `${filesDir}.import-new`, previous: `${filesDir}.import-old` })

function readJournal(file: string): Journal | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Journal>
    return typeof parsed.id === 'string' && typeof parsed.hadFiles === 'boolean' ? { id: parsed.id, hadFiles: parsed.hadFiles } : null
  } catch {
    return null
  }
}

/**
 * Brings `files` to the state of the database: with the import committed the new files stay and the
 * old ones go; without it the old files come back and the new ones go. Only then is the journal removed.
 * Every layout a crash can leave is covered (before the swap, in the middle of it, after it).
 */
function settle(filesDir: string, journalFile: string, journal: Journal, committed: boolean): void {
  const { staging, previous } = names(filesDir)
  if (committed) {
    rmSync(previous, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
  } else {
    if (existsSync(previous)) {
      rmSync(filesDir, { recursive: true, force: true })
      renameSync(previous, filesDir)
    } else if (!journal.hadFiles && !existsSync(staging)) {
      // The swap happened and there was nothing before it.
      rmSync(filesDir, { recursive: true, force: true })
    }
    rmSync(staging, { recursive: true, force: true })
  }
  rmSync(journalFile, { force: true })
}

/**
 * Run when the local backend is up: finishes or undoes an import that a crash interrupted, so `files`
 * and the database are both as before it or both as after it. Without a journal a leftover
 * `files.import-new` is preparation garbage (it was never live); a leftover `files.import-old` is kept.
 */
export async function recoverImport(options: { userData: string; filesDir: string; hasImport: (id: string) => Promise<boolean> }): Promise<void> {
  const journalFile = path.join(options.userData, JOURNAL)
  // A kill between writing and renaming the journal leaves this behind; it was never the journal.
  rmSync(`${journalFile}.tmp`, { force: true })
  if (!existsSync(journalFile)) {
    rmSync(names(options.filesDir).staging, { recursive: true, force: true })
    return
  }
  const journal = readJournal(journalFile)
  if (!journal) throw new ImportJournalError(journalFile)
  settle(options.filesDir, journalFile, journal, await options.hasImport(journal.id))
}

const JOURNAL = 'import.journal.json'

/**
 * Imports an export into a new installation, all or nothing even if the process dies. Every refusal
 * (the zip, its names and sizes, the dump's grammar, the schema, a database with users) comes first
 * and writes nothing. Then `files/` is staged beside the real folder, a journal is written, the
 * folders are swapped and the backend restores the database in one transaction that also records
 * the journal's id. A failure puts the old files back; a crash is settled by `recoverImport`.
 */
export async function importData(options: {
  source: string
  filesDir: string
  userData: string
  check: (dump: DataDump) => Promise<RestoreResult>
  restore: (dump: DataDump, importId: string) => Promise<RestoreResult>
  hasImport: (id: string) => Promise<boolean>
  hooks?: ImportHooks
}): Promise<ImportResult> {
  const at = async (point: ImportPoint) => options.hooks?.at?.(point)
  const parsed = parseExport(options.source)
  if (!parsed) return { ok: false, reason: 'invalid' }
  const dump = { sql: parsed.sql, schemaRevision: parsed.manifest.schemaRevision }
  const checked = await options.check(dump)
  if (!checked.ok) return { ok: false, reason: checked.reason === 'has-users' ? 'not-new' : 'invalid' }

  const { staging, previous } = names(options.filesDir)
  const journalFile = path.join(options.userData, JOURNAL)
  // A journal still here belongs to an import that never settled: recovery runs at start, never here.
  if (existsSync(journalFile)) throw new Error('an earlier import has not been settled')
  // Never delete an old folder nobody settled: keep it under another name.
  if (existsSync(previous)) renameSync(previous, `${previous}.${Date.now()}`)
  rmSync(staging, { recursive: true, force: true })
  try {
    mkdirSync(staging, { recursive: true })
    for (const entry of parsed.files) {
      const target = path.join(staging, ...entry.name.slice('files/'.length).split('/'))
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, entry.data)
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
  await at('staged')

  const journal: Journal = { id: randomUUID(), hadFiles: existsSync(options.filesDir) }
  // From the journal on, any failure puts the folders back at once; if even that fails, the app restarts
  // (the recovery runs before anything can write to a half-swapped state).
  const undo = (cause: unknown, committed: boolean): never => {
    try {
      settle(options.filesDir, journalFile, journal, committed)
    } catch {
      throw new ImportUnsettledError(cause)
    }
    throw cause
  }
  try {
    mkdirSync(options.userData, { recursive: true })
    writeFileSync(`${journalFile}.tmp`, JSON.stringify(journal))
    renameSync(`${journalFile}.tmp`, journalFile)
    await at('journaled')

    if (journal.hadFiles) renameSync(options.filesDir, previous)
    await at('mid-swap')
    renameSync(staging, options.filesDir)
    await at('swapped')
  } catch (error) {
    // Nothing here may throw past `undo`: with a failing disk that would leave the half-swapped folders in use.
    try {
      rmSync(`${journalFile}.tmp`, { force: true })
    } catch {
      // The recovery removes a leftover journal.tmp.
    }
    return undo(error, false)
  }

  let restored: RestoreResult
  try {
    await at('restoring')
    restored = await options.restore(dump, journal.id)
  } catch (error) {
    // Unknown whether the commit happened: ask the database; if it cannot answer, recovery decides at the next start.
    let committed: boolean
    try {
      committed = await options.hasImport(journal.id)
    } catch {
      throw new ImportUnsettledError(error)
    }
    return undo(error, committed)
  }
  if (!restored.ok) {
    try {
      settle(options.filesDir, journalFile, journal, false)
    } catch (error) {
      throw new ImportUnsettledError(error)
    }
    return { ok: false, reason: restored.reason === 'has-users' ? 'not-new' : 'invalid' }
  }
  await at('committed')
  // The database is imported either way: a cleanup that fails is reported, not turned into a failed import,
  // and the journal that is left is closed by the recovery at the next start.
  try {
    settle(options.filesDir, journalFile, journal, true)
  } catch {
    return { ok: true, warning: 'cleanup' }
  }
  await at('cleaned')
  return { ok: true }
}
