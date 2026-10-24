// Proofs C12-C16 (select-stack), always on a throwaway clone of HEAD.
//   node --test --test-name-pattern='^C12 ' scripts/stack/select-stack.test.mjs
// C14 honours ONLY_STACK=python|node (the CI matrix runs one stack per job).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT, containerArgs, dockerRun } from './lib.mjs'

const SCOPE = ['docker-compose.yml', 'docker-compose.prod.yml', 'compose', '.github', 'charts', 'README.md', 'CONTRIBUTING.md', 'mise.toml', 'renovate.json', '.pre-commit-config.yaml']
const PYTHON_WORDS = 'celery|alembic|uvicorn|pytest|ruff'
const NODE_WORDS = 'fastify|drizzle|bullmq'
// Pinned so a local run and the CI run use the same tools.
export const HELM_IMAGE = 'alpine/helm:4.3.0'
export const ACTIONLINT_IMAGE = 'rhysd/actionlint:1.7.12'

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 't02-select-'))
  const clone = spawnSync('git', ['clone', '-q', '--no-hardlinks', ROOT, dir], { encoding: 'utf8' })
  assert.equal(clone.status, 0, clone.stderr)
  return dir
}

function select(dir, ...args) {
  return spawnSync('node', ['scripts/select-stack.mjs', ...args], { cwd: dir, encoding: 'utf8' })
}

function grepScope(dir, words) {
  const paths = SCOPE.filter((p) => existsSync(join(dir, p)))
  const result = spawnSync('grep', ['-rIlE', words, '--exclude=package-lock.json', ...paths], { cwd: dir, encoding: 'utf8' })
  return result.stdout.split('\n').filter(Boolean)
}

const docker = dockerRun

// The desktop of a Python project is a remote client: what exists only for its local mode.
const LOCAL_MODE_FILES = [
  'desktop/scripts/build-backend.mjs',
  'desktop/scripts/import-crash-harness.ts',
  'desktop/scripts/import-crash.test.ts',
  'desktop/scripts/packaged-local.test.ts',
  ...['backup', 'export-import', 'local-backend', 'transfer', 'zip'].flatMap((name) => [`desktop/src/main/${name}.ts`, `desktop/src/main/${name}.test.ts`]),
  'desktop/e2e/local-flow.spec.ts',
  'desktop/e2e/local.spec.ts',
  'desktop/e2e/support/local.ts',
  'frontend/src/pages/mode-select.tsx',
  'frontend/src/pages/mode-select.test.tsx',
  'frontend/src/components/export-modal.tsx',
  'frontend/src/components/export-modal.test.tsx',
  'frontend/src/lib/write-lock.ts',
]
const LOCAL_MODE_PACKAGES = ['@electric-sql/pglite', '@node-rs/argon2', 'esbuild']
// esbuild stays in the lockfile when electron-vite needs it; the two runtime packages must not.
const LOCK_FREE_PACKAGES = ['@electric-sql/pglite', '@node-rs/argon2']

/** Every file under `dir` (relative paths), without node_modules and lockfiles. */
function walk(root, dir = '') {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.name === 'node_modules' || entry.name === 'package-lock.json') return []
    return entry.isDirectory() ? walk(root, rel) : [rel]
  })
}

test('C12 select-stack node removes backend/ and contracts/ and leaves no Python word in scope', () => {
  const dir = copy()
  const result = select(dir, '--stack', 'node')
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!existsSync(join(dir, 'backend')))
  assert.ok(!existsSync(join(dir, 'contracts')))
  assert.ok(existsSync(join(dir, 'backend-node/src/db/migrate.ts')))
  assert.deepEqual(grepScope(dir, PYTHON_WORDS), [])
})

test('C13 select-stack python removes backend-node/ and contracts/ and leaves no Node word in scope', () => {
  const dir = copy()
  const result = select(dir, '--stack', 'python')
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!existsSync(join(dir, 'backend-node')))
  assert.ok(!existsSync(join(dir, 'contracts')))
  assert.ok(existsSync(join(dir, 'backend/app')))
  assert.deepEqual(grepScope(dir, NODE_WORDS), [])
})

