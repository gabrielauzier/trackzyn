import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { TestProject } from 'vitest/node'
import { LOGS_DIR, REPO_ROOT, type Stack, asyncpgUrl, peerOf, subjectStack } from './config'
import { dropAndRecreateSchema } from './db'
import { type RunningStack, baseEnv, startStack } from './stacks'

declare module 'vitest' {
  export interface ProvidedContext {
    apiUrl: string
    peerApiUrl: string
    stack: Stack
  }
}

const started: RunningStack[] = []

function alembicUpgrade(): void {
  const python = process.env.CONTRACT_PYTHON_BIN ?? resolve(REPO_ROOT, '.venv/bin/python')
  const result = spawnSync(python, ['-m', 'alembic', 'upgrade', 'head'], {
    cwd: resolve(REPO_ROOT, 'backend'),
    env: { ...process.env, ...baseEnv('python'), DATABASE_URL: asyncpgUrl() },
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`alembic upgrade head failed:\n${result.stdout}${result.stderr}`)
}

export default async function setup(project: TestProject) {
  const stack = subjectStack()
  rmSync(LOGS_DIR, { recursive: true, force: true })
  mkdirSync(LOGS_DIR, { recursive: true })
  writeFileSync(join(LOGS_DIR, 'secrets.txt'), '')

  let apiUrl = process.env.API_URL
  let peerApiUrl = process.env.PEER_API_URL

  if (!apiUrl || !peerApiUrl) {
    // The reference schema comes from Alembic; the Node stack adopts it at boot.
    await dropAndRecreateSchema()
    alembicUpgrade()
  }
  if (!apiUrl) {
    const subject = await startStack(stack)
    started.push(subject)
    apiUrl = subject.url
  }
  if (!peerApiUrl) {
    // A missing peer fails the cross-stack cases that need it; it does not hide them.
    try {
      const peer = await startStack(peerOf(stack))
      started.push(peer)
      peerApiUrl = peer.url
    } catch (error) {
      console.warn(`peer stack (${peerOf(stack)}) is not available: ${(error as Error).message.split('\n')[0]}`)
      peerApiUrl = ''
    }
  }

  project.provide('apiUrl', apiUrl)
  project.provide('peerApiUrl', peerApiUrl)
  project.provide('stack', stack)

  return async () => {
    await Promise.all(started.map((s) => s.stop()))
  }
}
