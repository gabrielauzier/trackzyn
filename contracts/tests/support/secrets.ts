import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inject } from 'vitest'
import { LOGS_DIR, SECRET_KEY } from './config'

const file = () => join(LOGS_DIR, 'secrets.txt')

/** Records a value that must never show up in a server log (C40). */
export function trackSecret(value: string | undefined | null): string {
  if (value) appendFileSync(file(), `${value}\n`)
  return value ?? ''
}

export function trackedSecrets(): string[] {
  const values = new Set(readFileSync(file(), 'utf8').split('\n').filter(Boolean))
  values.add(SECRET_KEY)
  return [...values]
}

/** True when the stack under test is the Node one, whose log C40 must be able to read. */
export function nodeIsSubject(): boolean {
  return inject('stack') === 'node'
}
