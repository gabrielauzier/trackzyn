// Proofs C1-C6 (and, later, C7, C17, C18): the Compose stacks. Run one case with
//   node --test --test-name-pattern='^C1 ' scripts/stack/stack.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT, dockerLogs, project, waitForHealth } from './lib.mjs'

const NODE_SERVICES = ['backend-node', 'db', 'frontend', 'redis', 'scheduler-node', 'worker-node']
const PYTHON_SERVICES = ['backend', 'celery-beat', 'celery-worker', 'db', 'frontend', 'redis']
const TABLES = ['app_settings', 'files', 'user_passkeys', 'users', 'workspace_members', 'workspaces']
const TIMEOUT = { timeout: 900_000 }

async function upAndWait(name, options) {
  const p = await project(name, options)
  try {
    p.up()
    const body = await waitForHealth(p.frontend)
    return { p, body }
  } catch (error) {
    console.error(dockerLogs(name))
    p.down()
    throw error
  }
}

test('C1 BACKEND_STACK=node starts the six Node services and no Python service', TIMEOUT, async () => {
  const { p } = await upAndWait('c1', { stack: 'node' })
  try {
    assert.deepEqual(p.running(), NODE_SERVICES)
    for (const python of ['backend', 'celery-worker', 'celery-beat']) assert.ok(!p.running().includes(python))
  } finally {
    p.down()
  }
})

for (const [label, stack] of [['python', 'python'], ['absent', undefined]]) {
  test(`C2 BACKEND_STACK ${label} starts the six Python services and no Node service`, TIMEOUT, async () => {
    const { p } = await upAndWait(`c2-${label}`, { stack })
    try {
      assert.deepEqual(p.running(), PYTHON_SERVICES)
    } finally {
      p.down()
    }
  })
}

test('C3 BACKEND_STACK=go makes docker compose up fail before creating containers, pointing at go.yml', TIMEOUT, async () => {
  const p = await project('c3', { stack: 'go' })
  try {
    const result = p.run(['up', '--build', '-d'])
    assert.notEqual(result.status, 0)
    assert.match(result.stdout + result.stderr, /go\.yml/)
    const created = spawnSync('docker', ['ps', '-a', '-q', '--filter', 'label=com.docker.compose.project=t02-c3'], { encoding: 'utf8' })
    assert.equal(created.stdout.trim(), '')
  } finally {
    p.down()
  }
})

const GO_MESSAGE = /BACKEND_STACK must be python or node \(got: go\)/

function scriptsRefuseGo() {
  const dir = mkdtempSync(join(tmpdir(), 't02-c3-'))
  const envFile = join(dir, 'env')
  writeFileSync(envFile, 'SECRET_KEY=x\nBACKEND_STACK=go\n')
  const env = { ...process.env }
  delete env.BACKEND_STACK
  return {
    preflight: spawnSync('sh', [join(ROOT, 'scripts/stack/preflight.sh'), envFile], { env, encoding: 'utf8' }),
    launchkitCompose: spawnSync(join(ROOT, 'deploy/public/launchkit-compose'), ['config', '-q'], {
      env: { ...env, LAUNCHKIT_ENV_FILE: envFile },
      encoding: 'utf8',
    }),
    install: spawnSync('bash', [join(ROOT, 'install.sh')], {
      cwd: dir,
      env: { ...env, BACKEND_STACK: 'go', PATH: `${fakeDockerBin(dir)}:${process.env.PATH}` },
      encoding: 'utf8',
    }),
  }
}

function fakeDockerBin(dir) {
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\ncase "$1" in version) echo Docker;; info) exit 0;; compose) [ "$2" = version ] && echo v2.34;; esac\n')
  writeFileSync(join(bin, 'curl'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(bin, 'docker'), 0o755)
  chmodSync(join(bin, 'curl'), 0o755)
  writeFileSync(join(dir, 'docker-compose.prod.yml'), 'services: {}\n')
  return bin
}

for (const name of ['preflight', 'launchkitCompose', 'install']) {
  test(`C3 ${name} prints the BACKEND_STACK message and exits 2 for go`, () => {
    const result = scriptsRefuseGo()[name]
    assert.equal(result.status, 2, result.stdout + result.stderr)
    assert.match(result.stderr, GO_MESSAGE)
  })
}

