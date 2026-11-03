import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const file = path.resolve(__dirname, '../../.github/workflows/desktop-release.yml')
const text = readFileSync(file, 'utf8')
const builder = parse(readFileSync(path.resolve(__dirname, '../electron-builder.yml'), 'utf8')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const workflow = parse(text) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe('desktop-release workflow', () => {
  it('release workflow shape', () => {
    expect(workflow.on.push.tags).toEqual(['desktop-v*'])
    const job = workflow.jobs['desktop-release']
    expect(job.strategy.matrix.include.map((item: { os: string }) => item.os).sort()).toEqual(['macos-15-intel', 'macos-latest', 'ubuntu-latest', 'windows-latest'])
    expect(job.strategy['fail-fast']).toBe(false)
    expect(job['runs-on']).toBe('${{ matrix.os }}')
    // Publishes through electron-builder to the configurable repository.
    const publish = job.steps.find((step: { run?: string }) => step.run?.includes('--publish always'))
    expect(publish, 'a publish step').toBeDefined()
    expect(text).toContain('vars.TRACKZYN_DESKTOP_RELEASE_REPO')
    expect(publish.env.GH_TOKEN).toContain('secrets.')
    expect(job.permissions.contents).toBe('write')
    expect(publish.run).not.toMatch(/--publish\s+never/)
  })

  it('builds each macOS architecture on a runner of that architecture', () => {
    const job = workflow.jobs['desktop-release']
    const mac = job.strategy.matrix.include.filter((item: { os: string }) => item.os.startsWith('macos'))
    // The local mode's argon2 addon is copied from the host's node_modules by extraResources: only a
    // runner of the target architecture has the right one.
    expect(mac).toContainEqual({ os: 'macos-latest', electron_args: '--arm64' })
    expect(mac).toContainEqual({ os: 'macos-15-intel', electron_args: '--x64' })
    expect(mac).toHaveLength(2)
    const publish = job.steps.find((step: { run?: string }) => step.run?.includes('--publish always'))
    expect(publish.run).toContain('${{ matrix.electron_args }}')
    expect(builder.extraResources).toContainEqual({ from: 'node_modules/@node-rs', to: 'backend/node_modules/@node-rs' })
    const flags = Object.fromEntries(job.strategy.matrix.include.map((item: { os: string; electron_args: string }) => [item.os, item.electron_args]))
    expect(flags).toEqual({ 'macos-latest': '--arm64', 'macos-15-intel': '--x64', 'windows-latest': '--x64', 'ubuntu-latest': '--x64' })
  })

  it('splits the configurable owner/repo for the builder', () => {
    const resolve = workflow.jobs['desktop-release'].steps.find((step: { name?: string }) => step.name?.startsWith('Resolve the releases repository'))
    expect(resolve.env.RELEASE_REPO).toBe('${{ vars.TRACKZYN_DESKTOP_RELEASE_REPO }}')
    const dir = mkdtempSync(path.join(tmpdir(), 'trackzyn-release-'))
    try {
      const run = (repo: string) => {
        const githubEnv = path.join(dir, 'env')
        writeFileSync(githubEnv, '')
        const env = { ...process.env, RUNNER_OS: 'Linux', GITHUB_ENV: githubEnv, RELEASE_REPO: repo, HAS_WIN_CERT: 'false' }
        const result = spawnSync('bash', ['-c', resolve.run], { env, encoding: 'utf8' })
        return { status: result.status, exported: readFileSync(githubEnv, 'utf8') }
      }
      const ok = run('acme/trackzyn-releases')
      expect(ok.status).toBe(0)
      expect(ok.exported).toContain('TRACKZYN_DESKTOP_RELEASE_OWNER=acme\n')
      expect(ok.exported).toContain('TRACKZYN_DESKTOP_RELEASE_REPO_NAME=trackzyn-releases\n')
      // Linux is never signed, so its build never starts the autoUpdater.
      expect(ok.exported).toContain('TRACKZYN_DESKTOP_SIGNED=false\n')
      expect(ok.exported).not.toContain('TRACKZYN_DESKTOP_SIGNED=true')
      for (const bad of ['', 'no-slash', 'a/b/c', '/repo']) expect(run(bad).status, JSON.stringify(bad)).not.toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    // ...and the publish command hands the builder exactly the variables the step writes.
    const publish = workflow.jobs['desktop-release'].steps.find((step: { run?: string }) => step.run?.includes('--publish always'))
    expect(publish.run).toContain('-c.publish.provider=github')
    expect(publish.run).toContain('-c.publish.owner="${TRACKZYN_DESKTOP_RELEASE_OWNER}"')
    expect(publish.run).toContain('-c.publish.repo="${TRACKZYN_DESKTOP_RELEASE_REPO_NAME}"')
  })

  it('publishes the latest*.yml update feeds next to the installers', () => {
    // electron-builder writes latest-mac.yml for the zip, latest.yml for nsis and
    // latest-linux.yml for the AppImage, and `--publish always` uploads them.
    const names = (section: { target: Array<string | { target: string }> }) => section.target.map((t) => (typeof t === 'string' ? t : t.target))
    expect(names(builder.mac)).toContain('zip')
    expect(names(builder.win)).toContain('nsis')
    expect(names(builder.linux)).toContain('AppImage')
    expect(JSON.stringify(builder)).not.toContain('generateUpdatesFilesForAllChannels')
    const publish = workflow.jobs['desktop-release'].steps.find((step: { run?: string }) => step.run?.includes('--publish always'))
    expect(publish.run).toContain('electron-builder')
  })

  it('signs only when the signing secrets exist', () => {
    const job = workflow.jobs['desktop-release']
    const sign = job.steps.find((step: { env?: Record<string, string> }) => step.env?.CSC_LINK)
    expect(sign.env.CSC_LINK).toContain('secrets.')
    expect(sign.env.APPLE_ID).toContain('secrets.')
    expect(text).toContain('TRACKZYN_DESKTOP_SIGNED')
  })

  it('hands each signing secret to its own operating system only', () => {
    const job = workflow.jobs['desktop-release']
    const sign = job.steps.find((step: { env?: Record<string, string> }) => step.env?.CSC_LINK)
    // electron-builder signs Windows with CSC_LINK when WIN_CSC_LINK is absent.
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
      expect(sign.env[name], name).toContain("runner.os == 'macOS'")
    }
    for (const name of ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']) {
      expect(sign.env[name], name).toContain("runner.os == 'Windows'")
    }
  })

  it('installs the packages the build bundles before the app is built', () => {
    const job = workflow.jobs['desktop-release']
    const steps = job.steps as Array<{ run?: string; uses?: string; with?: Record<string, string> }>
    const first = steps.findIndex((step) => step.run && /build:backend|build:all|package:|npm test|electron-builder/.test(step.run))
    expect(first, 'a build step').toBeGreaterThan(-1)
    const setup = steps.find((step) => step.uses?.startsWith('actions/setup-node'))
    const installs = steps.flatMap((step, index) => (step.run && /npm ci --prefix backend-node/.test(step.run) ? [index] : []))
    expect(installs, 'npm ci --prefix backend-node').toHaveLength(1)
    expect(installs[0]).toBeLessThan(first)
    expect(setup?.with?.['cache-dependency-path']).toContain('backend-node/package-lock.json')
  })
})
