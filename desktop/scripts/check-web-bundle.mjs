// Fails when a built bundle reaches for the desktop bridge: the web build may
// only ask `window.trackzyn?.isDesktop` (always undefined in a browser).
// Usage: node scripts/check-web-bundle.mjs <build output directory>
//        node scripts/check-web-bundle.mjs --build   (builds the web app in a temporary directory first)
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let root = process.argv[2]
let builtIn = null
if (root === '--build') {
  const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend')
  builtIn = mkdtempSync(path.join(tmpdir(), 'trackzyn-web-bundle-'))
  const build = spawnSync('npx', ['vite', 'build', '--outDir', builtIn, '--emptyOutDir'], { cwd: frontend, stdio: 'inherit' })
  if (build.status !== 0) {
    rmSync(builtIn, { recursive: true, force: true })
    console.error('the web build failed')
    process.exit(2)
  }
  root = builtIn
}
if (!root) {
  console.error('usage: check-web-bundle.mjs <directory> | --build')
  process.exit(2)
}

function* scripts(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) yield* scripts(full)
    else if (/\.(js|mjs|cjs)$/.test(name)) yield full
  }
}

let files = 0
const violations = []
for (const file of scripts(root)) {
  files += 1
  const text = readFileSync(file, 'utf8')
  // window.trackzyn, window['trackzyn'], globalThis.trackzyn, ... unless it is only asked for ?.isDesktop.
  for (const match of text.matchAll(/\b(?:window|globalThis)(?:\.trackzyn|\[\s*['"`]trackzyn['"`]\s*\])(?!\?\.isDesktop)/g)) {
    violations.push(`${file}: ${text.slice(Math.max(0, match.index - 30), match.index + 60).replace(/\s+/g, ' ')}`)
  }
}

if (builtIn) rmSync(builtIn, { recursive: true, force: true })

if (files === 0) {
  console.error(`no scripts found in ${root}`)
  process.exit(2)
}
if (violations.length > 0) {
  console.error(`The bundle references window.trackzyn beyond ?.isDesktop (${violations.length}):`)
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}
console.log(`ok: ${files} scripts, no window.trackzyn reference besides ?.isDesktop`)