// The environment wins over the env file, like in Compose (no Docker needed: a fake `docker` exits 0).
function precedence(envValue, fileValue) {
  const dir = mkdtempSync(join(tmpdir(), 't02-c3p-'))
  const envFile = join(dir, 'env')
  writeFileSync(envFile, `SECRET_KEY=x\nBACKEND_STACK=${fileValue}\n`)
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(bin, 'docker'), 0o755)
  const env = { ...process.env, BACKEND_STACK: envValue, PATH: `${bin}:${process.env.PATH}`, LAUNCHKIT_ENV_FILE: envFile }
  return {
    preflight: spawnSync('sh', [join(ROOT, 'scripts/stack/preflight.sh'), envFile], { env, encoding: 'utf8' }),
    launchkitCompose: spawnSync(join(ROOT, 'deploy/public/launchkit-compose'), ['config', '-q'], { env, encoding: 'utf8' }),
  }
}

for (const name of ['preflight', 'launchkitCompose']) {
  test(`C3 ${name}: BACKEND_STACK=go in the environment is refused even when the env file says node`, () => {
    const result = precedence('go', 'node')[name]
    assert.equal(result.status, 2, result.stdout + result.stderr)
    assert.match(result.stderr, GO_MESSAGE)
  })

  test(`C3 ${name}: BACKEND_STACK=node in the environment wins over go in the env file (Compose rule)`, () => {
    const result = precedence('node', 'go')[name]
    assert.equal(result.status, 0, result.stdout + result.stderr)
  })
}

test('C3 python, node and an unset BACKEND_STACK pass the preflight', () => {
  for (const value of ['python', 'node', undefined]) {
    const env = { ...process.env }
    delete env.BACKEND_STACK
    if (value) env.BACKEND_STACK = value
    const result = spawnSync('sh', [join(ROOT, 'scripts/stack/preflight.sh'), '/nonexistent'], { env, encoding: 'utf8' })
    assert.equal(result.status, 0, `${value}: ${result.stderr}`)
  }
})

test('C4 BACKEND_STACK=node answers /api/health through the frontend and the frontend reaches http://backend:8000', TIMEOUT, async () => {
  const { p, body } = await upAndWait('c4', { stack: 'node' })
  try {
    assert.deepEqual(body, { status: 'healthy' })
    const inside = p.must(['exec', '-T', 'frontend', 'node', '-e', "fetch('http://backend:8000/api/health').then(async r => console.log(r.status, await r.text()))"])
    assert.match(inside.trim(), /^200 \{"status":"healthy"\}$/)
  } finally {
    p.down()
  }
})

test('C5 on an empty database the six tables exist at the first 200 and a restart reruns the migration without DDL', TIMEOUT, async () => {
  const p = await project('c5', { stack: 'node' })
  try {
    p.up()
    await waitForHealth(p.frontend)
    const tables = () => p.sql("select table_name from information_schema.tables where table_schema='public' order by 1").split('\n')
    assert.deepEqual(tables(), TABLES)
    // pg_dump >= 16.10 writes a random \restrict token on every run.
    const dump = () =>
      p
        .must(['exec', '-T', 'db', 'pg_dump', '-U', 'postgres', '-d', 'launchkit', '--schema-only', '--schema=public'])
        .split('\n')
        .filter((line) => !/^\\(un)?restrict /.test(line))
        .join('\n')
    const before = dump()
    p.must(['restart', 'backend-node'])
    await waitForHealth(p.frontend)
    const applied = p.must(['logs', '--no-color', 'backend-node']).match(/migrations applied/g) ?? []
    assert.equal(applied.length, 2)
    assert.equal(dump(), before)
    assert.deepEqual(tables(), TABLES)
  } finally {
    p.down()
  }
})

test('C6 a failing migration exits non-zero and the API never starts', TIMEOUT, async () => {
  const p = await project('c6', { stack: 'node' })
  try {
    p.must(['up', '--build', '-d', '--wait', 'db', 'redis'])
    const result = p.run(['run', '--rm', '--no-deps', '-e', 'DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/does_not_exist', 'backend-node'])
    assert.notEqual(result.status, 0)
    assert.doesNotMatch(result.stdout + result.stderr, /listening/i)
  } finally {
    p.down()
  }
})

