import { resolve } from 'node:path'

export type Stack = 'python' | 'node'

export const REPO_ROOT = resolve(import.meta.dirname, '../../..')
export const LOGS_DIR = resolve(import.meta.dirname, '../../.logs')

/** SECRET_KEY the suite gives to every stack it starts. */
export const SECRET_KEY = 'contract-suite-signing-key-not-a-secret'

export function subjectStack(): Stack {
  const stack = process.env.CONTRACT_STACK
  if (stack !== 'python' && stack !== 'node') {
    throw new Error('CONTRACT_STACK must be "python" or "node"')
  }
  return stack
}

export function peerOf(stack: Stack): Stack {
  return stack === 'python' ? 'node' : 'python'
}

export function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required (see contracts/README.md)`)
  return value
}

export function databaseUrl(): string {
  return required('CONTRACT_DATABASE_URL')
}

export function redisUrl(): string {
  return required('CONTRACT_REDIS_URL')
}

/** The SQLAlchemy/asyncpg form of CONTRACT_DATABASE_URL, for the Python stack. */
export function asyncpgUrl(): string {
  return databaseUrl().replace(/^postgres(ql)?:\/\//, 'postgresql+asyncpg://')
}
