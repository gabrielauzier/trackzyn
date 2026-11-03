import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** The unpacked app that `electron-builder --dir` leaves in `release`, per operating system. */
export function findPackagedApp(release: string): string | null {
  if (!existsSync(release)) return null
  for (const dir of readdirSync(release)) {
    const base = path.join(release, dir)
    if (dir.startsWith('mac') && existsSync(path.join(base, 'trackzyn.app'))) return path.join(base, 'trackzyn.app')
    if (dir === 'linux-unpacked') {
      // The Linux executable is named after the npm package, not the product.
      for (const name of ['trackzyn-desktop', 'trackzyn']) if (existsSync(path.join(base, name))) return path.join(base, name)
    }
    if (dir === 'win-unpacked' && existsSync(path.join(base, 'trackzyn.exe'))) return path.join(base, 'trackzyn.exe')
  }
  return null
}

/** The packaged app's executable and its `resources/` folder (where extraResources land), per operating system. */
export function packagedLayout(release: string): { executable: string; resources: string } | null {
  const app = findPackagedApp(release)
  if (!app) return null
  if (app.endsWith('.app')) {
    const contents = path.join(app, 'Contents')
    return { executable: path.join(contents, 'MacOS', 'trackzyn'), resources: path.join(contents, 'Resources') }
  }
  return { executable: app, resources: path.join(path.dirname(app), 'resources') }
}
