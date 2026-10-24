import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const config = parse(readFileSync(path.resolve(__dirname, '../electron-builder.yml'), 'utf8')) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function targetNames(section: unknown): string[] {
  const targets = (section as { target?: unknown[] }).target ?? []
  return targets.map((target) => (typeof target === 'string' ? target : (target as { target: string }).target))
}

describe('electron-builder config', () => {
  it('builder targets and app id', () => {
    expect(config.appId).toBe('com.launchkit.desktop')
    expect(targetNames(config.mac).sort()).toEqual(['dmg', 'zip'])
    expect(targetNames(config.win)).toEqual(['nsis'])
    expect(targetNames(config.linux).sort()).toEqual(['AppImage', 'deb'])
  })

  it('does not depend on release variables, so unpublished builds need none', () => {
    expect(config.publish).toBeUndefined()
    expect(JSON.stringify(config)).not.toContain('${env.LAUNCHKIT_DESKTOP_RELEASE')
  })

  it('ships the desktop frontend as an extra resource named frontend', () => {
    expect(config.extraResources).toContainEqual({ from: '../frontend/dist-desktop', to: 'frontend' })
  })

  // select-stack:begin node
  it('ships the bundled local backend', () => {
    const resources = config.extraResources as Array<{ from: string; to: string }>
    expect(resources).toContainEqual({ from: 'out/backend', to: 'backend' })
    expect(resources).toContainEqual({ from: '../backend-node/drizzle', to: 'backend/drizzle' })
    expect(resources).toContainEqual({ from: 'node_modules/@electric-sql/pglite', to: 'backend/node_modules/@electric-sql/pglite' })
    expect(resources).toContainEqual({ from: 'node_modules/@node-rs', to: 'backend/node_modules/@node-rs' })
    // The backend's entry exists after the build and the two externals are runtime dependencies of the app.
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as { dependencies: Record<string, string>; scripts: Record<string, string> }
    expect(pkg.scripts['build:all']).toContain('build:backend')
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['@electric-sql/pglite', '@node-rs/argon2']))
  })
  // select-stack:end
  // select-stack:begin python
  //~ it('is a remote client: nothing of a local backend is packaged', () => {
  //~   expect(JSON.stringify(config)).not.toMatch(/backend|pglite|@node-rs/)
  //~   expect(config.extraResources).toEqual([{ from: '../frontend/dist-desktop', to: 'frontend' }])
  //~   const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as { dependencies: Record<string, string>; scripts: Record<string, string> }
  //~   expect(pkg.scripts['build:backend']).toBeUndefined()
  //~   expect(pkg.scripts['build:all']).toBe('npm run build:frontend && npm run build')
  //~   expect(Object.keys(pkg.dependencies)).toEqual(['electron-updater'])
  //~ })
  // select-stack:end

  it('reads signing from the environment instead of embedding it', () => {
    expect(config.mac.hardenedRuntime).toBe(true)
    expect(JSON.stringify(config)).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/)
  })

  it('declares the launchkit protocol', () => {
    expect(config.protocols).toContainEqual({ name: 'launchkit', schemes: ['launchkit'] })
  })
})
