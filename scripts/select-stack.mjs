#!/usr/bin/env node
// Leaves a project made from this template with one backend stack.
//
//   node scripts/select-stack.mjs --stack python|node
//
// Exit codes: 0 done (or already selected), 1 failure (including a dirty working tree), 2 usage.
//
// What it does, in order:
//   1. deletes the other stack's directories and the files that only make sense with both stacks;
//   2. in every tracked text file, handles blocks fenced by lines that contain
//        select-stack:begin <python|node|multi>   ...   select-stack:end
//      a block is kept (markers removed, `#~ text` lines turned into `text`) when it names the
//      chosen stack and dropped otherwise; `multi` blocks are always dropped;
//   3. resolves the chart's stack conditionals and the BACKEND_STACK include in the Compose files;
//   4. edits renovate.json;
//   5. for Python, makes the desktop app a remote client: package.json and its lockfile lose the local
//      mode's packages and the locales lose its strings.
// Besides `#~`, a line starting with `//~` is uncommented in a kept block (for files where `#` is not a comment).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STACKS = ['python', 'node']
const USAGE = 'Usage: node scripts/select-stack.mjs --stack python|node'

// What exists only for the desktop app's local mode (it embeds backend-node): a Python project keeps the
// desktop as a remote client, without any of it.
const DESKTOP_LOCAL_MODE = [
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
// Packages only the local mode's backend bundle needs.
const DESKTOP_LOCAL_PACKAGES = { dependencies: ['@electric-sql/pglite', '@node-rs/argon2'], devDependencies: ['esbuild'] }

const REMOVE = {
  python: ['backend-node', 'contracts', 'compose/dev/node.yml', 'compose/prod/node.yml', 'scripts/stack', ...DESKTOP_LOCAL_MODE],
  node: ['backend', 'contracts', 'compose/dev/python.yml', 'compose/prod/python.yml', 'scripts/stack', '.pre-commit-config.yaml'],
}
// Never rewritten: documentation, the other source trees, lockfiles and this tool.
const SKIP_PREFIXES = ['docs/', '.tasks/', '.checks/', 'backend/', 'backend-node/', 'contracts/', 'scripts/stack/', 'scripts/select-stack.mjs']

function fail(code, message) {
  console.error(message)
  process.exit(code)
}

function parseArgs(argv) {
  let stack
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--stack') stack = argv[(i += 1)]
    else if (arg.startsWith('--stack=')) stack = arg.slice('--stack='.length)
    else fail(2, `Unknown option: ${arg}\n${USAGE}`)
  }
  if (!STACKS.includes(stack)) fail(2, `${stack === undefined ? 'Missing --stack' : `Unsupported stack: ${stack}`}\n${USAGE}`)
  return stack
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

export function applyMarkers(text, stack) {
  const out = []
  let block = null
  for (const line of text.split('\n')) {
    const begin = line.match(/select-stack:begin\s+(python|node|multi)\b/)
    if (begin) {
      block = begin[1]
      continue
    }
    if (block !== null && /select-stack:end\b/.test(line)) {
      block = null
      continue
    }
    if (block === null) out.push(line)
    else if (block === stack) out.push(line.replace(/^(\s*)(?:#~|\/\/~) ?/, '$1'))
  }
  return out.join('\n')
}

const STACK_IF =
  /(\{\{-?)\s*if eq \(include "trackzyn\.backendStack" \.\) "node"\s*(-?\}\})([\s\S]*?)(\{\{-?)\s*else\s*(-?\}\})([\s\S]*?)(\{\{-?)\s*end\s*(-?\}\})/

/** Resolves `{{ if eq (include "trackzyn.backendStack" .) "node" }}A{{ else }}B{{ end }}` with Go's trim rules. */
export function resolveChart(text, stack) {
  let result = text
  for (let match = STACK_IF.exec(result); match; match = STACK_IF.exec(result)) {
    const [whole, open, afterIf, ifBody, openElse, afterElse, elseBody, openEnd, afterEnd] = match
    let before = result.slice(0, match.index)
    let after = result.slice(match.index + whole.length)
    if (open === '{{-') before = before.replace(/\s+$/, '')
    if (afterEnd === '-}}') after = after.replace(/^\s+/, '')
    let chosen
    if (stack === 'node') {
      chosen = ifBody
      if (afterIf === '-}}') chosen = chosen.replace(/^\s+/, '')
      if (openElse === '{{-') chosen = chosen.replace(/\s+$/, '')
    } else {
      chosen = elseBody
      if (afterElse === '-}}') chosen = chosen.replace(/^\s+/, '')
      if (openEnd === '{{-') chosen = chosen.replace(/\s+$/, '')
    }
    result = before + chosen + after
  }
  result = result.replaceAll(
    '{{ include "trackzyn.backendImage" . }}',
    '{{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag }}',
  )
  if (stack === 'node') {
    result = result
      .replaceAll('celeryWorker', 'worker')
      .replaceAll('celeryBeat', 'scheduler')
      .replaceAll('Celery Worker', 'Worker')
      .replaceAll('Celery Beat', 'Scheduler')
  }
  return result
}

/** desktop/package.json for a project without the local mode: no backend bundle, no embedded database. */
export function editDesktopPackage(text, stack) {
  if (stack !== 'python') return text
  const pkg = JSON.parse(text)
  for (const [section, names] of Object.entries(DESKTOP_LOCAL_PACKAGES)) for (const name of names) delete pkg[section]?.[name]
  delete pkg.scripts['build:backend']
  pkg.scripts['build:all'] = 'npm run build:frontend && npm run build'
  return `${JSON.stringify(pkg, null, 2)}\n`
}

/**
 * desktop/package-lock.json to match: the removed packages leave the root, then everything no longer
 * reachable from the root leaves with them (`npm ci` refuses a lockfile that does not match package.json).
 */
export function editDesktopLock(text, stack) {
  if (stack !== 'python') return text
  const lock = JSON.parse(text)
  const root = lock.packages['']
  for (const [section, names] of Object.entries(DESKTOP_LOCAL_PACKAGES)) for (const name of names) delete root[section]?.[name]
  const resolve = (name, from) => {
    for (let base = from; ; base = base.includes('/node_modules/') ? base.slice(0, base.lastIndexOf('/node_modules/')) : '') {
      const candidate = `${base === '' ? '' : `${base}/`}node_modules/${name}`
      if (lock.packages[candidate]) return candidate
      if (base === '') return null
    }
  }
  const seen = new Set([''])
  const queue = ['']
  while (queue.length > 0) {
    const from = queue.pop()
    const entry = lock.packages[from]
    const sections = from === '' ? ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] : ['dependencies', 'optionalDependencies', 'peerDependencies']
    for (const section of sections) {
      for (const name of Object.keys(entry[section] ?? {})) {
        const target = resolve(name, from)
        if (target !== null && !seen.has(target)) {
          seen.add(target)
          queue.push(target)
        }
      }
    }
  }
  lock.packages = Object.fromEntries(Object.entries(lock.packages).filter(([key]) => seen.has(key)))
  return `${JSON.stringify(lock, null, 2)}\n`
}

/** The locales without the local mode's strings (the mode choice, export and import, their menu items). */
export function editLocales(text, stack) {
  if (stack !== 'python') return text
  const locale = JSON.parse(text)
  if (locale.desktop) {
    delete locale.desktop.mode
    delete locale.desktop.transfer
    delete locale.desktop.menu?.exportData
    delete locale.desktop.menu?.importData
  }
  return `${JSON.stringify(locale, null, 2)}\n`
}

export function editRenovate(text, stack) {
  if (stack !== 'node') return text
  const config = JSON.parse(text)
  config.packageRules = (config.packageRules ?? []).filter((rule) => !(rule.matchManagers ?? []).includes('pep621'))
  config.customManagers = (config.customManagers ?? []).filter(
    (manager) => !(manager.fileMatch ?? []).some((pattern) => pattern.includes('backend/')),
  )
  if (config.customManagers.length === 0) delete config.customManagers
  return `${JSON.stringify(config, null, 2)}\n`
}

function main() {
  const stack = parseArgs(process.argv.slice(2))
  const other = stack === 'python' ? 'node' : 'python'
  const dirs = { python: 'backend', node: 'backend-node' }

  if (existsSync(join(ROOT, dirs[stack])) && !existsSync(join(ROOT, dirs[other]))) {
    console.log(`already selected: ${stack}`)
    return
  }
  if (!existsSync(join(ROOT, dirs[stack]))) fail(1, `select-stack: ${dirs[stack]}/ does not exist, nothing to select`)

  let dirty
  try {
    dirty = git('status', '--porcelain')
  } catch {
    fail(1, 'select-stack: not a git working tree')
  }
  if (dirty.trim() !== '') fail(1, 'working tree not clean')

  const tracked = git('ls-files', '-z').split('\0').filter(Boolean)

  for (const path of REMOVE[stack]) rmSync(join(ROOT, path), { recursive: true, force: true })

  let updated = 0
  for (const path of tracked) {
    const file = join(ROOT, path)
    if (!existsSync(file) || SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) continue
    if (path === 'desktop/package-lock.json') {
      const text = editDesktopLock(readFileSync(file, 'utf8'), stack)
      if (text !== readFileSync(file, 'utf8')) {
        writeFileSync(file, text)
        updated += 1
      }
      continue
    }
    if (path.endsWith('package-lock.json')) continue
    const buffer = readFileSync(file)
    if (buffer.includes(0)) continue
    const original = buffer.toString('utf8')
    let text = applyMarkers(original, stack)
    if (path.startsWith('charts/')) text = resolveChart(text, stack)
    if (/^docker-compose.*\.yml$/.test(path)) text = text.replaceAll('${BACKEND_STACK:-python}', stack)
    if (path === 'renovate.json') text = editRenovate(text, stack)
    if (path === 'desktop/package.json') text = editDesktopPackage(text, stack)
    if (/^frontend\/src\/locales\/[\w-]+\.json$/.test(path)) text = editLocales(text, stack)
    if (text !== original) {
      writeFileSync(file, text)
      updated += 1
    }
  }

  for (const path of tracked) {
    if (!path.startsWith('charts/') || !existsSync(join(ROOT, path))) continue
    if (readFileSync(join(ROOT, path), 'utf8').includes('trackzyn.backendStack')) fail(1, `select-stack: unresolved stack conditional in ${path}`)
  }

  console.log(`selected: ${stack}`)
  console.log(`removed: ${REMOVE[stack].join(', ')}`)
  console.log(`updated: ${updated} files`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    fail(1, `select-stack failed: ${error instanceof Error ? error.message : error}`)
  }
}
