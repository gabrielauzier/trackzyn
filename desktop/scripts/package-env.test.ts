import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')

// Needs the electron-vite output (`npm run build`); CI runs this after package:dir.
describe.skipIf(!existsSync(path.join(root, 'out/main/index.js')))('unpublished package build', () => {
  // Linux is the CI platform: it writes app-update.yml from `publish`, which is where the failure showed.
  it('packages with --dir in a clean environment that has no release variables', { timeout: 300_000 }, () => {
    const output = mkdtempSync(path.join(tmpdir(), 'launchkit-pkg-'))
    try {
      const env = { ...process.env }
      for (const name of Object.keys(env)) if (name.startsWith('LAUNCHKIT_DESKTOP_RELEASE')) delete env[name]
      const result = spawnSync('npx', ['electron-builder', '--dir', '--linux', '-c.mac.identity=-', `-c.directories.output=${output}`], { cwd: root, env, encoding: 'utf8' })
      expect(`${result.stdout}${result.stderr}`).not.toContain('is not defined')
      expect(result.status).toBe(0)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})