test('C13 the desktop of a python tree is a remote client: no local mode in the files, the package, the locales or the words', () => {
  const dir = copy()
  assert.equal(select(dir, '--stack', 'python').status, 0)
  for (const file of LOCAL_MODE_FILES) assert.ok(!existsSync(join(dir, file)), `${file} should be gone`)

  const pkg = JSON.parse(readFileSync(join(dir, 'desktop/package.json'), 'utf8'))
  for (const name of LOCAL_MODE_PACKAGES) assert.ok(!(name in { ...pkg.dependencies, ...pkg.devDependencies }), `${name} should not be a dependency`)
  assert.equal(pkg.scripts['build:backend'], undefined)
  assert.equal(pkg.scripts['build:all'], 'npm run build:frontend && npm run build')
  const lock = JSON.parse(readFileSync(join(dir, 'desktop/package-lock.json'), 'utf8'))
  for (const name of LOCK_FREE_PACKAGES) assert.equal(lock.packages[`node_modules/${name}`], undefined, `${name} should be out of the lockfile`)
  assert.equal(lock.packages[''].dependencies['@electric-sql/pglite'], undefined)
  assert.equal(lock.packages[''].devDependencies.esbuild, undefined)
  assert.ok(!Object.keys(lock.packages).some((key) => key.startsWith('node_modules/@node-rs/')), '@node-rs/* should be out of the lockfile')

  const builder = readFileSync(join(dir, 'desktop/electron-builder.yml'), 'utf8')
  assert.doesNotMatch(builder, /backend|pglite|@node-rs/)
  assert.match(builder, /from: \.\.\/frontend\/dist-desktop/)

  for (const locale of ['en', 'pt-BR']) {
    const desktop = JSON.parse(readFileSync(join(dir, `frontend/src/locales/${locale}.json`), 'utf8')).desktop
    assert.equal(desktop.mode, undefined)
    assert.equal(desktop.transfer, undefined)
    assert.equal(desktop.menu.exportData, undefined)
    assert.equal(desktop.menu.importData, undefined)
    assert.ok(desktop.connect && desktop.sso && desktop.update, 'the remote client strings stay')
  }

  const words = [...walk(dir, 'desktop'), ...walk(dir, 'frontend/src')]
  const hits = []
  for (const file of words) {
    const text = readFileSync(join(dir, file), 'utf8')
    if (new RegExp(NODE_WORDS).test(text)) hits.push(`${file}: ${NODE_WORDS}`)
    if (/Use this computer|startLocal|exportData|importData|backend-node|launchkit_internal/.test(text)) hits.push(`${file}: local mode`)
  }
  assert.deepEqual(hits, [])
})

test('C13 the desktop of a node tree keeps the local mode', () => {
  const dir = copy()
  assert.equal(select(dir, '--stack', 'node').status, 0)
  for (const file of LOCAL_MODE_FILES) assert.ok(existsSync(join(dir, file)), `${file} should stay`)
  const pkg = JSON.parse(readFileSync(join(dir, 'desktop/package.json'), 'utf8'))
  assert.ok(pkg.dependencies['@electric-sql/pglite'])
  assert.match(pkg.scripts['build:all'], /build:backend/)
  assert.match(readFileSync(join(dir, 'desktop/electron-builder.yml'), 'utf8'), /backend-node\/drizzle/)
  // Markers are gone, nothing else changed in the files that carried them.
  for (const file of walk(dir, 'desktop')) assert.doesNotMatch(readFileSync(join(dir, file), 'utf8'), /select-stack:(begin|end)/, file)
})

for (const stack of ['python', 'node']) {
  if (process.env.ONLY_STACK && process.env.ONLY_STACK !== stack) continue
  test(`C14 after select-stack ${stack}: compose config, helm lint, actionlint and the CI tests pass`, { timeout: 600_000 }, () => {
    const dir = copy()
    const result = select(dir, '--stack', stack)
    assert.equal(result.status, 0, result.stderr)
    const env = { ...process.env }
    delete env.BACKEND_STACK
    const compose = spawnSync('docker', ['compose', 'config', '-q'], { cwd: dir, env, encoding: 'utf8' })
    assert.equal(compose.status, 0, compose.stderr)
    const prod = spawnSync('docker', ['compose', '-f', 'docker-compose.prod.yml', 'config', '-q'], { cwd: dir, env, encoding: 'utf8' })
    assert.equal(prod.status, 0, prod.stderr)
    // The CI job runs on a copy without usable git metadata: actionlint refuses to look for
    // workflows then ("no project was found"), so nothing below may depend on .git.
    rmSync(join(dir, '.git'), { recursive: true, force: true })
    const lint = docker(dir, HELM_IMAGE, ['lint', 'charts/launchkit'])
    assert.equal(lint.status, 0, lint.stdout + lint.stderr)
    const workflows = readdirSync(join(dir, '.github/workflows')).map((name) => `.github/workflows/${name}`)
    const actionlint = docker(dir, ACTIONLINT_IMAGE, workflows)
    assert.equal(actionlint.status, 0, actionlint.stdout + actionlint.stderr)
    for (const file of ['test_changes.py', 'test_workflow_jobs.py']) {
      const py = spawnSync('python3', [`.github/ci/${file}`], { cwd: dir, encoding: 'utf8' })
      assert.equal(py.status, 0, `${file}\n${py.stdout}${py.stderr}`)
    }
  })
}

