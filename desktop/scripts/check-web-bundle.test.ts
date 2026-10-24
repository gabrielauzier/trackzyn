import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = path.resolve(__dirname, 'check-web-bundle.mjs')
const dirs: string[] = []

function check(source: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'launchkit-bundle-'))
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
  it('accepts a bundle that only asks window.launchkit?.isDesktop', () => {
    expect(check('const a=window.launchkit?.isDesktop;const b=globalThis.launchkit?.isDesktop;const c=window["launchkit"]?.isDesktop').status).toBe(0)
    expect(check('var x=1;console.log("no bridge here")').status).toBe(0)
  })

  it.each([
    ['window.launchkit.getServerUrl()', 'dot access'],
    ["window['launchkit'].setServerUrl(u)", 'single-quoted bracket access'],
    ['window["launchkit"].platform', 'double-quoted bracket access'],
    ['globalThis.launchkit.platform', 'globalThis dot access'],
    ["globalThis['launchkit'].platform", 'globalThis bracket access'],
    ['window.launchkit?.platform', 'optional chain to another member'],
  ])('rejects %s (%s)', (source) => {
    const { status, output } = check(`var a=1;${source};var b=2`)
    expect(status).toBe(1)
    expect(output).toContain('index-abc123.js')
  })

  it('fails when the directory holds no scripts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'launchkit-bundle-'))
    dirs.push(dir)
    expect(spawnSync('node', [script, dir], { encoding: 'utf8' }).status).toBe(2)
  })
})
