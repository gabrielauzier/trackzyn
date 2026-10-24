import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findPackagedApp, packagedLayout } from './packaged-app'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function releaseWith(entry: string, file: string) {
  const release = mkdtempSync(path.join(tmpdir(), 'trackzyn-rel-'))
  dirs.push(release)
  mkdirSync(path.join(release, entry), { recursive: true })
  writeFileSync(path.join(release, entry, file), '')
  return release
}

describe('findPackagedApp', () => {
  it('finds the Linux binary, which electron-builder names after the npm package (trackzyn-desktop)', () => {
    const release = releaseWith('linux-unpacked', 'trackzyn-desktop')
    expect(findPackagedApp(release)).toBe(path.join(release, 'linux-unpacked', 'trackzyn-desktop'))
  })

  it('finds the macOS and Windows apps', () => {
    const mac = releaseWith('mac-arm64', 'trackzyn.app')
    expect(findPackagedApp(mac)).toBe(path.join(mac, 'mac-arm64', 'trackzyn.app'))
    const win = releaseWith('win-unpacked', 'trackzyn.exe')
    expect(findPackagedApp(win)).toBe(path.join(win, 'win-unpacked', 'trackzyn.exe'))
  })

  it('returns null when release/ is missing or holds no app', () => {
    expect(findPackagedApp(path.join(tmpdir(), 'trackzyn-does-not-exist'))).toBeNull()
    expect(findPackagedApp(releaseWith('linux-unpacked', 'other'))).toBeNull()
  })
})

describe('packagedLayout', () => {
  it('gives the Linux executable (named after the npm package) and the resources folder beside it', () => {
    const release = releaseWith('linux-unpacked', 'trackzyn-desktop')
    expect(packagedLayout(release)).toEqual({
      executable: path.join(release, 'linux-unpacked', 'trackzyn-desktop'),
      resources: path.join(release, 'linux-unpacked', 'resources'),
    })
  })

  it('gives the macOS executable and Resources inside the bundle, and the Windows executable with resources beside it', () => {
    const mac = releaseWith('mac-arm64', 'trackzyn.app')
    expect(packagedLayout(mac)).toEqual({
      executable: path.join(mac, 'mac-arm64', 'trackzyn.app', 'Contents', 'MacOS', 'trackzyn'),
      resources: path.join(mac, 'mac-arm64', 'trackzyn.app', 'Contents', 'Resources'),
    })
    const win = releaseWith('win-unpacked', 'trackzyn.exe')
    expect(packagedLayout(win)).toEqual({
      executable: path.join(win, 'win-unpacked', 'trackzyn.exe'),
      resources: path.join(win, 'win-unpacked', 'resources'),
    })
  })

  it('is null without an app', () => {
    expect(packagedLayout(path.join(tmpdir(), 'trackzyn-does-not-exist'))).toBeNull()
  })
})
