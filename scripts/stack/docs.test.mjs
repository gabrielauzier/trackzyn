// Proof C19: the "Trocar de stack" section of the self-hosting guide.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './lib.mjs'

test('C19 "Trocar de stack" lists backup, BACKEND_STACK switch, health check and rollback, in that order', () => {
  const guide = readFileSync(join(ROOT, 'deploy/public/README.md'), 'utf8')
  const start = guide.search(/^## Trocar de stack$/m)
  assert.ok(start >= 0, 'section not found')
  const rest = guide.slice(start + 1)
  const next = rest.search(/^## /m)
  const section = next < 0 ? rest : rest.slice(0, next)
  const steps = [...section.matchAll(/^(\d+)\. \*\*([^*]+)\*\*(.*)$/gm)]
  assert.deepEqual(
    steps.map((m) => m[1]),
    ['1', '2', '3', '4'],
  )
  assert.match(steps[0][0], /deploy\/public\/backup\/backup\.sh/)
  assert.match(steps[1][2] + steps[1][3], /BACKEND_STACK/)
  assert.match(steps[2][2], /GET \/api\/health/)
  assert.match(steps[3][2], /Voltar atrás/)
})
