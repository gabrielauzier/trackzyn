import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** A hash of every relative path and byte under `dir`: the "checksum of the directory" of D18 and D19. */
export function checksumDir(dir: string): string {
  const hash = createHash('sha256')
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name)
      const relative = path.relative(dir, full)
      if (statSync(full).isDirectory()) {
        hash.update(`d:${relative}\n`)
        walk(full)
      } else {
        hash.update(`f:${relative}\n`)
        hash.update(readFileSync(full))
      }
    }
  }
  walk(dir)
  return hash.digest('hex')
}
