import { randomBytes } from 'node:crypto'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { startWithBackup } from './backup'

/** How long the backend gets to close its database after "shutdown" before it is killed. */
export const STOP_TIMEOUT_MS = 5000

export interface ChildLike {
  pid?: number
  stdout: Readable | null
  stderr: Readable | null
  postMessage(message: Record<string, unknown>): void
  on(event: 'message', listener: (message: unknown) => void): unknown
  on(event: 'exit', listener: (code: number | null) => void): unknown
  kill(): boolean
}

interface Options {
  fork: (entry: string, options: { serviceName: string; stdio: 'pipe' }) => ChildLike
  /** The bundled `server.cjs`. */
  entry: string
  userData: string
  migrationsFolder: string
}

export interface DataDump {
  sql: string
  schemaRevision: number
}

export type RestoreResult = { ok: true } | { ok: false; reason: 'has-users' | 'invalid' }

export interface RunningBackend {
  url: string
  port: number
  token: string
}

/** The signing secret of the local sessions: made once, kept in `userData/secret.key` (mode 0600). */
function readSecret(userData: string): string {
  const file = path.join(userData, 'secret.key')
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (existing) return existing
  } catch {
    // first use
  }
  const secret = randomBytes(32).toString('hex')
  mkdirSync(userData, { recursive: true })
  writeFileSync(file, `${secret}\n`, { mode: 0o600 })
  return secret
}

/** Owns the utilityProcess that runs backend-node for the local mode. */
export function createLocalBackend({ fork, entry, userData, migrationsFolder }: Options) {
  let child: ChildLike | null = null
  let running: RunningBackend | null = null

  function launch(): Promise<RunningBackend & { migrationsApplied: number }> {
    const token = randomBytes(32).toString('hex')
    const logsDir = path.join(userData, 'logs')
    mkdirSync(logsDir, { recursive: true })

    return new Promise((resolve, reject) => {
      const process_ = fork(entry, { serviceName: 'trackzyn-backend', stdio: 'pipe' })
      child = process_
      if (process_.stdout || process_.stderr) {
        const log = createWriteStream(path.join(logsDir, 'backend.log'), { flags: 'a' })
        process_.stdout?.pipe(log, { end: false })
        process_.stderr?.pipe(log, { end: false })
      }
      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        child = null
        reject(error)
      }
      process_.on('message', (message) => {
        const data = message as { type?: string; port?: number; migrationsApplied?: number; message?: string }
        if (data.type === 'ready' && typeof data.port === 'number' && !settled) {
          settled = true
          resolve({ port: data.port, url: `http://127.0.0.1:${data.port}`, token, migrationsApplied: data.migrationsApplied ?? 0 })
        } else if (data.type === 'error') {
          fail(new Error(data.message ?? 'The local backend failed to start'))
        }
      })
      process_.on('exit', (code) => {
        if (child === process_) child = null
        running = null
        fail(new Error(`The local backend exited with code ${code} before it was ready`))
      })
      process_.postMessage({
        type: 'start',
        dataDir: path.join(userData, 'db'),
        filesDir: path.join(userData, 'files'),
        secretKey: readSecret(userData),
        sessionToken: token,
        migrationsFolder,
      })
    })
  }

  let nextId = 1
  /** One request to the running backend (export or import) and its reply. */
  function ask<T>(message: Record<string, unknown>): Promise<T> {
    const current = child
    if (!current) return Promise.reject(new Error('the local backend is not running'))
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      current.on('message', (reply) => {
        const data = reply as { id?: number }
        if (data.id === id) resolve(data as T)
      })
      current.on('exit', () => reject(new Error('the local backend exited')))
      current.postMessage({ ...message, id })
    })
  }

  return {
    /** The database as SQL, read by the backend that has it open. */
    async dump(): Promise<DataDump> {
      const reply = await ask<{ ok: boolean; sql?: string; schemaRevision?: number; message?: string }>({ type: 'dump' })
      if (!reply.ok) throw new Error(reply.message ?? 'the export failed')
      return { sql: reply.sql ?? '', schemaRevision: reply.schemaRevision ?? 0 }
    },

    /** Restores a dump into a database without users, all or nothing; `importId` is the marker the recovery looks for. */
    async restore(dump: DataDump, importId?: string): Promise<RestoreResult> {
      const reply = await ask<{ ok: boolean; reason?: 'has-users' | 'invalid' }>({ type: 'restore', importId, ...dump })
      return reply.ok ? { ok: true } : { ok: false, reason: reply.reason ?? 'invalid' }
    },

    /** Every refusal of `restore`, without changing anything. */
    async check(dump: DataDump): Promise<RestoreResult> {
      const reply = await ask<{ ok: boolean; reason?: 'has-users' | 'invalid' }>({ type: 'check', ...dump })
      return reply.ok ? { ok: true } : { ok: false, reason: reply.reason ?? 'invalid' }
    },

    /** Whether the import with this id committed (its marker is in the database). */
    async hasImport(importId: string): Promise<boolean> {
      const reply = await ask<{ ok: boolean; committed?: boolean; message?: string }>({ type: 'has-import', importId })
      // "Could not ask" is not "no": the recovery must fail rather than undo an import that may have committed.
      if (!reply.ok) throw new Error(reply.message ?? 'the local backend could not answer')
      return reply.committed === true
    },

    /** Backs the database up, starts the backend and waits until it listens. */
    async start(): Promise<RunningBackend> {
      const started = await startWithBackup({ userData, run: launch })
      running = { url: started.url, port: started.port, token: started.token }
      return running
    },

    info(): RunningBackend | null {
      return running
    },

    /** Asks the backend to close its database and exit; kills it after five seconds. */
    async stop(): Promise<void> {
      const current = child
      running = null
      if (!current) return
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => current.kill(), STOP_TIMEOUT_MS)
        current.on('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        current.postMessage({ type: 'shutdown' })
      })
      if (child === current) child = null
    },
  }
}
