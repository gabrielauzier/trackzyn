import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from './support/config'

const TESTS_DIR = import.meta.dirname

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

describe('suite hygiene', () => {
  it('C4 no case is skipped or conditioned on the stack', () => {
    const offenders: string[] = []
    for (const file of files(TESTS_DIR).filter((f) => f.endsWith('.test.ts'))) {
      if (file === import.meta.filename) continue
      const source = readFileSync(file, 'utf8')
      const patterns = [
        /\.(skip|skipIf|todo|only|runIf)\b/,
        /\b(?:xit|xdescribe|xtest)\b/,
        /stack\s*(?:===|!==|==|!=)\s*['"](?:python|node)['"]/,
        /inject\(['"]stack['"]\)/,
        /CONTRACT_STACK/,
      ]
      for (const pattern of patterns) {
        if (pattern.test(source)) offenders.push(`${relative(TESTS_DIR, file)}: ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('C25 every python case of test_oidc_auth, test_passkeys and test_two_factor has a contract case', () => {
    const parityMap = JSON.parse(readFileSync(join(TESTS_DIR, '../parity-map.json'), 'utf8')) as Record<
      string,
      Record<string, string[]>
    >

    // Every title a contract test declares with a literal string.
    const titles = new Set<string>()
    for (const file of files(TESTS_DIR).filter((f) => f.endsWith('.test.ts'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bit\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) titles.add(match[2])
    }

    const problems: string[] = []
    for (const [file, mapped] of Object.entries(parityMap)) {
      const source = readFileSync(join(REPO_ROOT, 'backend/tests', file), 'utf8')
      const pythonCases = [...source.matchAll(/^(?:async )?def (test_\w+)\(/gm)].map((m) => m[1])
      expect(pythonCases.length, `${file} has no cases`).toBeGreaterThan(0)
      for (const name of pythonCases) {
        const contractTitles = mapped[name]
        if (!contractTitles?.length) problems.push(`${file}::${name} has no entry in parity-map.json`)
        for (const title of contractTitles ?? []) {
          if (!titles.has(title)) problems.push(`${file}::${name} maps to a missing contract case "${title}"`)
        }
      }
      for (const name of Object.keys(mapped)) {
        if (!pythonCases.includes(name)) problems.push(`parity-map.json lists ${file}::${name}, which does not exist`)
      }
    }
    expect(Object.keys(parityMap).sort()).toEqual(['test_oidc_auth.py', 'test_passkeys.py', 'test_two_factor.py'])
    expect(problems).toEqual([])
  })
})
