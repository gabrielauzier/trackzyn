import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { inject } from 'vitest'
import {
  LOGS_DIR,
  REPO_ROOT,
  SECRET_KEY,
  type Stack,
  asyncpgUrl,
  databaseUrl,
  redisUrl,
} from './config'

export interface RunningStack {
  stack: Stack
  url: string
  stop(): Promise<void>
}

export interface StackExit {
  code: number | null
  output: string
}

/**
 * Where the pinned `tzdata` package keeps its zones. The Python stack reads zones from here
 * (PYTHONTZPATH) instead of the host's /usr/share/zoneinfo, so its list of timezone names does not
 * depend on the machine the suite runs on (C44).
 */
let tzdataZoneinfo: string | undefined
function pythonTzPath(): string {
  tzdataZoneinfo ??= execFileSync(
    process.env.CONTRACT_PYTHON_BIN ?? resolve(REPO_ROOT, '.venv/bin/python'),
    ['-c', 'import os, tzdata; print(os.path.join(os.path.dirname(tzdata.__file__), "zoneinfo"))'],
    { encoding: 'utf8' },
  ).trim()
  return tzdataZoneinfo
}

/** Environment every stack starts with; a case overrides single keys. */
export function baseEnv(stack: Stack): Record<string, string> {
  const env: Record<string, string> = {
    SECRET_KEY,
    REDIS_URL: redisUrl(),
    FRONTEND_URL: 'http://localhost:5173',
    TRUSTED_PROXY_HOPS: '1',
    CREDENTIALS_DIRECTORY: '',
    STORAGE_LOCAL_PATH: mkdtempSync(join(tmpdir(), 'launchkit-contract-files-')),
    DATABASE_URL: stack === 'python' ? asyncpgUrl() : databaseUrl(),
  }
  if (stack === 'python') env.PYTHONTZPATH = pythonTzPath()
  return env
}

function commandFor(stack: Stack, port: number): { cmd: string; args: string[]; cwd: string } {
  if (stack === 'python') {
    const python = process.env.CONTRACT_PYTHON_BIN ?? resolve(REPO_ROOT, '.venv/bin/python')
    return {
      cmd: python,
      args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)],
      cwd: resolve(REPO_ROOT, 'backend'),
    }
  }
  const custom = process.env.CONTRACT_NODE_CMD
  const [cmd, ...args] = custom ? custom.split(' ') : ['npx', 'tsx', 'src/server.ts']
  return { cmd, args, cwd: resolve(REPO_ROOT, 'backend-node') }
}

export async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolvePort(port))
    })
  })
}

function launch(stack: Stack, env: Record<string, string>, port: number) {
  mkdirSync(LOGS_DIR, { recursive: true })
  const logFile = join(LOGS_DIR, `${stack}.log`)
  const { cmd, args, cwd } = commandFor(stack, port)
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const sink = (chunk: Buffer) => {
    const text = chunk.toString()
    output += text
    appendFileSync(logFile, text)
  }
  child.stdout?.on('data', sink)
  child.stderr?.on('data', sink)
  child.on('error', (error) => sink(Buffer.from(`failed to spawn ${cmd}: ${error.message}\n`)))
  return { child, output: () => output }
}

async function waitUntilHealthy(url: string, child: ChildProcess, output: () => string) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`stack exited with ${child.exitCode} before it was ready:\n${output()}`)
    }
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`stack at ${url} did not become healthy:\n${output()}`)
}

export async function startStack(
  stack: Stack,
  overrides: Record<string, string> = {},
): Promise<RunningStack> {
  const port = await freePort()
  const { child, output } = launch(stack, { ...baseEnv(stack), ...overrides }, port)
  const url = `http://127.0.0.1:${port}`
  try {
    await waitUntilHealthy(url, child, output)
  } catch (error) {
    child.kill('SIGKILL')
    throw error
  }
  return {
    stack,
    url,
    stop: async () => {
      if (child.exitCode !== null) return
      const exited = new Promise<void>((r) => child.once('exit', () => r()))
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
      await exited
      clearTimeout(timer)
    },
  }
}

/** Starts a stack that is expected to refuse to boot and reports how it ended. */
export async function runUntilExit(
  stack: Stack,
  overrides: Record<string, string>,
  timeoutMs = 30_000,
): Promise<StackExit> {
  const port = await freePort()
  const { child, output } = launch(stack, { ...baseEnv(stack), ...overrides }, port)
  const code = await new Promise<number | null>((resolveCode) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolveCode(null)
    }, timeoutMs)
    child.once('exit', (c) => {
      clearTimeout(timer)
      resolveCode(c)
    })
  })
  return { code, output: output() }
}

/** Starts another instance of the stack under test with some settings changed. */
export async function startSubject(overrides: Record<string, string> = {}): Promise<RunningStack> {
  return startStack(inject('stack'), overrides)
}

export async function runSubjectUntilExit(
  overrides: Record<string, string>,
  timeoutMs?: number,
): Promise<StackExit> {
  return runUntilExit(inject('stack'), overrides, timeoutMs)
}
