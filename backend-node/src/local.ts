// Entry of the desktop app's local mode: bundled by esbuild into desktop/out/backend/server.cjs and
// started by Electron's utilityProcess. The main process sends the settings (secrets included, so
// they never show up in a process list) as the first message and gets `ready` or `error` back.
import { NotANewInstallationError } from './local/data-transfer.ts'
import { type LocalServer, type LocalServerOptions, startLocalServer } from './local/local-server.ts'

interface ParentPort {
  on(event: 'message', listener: (message: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

type Start = Omit<LocalServerOptions, 'logger' | 'jobLogger' | 'port'>

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort
if (!parentPort) throw new Error('local.ts runs inside an Electron utilityProcess')

let server: LocalServer | null = null

async function start(settings: Start): Promise<void> {
  try {
    server = await startLocalServer({ ...settings, logger: { level: 'info' } })
    parentPort?.postMessage({ type: 'ready', port: server.port, migrationsApplied: server.migrationsApplied })
  } catch (error) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
    parentPort?.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    process.exit(1)
  }
}

/** Export and import run here because this process owns the database directory. */
async function transfer(message: { type: string; id?: number; sql?: string; schemaRevision?: number; importId?: string }): Promise<void> {
  const reply = (type: string, body: Record<string, unknown>) => parentPort?.postMessage({ type, ...body, id: message.id })
  const type = `${message.type}-result`
  try {
    if (!server) throw new Error('the local backend is not running')
    const dump = { sql: message.sql ?? '', schemaRevision: message.schemaRevision ?? 0 }
    if (message.type === 'dump') {
      const done = await server.dump()
      reply(type, { ok: true, sql: done.sql, schemaRevision: done.schemaRevision })
    } else if (message.type === 'has-import') {
      reply(type, { ok: true, committed: await server.hasImport(message.importId ?? '') })
    } else if (message.type === 'check') {
      await server.check(dump)
      reply(type, { ok: true })
    } else {
      await server.restore(dump, message.importId)
      reply(type, { ok: true })
    }
  } catch (error) {
    reply(type, {
      ok: false,
      reason: error instanceof NotANewInstallationError ? 'has-users' : 'invalid',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

parentPort.on('message', ({ data }) => {
  const message = data as { type?: string } & Partial<Start>
  if (message.type === 'dump' || message.type === 'restore' || message.type === 'check' || message.type === 'has-import') void transfer(message as Parameters<typeof transfer>[0])
  if (message.type === 'start') void start(message as Start)
  if (message.type === 'shutdown') {
    void (server?.close() ?? Promise.resolve()).finally(() => process.exit(0))
  }
})
