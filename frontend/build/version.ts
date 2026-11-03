import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const semverPattern = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function runLocalGit(projectRoot: string, args: string[]) {
  return execFileSync('git', ['-c', `safe.directory=${projectRoot}`, ...args], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
}

function normalizeVersionLabel(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (semverPattern.test(trimmed)) return trimmed.startsWith('v') ? trimmed : `v${trimmed}`
  return trimmed
}

function tryGit(projectRoot: string, args: string[]) {
  try {
    return runLocalGit(projectRoot, args) || null
  } catch {
    // Not a git checkout (e.g. an ejected copy before `git init`).
    return null
  }
}

function packageVersion(projectRoot: string) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as {
      version?: string
    }
    return normalizeVersionLabel(pkg.version)
  } catch {
    return null
  }
}

/**
 * The version label shown in the sidebar, resolved at build time without any
 * network access:
 *   1. VITE_APP_VERSION, when the build pipeline passes one;
 *   2. the git tag on HEAD, when HEAD is exactly a semver tag;
 *   3. package.json's version, suffixed with the short commit when in git;
 *   4. "dev".
 */
export async function resolveAppVersion(projectRoot: string, explicitVersion?: string) {
  const explicit = normalizeVersionLabel(explicitVersion)
  if (explicit) return explicit

  const tag = tryGit(projectRoot, ['describe', '--tags', '--exact-match'])
  if (tag && semverPattern.test(tag)) return normalizeVersionLabel(tag)!

  const base = packageVersion(projectRoot)
  const sha = tryGit(projectRoot, ['rev-parse', '--short', 'HEAD'])
  if (base && sha) return `${base}+${sha}`
  return base ?? sha ?? 'dev'
}
