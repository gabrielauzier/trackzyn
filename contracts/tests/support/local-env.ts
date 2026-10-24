import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Loads contracts/.env.local (KEY=value lines) without overriding the real environment. */
export function loadLocalEnv(): void {
  const file = resolve(import.meta.dirname, '../../.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
  }
}
