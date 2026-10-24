import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGS_DIR } from './support/config'
import { nodeIsSubject, trackedSecrets } from './support/secrets'

// The last file of the run: by now every other case has used its passwords and tokens.
describe('server logs', () => {
  it('C40 node.log contains none of the passwords, access tokens, temp tokens or SECRET_KEY used by the suite', () => {
    const secrets = trackedSecrets()
    expect(secrets.length).toBeGreaterThan(10)

    const file = join(LOGS_DIR, 'node.log')
    // A run without a Node process (API_URL given for the Python stack) has no log to read; a run
    // of the Node stack without its log would pass for the wrong reason, so it fails.
    if (!existsSync(file)) {
      expect(nodeIsSubject(), 'node.log is missing but the Node stack is under test').toBe(false)
      return
    }
    const log = readFileSync(file, 'utf8')
    expect(log.length).toBeGreaterThan(0)

    const leaked = secrets.filter((secret) => log.includes(secret))
    expect(leaked).toEqual([])
  })
})
