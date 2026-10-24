// Helpers for the stack proofs: a Compose project per case (prefix t02-), free host ports, health waits.
import { execFileSync, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

/** A throwaway Compose project: `docker compose -p t02-<name>` on random host ports. */
export async function project(name, { stack, file = 'docker-compose.yml', extraEnv = {} } = {}) {
  const env = { ...process.env, SECRET_KEY: 'stack-proof-secret', ...extraEnv }
  delete env.BACKEND_STACK
  if (stack !== undefined) env.BACKEND_STACK = stack
  env.FRONTEND_PORT = String(await freePort())
  env.BACKEND_PORT = String(await freePort())
  const base = ['compose', '-p', `t02-${name}`, '-f', file]
  const run = (args, options = {}) =>
    spawnSync('docker', [...base, ...args], { cwd: ROOT, env: { ...env, ...options.env }, encoding: 'utf8', input: options.input })
  const must = (args, options) => {
    const result = run(args, options)
    if (result.status !== 0) throw new Error(`docker ${args.join(' ')} failed (${result.status}):\n${result.stdout}\n${result.stderr}`)
    return result.stdout
  }
  return {
    env,
    frontend: `http://127.0.0.1:${env.FRONTEND_PORT}`,
    api: `http://127.0.0.1:${env.BACKEND_PORT}`,
    run,
    must,
    up: (...extra) => must(['up', '--build', '-d', ...extra]),
    running: () => must(['ps', '--services', '--status', 'running']).split('\n').filter(Boolean).sort(),
    sql: (query) => must(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'launchkit', '-Atc', query]).trim(),
    down: (volumes = true) => run(['down', ...(volumes ? ['-v'] : []), '--remove-orphans', '-t', '2']),
  }
}

export async function waitForHealth(url, { timeoutMs = 300_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.status === 200) return await response.json()
      last = `status ${response.status}`
    } catch (error) {
      last = String(error?.cause?.code ?? error)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`${url}/api/health never answered 200 (${last})`)
}

export function dockerLogs(name) {
  return spawnSync('docker', ['compose', '-p', `t02-${name}`, 'logs', '--no-color', '--tail', '200'], { cwd: ROOT, encoding: 'utf8' }).stdout
}

export function sh(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options })
}

/**
 * Docker arguments for tools that read a directory we created: the copy is made world readable and the
 * container runs as the caller, so a runner whose uid differs from the image's user (0700 temp dirs,
 * 0600 files) still reads and writes it. HOME points at a writable place for helm's cache.
 */
export function containerArgs(dir) {
  execFileSync('chmod', ['-R', 'u+rwX,go+rX', dir])
  return ['--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp', '-v', `${dir}:/w`, '-w', '/w']
}

export function dockerRun(dir, image, args, options = {}) {
  return spawnSync('docker', ['run', '--rm', ...containerArgs(dir), image, ...args], { encoding: 'utf8', ...options })
}
