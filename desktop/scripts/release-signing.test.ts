import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { isSignedBuild } from '../src/main/signed-build'
import { createUpdater, type AutoUpdaterLike } from '../src/main/updater'

const workflow = parse(readFileSync(path.resolve(__dirname, '../../.github/workflows/desktop-release.yml'), 'utf8')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const resolveStep = workflow.jobs['desktop-release'].steps.find((step: { name?: string }) => step.name?.startsWith('Resolve the releases repository'))

type RunnerOS = 'macOS' | 'Windows' | 'Linux'

/** Runs the workflow's own resolve step the way a runner would and returns what it exported. */
function runResolveStep(runnerOs: RunnerOS, secrets: { mac?: boolean; win?: boolean | 'link-only' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'trackzyn-release-'))
  const githubEnv = path.join(dir, 'github-env')
  writeFileSync(githubEnv, '')
  try {
    // The step's `env:` holds `${{ ... }}` expressions; resolve them from the secrets flags.
    const env: Record<string, string> = { ...(process.env as Record<string, string>), RUNNER_OS: runnerOs, GITHUB_ENV: githubEnv }
    for (const [key, value] of Object.entries(resolveStep.env as Record<string, string>)) {
      if (key === 'RELEASE_REPO') env[key] = 'acme/trackzyn-releases'
      else if (key.startsWith('HAS_MAC')) env[key] = String(Boolean(secrets.mac))
      else if (key.startsWith('HAS_WIN')) env[key] = String(secrets.win === true || (secrets.win === 'link-only' && /LINK|CERT/.test(key)))
      else throw new Error(`unexpected env ${key}=${value} in the resolve step`)
    }
    const result = spawnSync('bash', ['-c', resolveStep.run], { env, encoding: 'utf8' })
    const exported = Object.fromEntries(
      readFileSync(githubEnv, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    )
    return { status: result.status, output: `${result.stdout}${result.stderr}`, exported }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

class FakeAutoUpdater extends EventEmitter implements AutoUpdaterLike {
  autoDownload = false
  checkForUpdates = vi.fn(async (): Promise<unknown> => null)
  quitAndInstall = vi.fn()
}

/** What the packaged app does at startup, given the value the workflow handed to the build. */
function updaterStarted(exported: Record<string, string>): boolean {
  const autoUpdater = new FakeAutoUpdater()
  createUpdater({ autoUpdater, signed: isSignedBuild(exported), packaged: true, send: vi.fn(), intervalMs: 0 }).start()
  return autoUpdater.checkForUpdates.mock.calls.length > 0
}

describe('desktop-release signing defaults', () => {
  it('Linux builds are unsigned and never start the autoUpdater, with or without certificates', () => {
    for (const secrets of [{}, { mac: true, win: true }]) {
      const { status, exported } = runResolveStep('Linux', secrets)
      expect(status).toBe(0)
      expect(exported.TRACKZYN_DESKTOP_SIGNED).toBe('false')
      expect(updaterStarted(exported)).toBe(false)
    }
  })

  it('Windows is signed only with a certificate and starts the autoUpdater only then', () => {
    const unsigned = runResolveStep('Windows', {})
    expect(unsigned.status).toBe(0)
    expect(unsigned.exported.TRACKZYN_DESKTOP_SIGNED).toBe('false')
    expect(updaterStarted(unsigned.exported)).toBe(false)

    const signed = runResolveStep('Windows', { win: true })
    expect(signed.exported.TRACKZYN_DESKTOP_SIGNED).toBe('true')
    expect(updaterStarted(signed.exported)).toBe(true)
  })

  it('Windows with the certificate but no password is not signed', () => {
    const { status, exported } = runResolveStep('Windows', { win: 'link-only' })
    expect(status).toBe(0)
    expect(exported.TRACKZYN_DESKTOP_SIGNED).toBe('false')
    expect(updaterStarted(exported)).toBe(false)
  })

  it('macOS secrets alone never sign Windows', () => {
    const { exported } = runResolveStep('Windows', { mac: true })
    expect(exported.TRACKZYN_DESKTOP_SIGNED).toBe('false')
  })

  it('macOS with the signing secrets is signed and starts the autoUpdater', () => {
    const { status, exported } = runResolveStep('macOS', { mac: true })
    expect(status).toBe(0)
    expect(exported.TRACKZYN_DESKTOP_SIGNED).toBe('true')
    expect(updaterStarted(exported)).toBe(true)
  })

  it('macOS without the signing secrets fails with a clear message and publishes nothing', () => {
    const { status, output } = runResolveStep('macOS', {})
    expect(status).not.toBe(0)
    expect(output).toContain('::error::')
    for (const secret of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
      expect(output, secret).toContain(secret)
    }
  })

  it('the release never signs ad hoc', () => {
    expect(JSON.stringify(workflow)).not.toMatch(/mac\.identity/)
  })
})