test('C14 the desktop of a python tree installs, lints, typechecks, tests and builds as a remote client', { timeout: 1_800_000 }, () => {
  if (process.env.ONLY_STACK && process.env.ONLY_STACK !== 'python') return
  const dir = copy()
  assert.equal(select(dir, '--stack', 'python').status, 0)
  rmSync(join(dir, '.git'), { recursive: true, force: true })
  const run = (cwd, command, args) => {
    const result = spawnSync(command, args, { cwd: join(dir, cwd), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1' } })
    assert.equal(result.status, 0, `${cwd}: ${command} ${args.join(' ')}\n${result.stdout.slice(-3000)}\n${result.stderr.slice(-3000)}`)
  }
  // npm ci refuses a lockfile that does not match package.json: this is what the pruned lock is for.
  run('frontend', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
  run('desktop', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
  // The frontend lost the mode choice and the export modal: it has to lint, typecheck and pass its own tests.
  for (const script of ['lint', 'typecheck', 'test']) run('frontend', 'npm', ['run', script])
  // The packaged app is what the CI tests read (fuses, the packaged-app proofs): package it first, like the job does.
  for (const script of ['lint', 'typecheck', 'build:frontend', 'build', 'package:dir', 'test']) run('desktop', 'npm', ['run', script])
  if (process.env.DESKTOP_E2E) {
    // Optional (needs the Electron binary and a display): the remote client's end-to-end specs.
    run('desktop', 'node', ['node_modules/electron/install.js'])
    run('desktop', 'npx', ['playwright', 'test'])
  }
  assert.ok(existsSync(join(dir, 'desktop/out/main/index.js')))
  assert.ok(!existsSync(join(dir, 'desktop/out/backend')), 'no local backend in the build')
  const resources = join(dir, 'desktop/release')
  assert.ok(existsSync(resources), 'package:dir left an app')
  assert.ok(!readdirSync(resources, { recursive: true }).some((name) => /(^|\/)backend(\/|$)/.test(String(name))), 'no backend folder in the package')
  // The CI tests of the selected tree (the same ones C14 runs for the Compose and chart files).
  for (const file of ['test_changes.py', 'test_workflow_jobs.py']) {
    const py = spawnSync('python3', [`.github/ci/${file}`], { cwd: dir, encoding: 'utf8' })
    assert.equal(py.status, 0, `${file}\n${py.stdout}${py.stderr}`)
  }
})

test('C14 the copy handed to a container is readable by another user', () => {
  const dir = copy() // mkdtemp creates it 0700; the clone's files can be 0600 under a restrictive umask
  chmodSync(dir, 0o700)
  chmodSync(join(dir, '.github/workflows/release.yml'), 0o600)
  assert.equal(statSync(dir).mode & 0o055, 0, 'precondition: restrictive copy')
  const args = containerArgs(dir)
  assert.equal(statSync(dir).mode & 0o055, 0o055)
  assert.equal(statSync(join(dir, '.github/workflows/release.yml')).mode & 0o044, 0o044)
  assert.deepEqual(args.slice(0, 2), ['--user', `${process.getuid()}:${process.getgid()}`])
})

test('C15 no --stack or an invalid value exits 2 with the usage', () => {
  const dir = copy()
  for (const args of [[], ['--stack', 'go'], ['--stack']]) {
    const result = select(dir, ...args)
    assert.equal(result.status, 2, args.join(' '))
    assert.match(result.stderr, /python\|node/)
  }
})

test('C15 a stack that is already the only one present exits 0 with "already selected" and changes nothing', () => {
  for (const stack of ['python', 'node']) {
    const dir = copy()
    assert.equal(select(dir, '--stack', stack).status, 0)
    const before = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout
    const again = select(dir, '--stack', stack)
    assert.equal(again.status, 0, again.stderr)
    assert.equal(again.stdout.trim(), `already selected: ${stack}`)
    assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout, before)
  }
})

test('C16 a working tree with uncommitted changes exits 1, says so and deletes nothing', () => {
  for (const dirty of [(dir) => appendFileSync(join(dir, 'README.md'), 'edit\n'), (dir) => writeFileSync(join(dir, 'untracked.txt'), 'x\n')]) {
    const dir = copy()
    dirty(dir)
    const result = select(dir, '--stack', 'node')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /working tree not clean/)
    for (const kept of ['backend', 'backend-node', 'contracts']) assert.ok(existsSync(join(dir, kept)), kept)
  }
})
