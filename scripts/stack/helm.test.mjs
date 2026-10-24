// Proofs C8-C9: the Helm chart per backend stack, rendered with the alpine/helm image.
//   node --test --test-name-pattern='^C8 ' scripts/stack/helm.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT, dockerRun, sh } from './lib.mjs'

// The chart as it was before the stack choice existed (task 02 branch point).
const BASELINE_COMMIT = '91cc000'

function helm(dir, ...args) {
  const result = dockerRun(dir, 'alpine/helm:4.3.0', args)
  if (result.status !== 0) throw new Error(`helm ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`)
  return result.stdout
}

test('C8 backend.stack=node renders the Node image and commands, no celery or alembic, and lints', () => {
  const out = helm(ROOT, 'template', 'rel', 'charts/launchkit', '--set', 'backend.stack=node')
  assert.match(out, /image: "ghcr\.io\/your-org\/launchkit-backend-node:latest"/)
  assert.ok(!out.includes('image: "ghcr.io/your-org/launchkit-backend:'))
  for (const command of ['node dist/migrate.js', '- dist/server.js', '- dist/worker.js', '- dist/scheduler.js']) {
    assert.ok(out.includes(command), `missing ${command}`)
  }
  assert.doesNotMatch(out, /celery|alembic/i)
  helm(ROOT, 'lint', 'charts/launchkit', '--set', 'backend.stack=node')
})

test('C9 backend.stack=python (and the default) renders exactly what the chart rendered before', () => {
  const work = mkdtempSync(join(tmpdir(), 't02-helm-'))
  sh('sh', ['-c', `git archive ${BASELINE_COMMIT} charts | tar -x -C "${work}"`])
  const before = helm(work, 'template', 'rel', 'charts/launchkit')
  assert.match(before, /celery -A app\.worker worker|- celery/)
  assert.equal(helm(ROOT, 'template', 'rel', 'charts/launchkit'), before)
  assert.equal(helm(ROOT, 'template', 'rel', 'charts/launchkit', '--set', 'backend.stack=python'), before)
})
