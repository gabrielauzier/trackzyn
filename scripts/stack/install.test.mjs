// Proof C11: install.sh --stack, with a fake `docker` that resolves the images the real Compose would pull.
//   node --test --test-name-pattern='^C11 ' scripts/stack/install.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './lib.mjs'

const REAL_DOCKER = spawnSync('which', ['docker'], { encoding: 'utf8' }).stdout.trim()

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 't02-install-'))
  cpSync(join(ROOT, 'docker-compose.prod.yml'), join(dir, 'docker-compose.prod.yml'))
  cpSync(join(ROOT, 'compose'), join(dir, 'compose'), { recursive: true })
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh
case "$1" in
  version) echo "Docker version 28" ;;
  info) exit 0 ;;
  compose)
    case "$2" in
      version) echo "Docker Compose version v2.34.0" ;;
      *) echo "$@" >> "$FAKE_LOG"
         for last; do :; done
         if [ "$last" = pull ]; then "${REAL_DOCKER}" compose -f docker-compose.prod.yml config --images >> "$FAKE_LOG"; fi ;;
    esac ;;
esac
`,
  )
  writeFileSync(join(bin, 'curl'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(bin, 'docker'), 0o755)
  chmodSync(join(bin, 'curl'), 0o755)
  return { dir, bin, log: join(dir, 'fake.log') }
}

function install(args) {
  const box = sandbox()
  const env = { ...process.env, PATH: `${box.bin}:${process.env.PATH}`, FAKE_LOG: box.log, LAUNCHKIT_IMAGE_PREFIX: 'ghcr.io/acme/launchkit' }
  delete env.BACKEND_STACK
  const result = spawnSync('bash', [join(ROOT, 'install.sh'), ...args], { cwd: box.dir, env, encoding: 'utf8' })
  const read = (file) => {
    try {
      return readFileSync(join(box.dir, file), 'utf8')
    } catch {
      return ''
    }
  }
  return { result, env: read('.env'), log: read('fake.log') }
}

test('C11 --stack node writes BACKEND_STACK=node and pulls launchkit-backend-node', () => {
  const { result, env, log } = install(['--stack', 'node'])
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.match(env, /^BACKEND_STACK=node$/m)
  assert.match(log, /ghcr\.io\/acme\/launchkit-backend-node:latest/)
  assert.doesNotMatch(log, /launchkit-backend:latest/)
})

test('C11 without --stack the install is the one of today (python)', () => {
  const { result, env, log } = install([])
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.doesNotMatch(env, /BACKEND_STACK=node/)
  assert.match(log, /ghcr\.io\/acme\/launchkit-backend:latest/)
  assert.doesNotMatch(log, /backend-node/)
})

test('C11 --stack go exits 2 and lists python and node', () => {
  const { result } = install(['--stack', 'go'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /python/)
  assert.match(result.stderr, /node/)
})
