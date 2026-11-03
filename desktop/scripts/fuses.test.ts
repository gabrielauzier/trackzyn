import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findPackagedApp } from './packaged-app'

const release = path.resolve(__dirname, '..', 'release')

function readFuses(app: string): Record<string, boolean> {
  const output = execFileSync('npx', ['--no-install', '@electron/fuses', 'read', '--app', app], { encoding: 'utf8' })
  const fuses: Record<string, boolean> = {}
  for (const line of output.split('\n')) {
    const match = /^\s*(\w+) is (Enabled|Disabled|Removed)/i.exec(line)
    if (match) fuses[match[1]] = match[2].toLowerCase() === 'enabled'
  }
  return fuses
}

const app = findPackagedApp(release)

describe('packaged app fuses', () => {
  // `npm run package:dir` produces the app. Locally, without it there is nothing
  // to read and the test skips; in CI (CI is set) a missing app is a failure,
  // otherwise the job would pass without ever reading a fuse.
  it('packaged app fuses', (context) => {
    if (!app) {
      if (process.env.CI) expect.fail('no packaged app in release/: run `npm run package:dir` before the tests')
      context.skip()
    }
    const fuses = readFuses(app!)
    expect(fuses.RunAsNode).toBe(false)
    expect(fuses.EnableNodeCliInspectArguments).toBe(false)
    expect(fuses.EnableEmbeddedAsarIntegrityValidation).toBe(true)
    expect(fuses.OnlyLoadAppFromAsar).toBe(true)
  })
})
