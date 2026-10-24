import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Step {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, string>
  if?: string
  'continue-on-error'?: boolean
}
interface Job {
  strategy?: { matrix: { os: string[] }; 'fail-fast'?: boolean }
  steps: Step[]
  'continue-on-error'?: boolean
}

const ci = parse(readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> }

function commands(job: Job): string[] {
  return job.steps.flatMap((step) => (step.run ? [step.run] : []))
}

describe('ci workflow', () => {
  it('desktop-checks runs lint typecheck vitest and unsigned build', () => {
    const job = ci.jobs['desktop-checks']
    expect(job, 'desktop-checks job').toBeDefined()
    const runs = commands(job)
    for (const command of ['npm run lint', 'npm run typecheck', 'npm test', 'npm run package:dir']) {
      expect(runs, command).toContain(command)
    }
    // A failing step must fail the job.
    expect(job['continue-on-error']).toBeUndefined()
    for (const step of job.steps) expect(step['continue-on-error'], step.name).toBeUndefined()
    // No signing secret is needed to prove the app builds.
    expect(JSON.stringify(job)).not.toContain('secrets.')
  })

  it('desktop-checks guards the web bundle against window.launchkit', () => {
    const job = ci.jobs['desktop-checks']
    const guard = job.steps.findIndex((step) => step.run === 'npm run check:web-bundle')
    expect(guard, 'a check:web-bundle step').toBeGreaterThan(-1)
    expect(job.steps[guard].if).toContain('run_desktop')
    // It builds the web app, so it comes after the frontend dependencies are installed.
    expect(guard).toBeGreaterThan(job.steps.findIndex((step) => step.run?.includes('npm ci --prefix ../frontend')))
  })

  it('desktop-e2e matrix covers the three systems', () => {
    const job = ci.jobs['desktop-e2e']
    expect(job, 'desktop-e2e job').toBeDefined()
    expect([...job.strategy!.matrix.os].sort()).toEqual(['macos-latest', 'ubuntu-latest', 'windows-latest'])
    expect(job.strategy!['fail-fast']).toBe(false)
    expect(commands(job).some((command) => command.includes('playwright test') || command.includes('test:e2e'))).toBe(true)
  })

  it('desktop-e2e runs the local mode and deep link specs on the three systems', () => {
    const job = ci.jobs['desktop-e2e']
    expect([...job.strategy!.matrix.os].sort()).toEqual(['macos-latest', 'ubuntu-latest', 'windows-latest'])
    // npm run test:e2e builds the app and runs the whole Playwright suite, with no file or title filter.
    const runs = job.steps.filter((step) => step.run?.includes('npm run test:e2e'))
    expect(runs.length).toBeGreaterThanOrEqual(2)
    for (const step of runs) expect(step.run).not.toMatch(/--grep|-g |\.spec\.ts/)
    expect(runs.some((step) => step.if?.includes("runner.os == 'Linux'") && step.run?.startsWith('xvfb-run'))).toBe(true)
    // The script it calls builds first and the specs it must reach exist.
    const scripts = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).scripts as Record<string, string>
    expect(scripts['test:e2e']).toBe('npm run build:all && playwright test')
    for (const spec of ['local-flow.spec.ts', 'sso.spec.ts']) expect(existsSync(path.resolve(__dirname, '../e2e', spec)), spec).toBe(true)
    const playwright = readFileSync(path.resolve(__dirname, '../playwright.config.mts'), 'utf8')
    expect(playwright).toContain("testMatch: '**/*.spec.ts'")
    expect(playwright).not.toMatch(/testIgnore|grep/)
  })

  it('both desktop jobs are gated on run_desktop', () => {
    for (const name of ['desktop-checks', 'desktop-e2e']) {
      const gated = ci.jobs[name].steps.filter((step) => step.if?.includes('run_desktop'))
      expect(gated.length, name).toBeGreaterThan(3)
    }
  })

  // A clean runner has no node_modules anywhere: the jobs install the packages of everything the app
  // build bundles (the local backend's, when there is one) before anything that builds or tests the app.
  const BUILDS = /build:backend|build:all|package:|npm test|test:e2e/
  for (const name of ['desktop-checks', 'desktop-e2e']) {
    it(`${name} installs the packages the build bundles before the first step that builds or tests the app`, () => {
      const job = ci.jobs[name]
      const first = job.steps.findIndex((step) => step.run && BUILDS.test(step.run))
      expect(first, 'a build step').toBeGreaterThan(-1)
      const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node'))
      const installs = job.steps.flatMap((step, index) => (step.run && /npm ci --prefix \.\.\/backend-node/.test(step.run) ? [index] : []))
      expect(installs, 'npm ci --prefix ../backend-node').toHaveLength(1)
      expect(installs[0]).toBeLessThan(first)
      expect(setup?.with?.['cache-dependency-path']).toContain('backend-node/package-lock.json')
    })
  }
})