test('C7 the production file runs the <IMAGE_PREFIX>/launchkit-backend-node image for node and no Python service', async () => {
  const extraEnv = { IMAGE_PREFIX: 'ghcr.io/acme/launchkit', APP_VERSION: '1.2.3' }
  const services = async (stack) => {
    const p = await project('c7', { stack, file: 'docker-compose.prod.yml', extraEnv })
    return JSON.parse(p.must(['config', '--format', 'json'])).services
  }
  const node = await services('node')
  assert.deepEqual(Object.keys(node).sort(), NODE_SERVICES)
  for (const name of ['backend-node', 'worker-node', 'scheduler-node']) {
    assert.equal(node[name].image, 'ghcr.io/acme/launchkit-backend-node:1.2.3')
  }
  const python = await services('python')
  assert.deepEqual(Object.keys(python).sort(), PYTHON_SERVICES)
  assert.equal(python.backend.image, 'ghcr.io/acme/launchkit-backend:1.2.3')
})

// ── C17 / C18: switching the stack over the same volumes ────────────────────────────────────────
const EMAIL = 'switch@example.com'
const PASSWORD = 'correct-horse-battery'

async function call(p, path, { token, workspace, ...init } = {}) {
  const headers = { ...(init.headers ?? {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  if (workspace) headers['X-Workspace-Id'] = workspace
  const response = await fetch(`${p.frontend}${path}`, { ...init, headers })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function login(p) {
  const response = await call(p, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: EMAIL, password: PASSWORD }),
  })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return response.body.access_token
}

async function snapshot(p, token) {
  const workspaces = await call(p, '/api/workspaces', { token })
  const files = await call(p, '/api/files', { token })
  assert.equal(workspaces.status, 200)
  assert.equal(files.status, 200)
  return { workspaces: workspaces.body.map((w) => w.id).sort(), files: files.body.map((f) => f.id).sort() }
}

async function addFile(p, token, name) {
  const form = new FormData()
  form.append('file', new Blob(['%PDF-1.4 switch proof']), name)
  const response = await call(p, '/api/files', { method: 'POST', token, body: form })
  assert.equal(response.status, 201, JSON.stringify(response.body))
}

async function switchTo(p, stack) {
  p.down(false)
  p.env.BACKEND_STACK = stack
  p.up()
  await waitForHealth(p.frontend)
}

/** A Python installation with 1 user, 1 workspace and 1 file. */
async function pythonInstallation(name) {
  const p = await project(name, { stack: 'python' })
  p.up()
  await waitForHealth(p.frontend)
  const created = await call(p, '/api/setup/create-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  assert.equal(created.status, 200, JSON.stringify(created.body))
  await addFile(p, created.body.access_token, 'first.pdf')
  const python = await snapshot(p, created.body.access_token)
  assert.equal(python.workspaces.length, 1)
  assert.equal(python.files.length, 1)
  return { p, python }
}

test('C17 after switching a Python installation to node the user logs in and sees the same workspaces and files', TIMEOUT, async () => {
  const { p, python } = await pythonInstallation('c17')
  try {
    await switchTo(p, 'node')
    assert.deepEqual(await snapshot(p, await login(p)), python)
  } finally {
    p.down()
  }
})

test('C18 after use on node, going back to python keeps the items created on node', TIMEOUT, async () => {
  const { p, python } = await pythonInstallation('c18')
  try {
    await switchTo(p, 'node')
    const token = await login(p)
    await addFile(p, token, 'second.pdf')
    const created = await call(p, '/api/workspaces', {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Created on node' }),
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const onNode = await snapshot(p, token)
    assert.equal(onNode.files.length, python.files.length + 1)
    assert.equal(onNode.workspaces.length, python.workspaces.length + 1)

    await switchTo(p, 'python')
    assert.deepEqual(await snapshot(p, await login(p)), onNode)
  } finally {
    p.down()
  }
})
