import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = path.resolve(__dirname, 'check-web-bundle.mjs')
const dirs: string[] = []

function check(source: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'trackzyn-bundle-'))
  dirs.push(dir)
  mkdirSync(path.join(dir, 'assets'))
  writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), source)
  const result = spawnSync('node', [script, dir], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('check-web-bundle', () => {
  it('accepts a bundle that only asks window.trackzyn?.isDesktop', () => {
    expect(check('const a=window.trackzyn?.isDesktop;const b=globalThis.trackzyn?.isDesktop;const c=window["trackzyn"]?.isDesktop').status).toBe(0)
    expect(check('var x=1;console.log("no bridge here")').status).toBe(0)
  })

  it.each([
    ['window.trackzyn.getServerUrl()', 'dot access'],
    ["window['trackzyn'].setServerUrl(u)", 'single-quoted bracket access'],
    ['window["trackzyn"].platform', 'double-quoted bracket access'],
    ['globalThis.trackzyn.platform', 'globalThis dot access'],
    ["globalThis['trackzyn'].platform", 'globalThis bracket access'],
    ['window.trackzyn?.platform', 'optional chain to another member'],
  ])('rejects %s (%s)', (source) => {
    const { status, output } = check(`var a=1;${source};var b=2`)
    expect(status).toBe(1)
    expect(output).toContain('index-abc123.js')
  })

  it('fails when the directory holds no scripts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trackzyn-bundle-'))
    dirs.push(dir)
    expect(spawnSync('node', [script, dir], { encoding: 'utf8' }).status).toBe(2)
  })
})
