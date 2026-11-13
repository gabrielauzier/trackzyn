import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { CaptureShortcutSetting } from '../shared/ipc'

type Config = Record<string, unknown>
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export type Mode = 'remote' | 'local'

/** The global capture shortcut (AD-012): on or off, and the Electron accelerator it registers. */
export type { CaptureShortcutSetting }

export const DEFAULT_CAPTURE_SHORTCUT: CaptureShortcutSetting = { enabled: true, accelerator: 'CommandOrControl+Shift+Space' }

function isCaptureShortcut(value: unknown): value is CaptureShortcutSetting {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.enabled === 'boolean' && typeof candidate.accelerator === 'string' && candidate.accelerator !== ''
}

export function isBounds(value: unknown): value is Bounds {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (['x', 'y', 'width', 'height'] as const).every((key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]))
}

function read(file: string): Config {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Config) : {}
  } catch {
    return {}
  }
}

/** `userData/config.json`: the mode, the server URL, the window bounds, the widget position and the capture shortcut. */
export function createConfigStore(file: string) {
  function update(patch: Config) {
    const next = { ...read(file), ...patch }
    mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(next, null, 2))
    renameSync(temporary, file)
  }

  return {
    getServerUrl(): string | null {
      const value = read(file).serverUrl
      return typeof value === 'string' && value !== '' ? value : null
    },
    setServerUrl(url: string) {
      update({ serverUrl: url })
    },
    /**
     * `mode` as saved, `null` while the choice is open (first use, or reopened by "switch server").
     * An install from before modes existed has a server and no `mode`: it is remote.
     */
    getMode(): Mode | null {
      const config = read(file)
      if (config.mode === 'remote' || config.mode === 'local') return config.mode
      if (config.mode === null) return null
      return typeof config.serverUrl === 'string' && config.serverUrl !== '' ? 'remote' : null
    },
    setMode(mode: Mode | null) {
      update({ mode })
    },
    getBounds(): Bounds | null {
      const value = read(file).bounds
      return isBounds(value) ? value : null
    },
    setBounds(bounds: Bounds) {
      update({ bounds })
    },
    /** Where the focus widget was last left (WIDGET-10). */
    getWidgetBounds(): Bounds | null {
      const value = read(file).widgetBounds
      return isBounds(value) ? value : null
    },
    setWidgetBounds(bounds: Bounds) {
      update({ widgetBounds: bounds })
    },
    /** The capture shortcut (CAP-07, CAP-08); on with `CommandOrControl+Shift+Space` until changed. */
    getCaptureShortcut(): CaptureShortcutSetting {
      const value = read(file).captureShortcut
      return isCaptureShortcut(value) ? { enabled: value.enabled, accelerator: value.accelerator } : { ...DEFAULT_CAPTURE_SHORTCUT }
    },
    setCaptureShortcut(setting: CaptureShortcutSetting) {
      update({ captureShortcut: { enabled: setting.enabled, accelerator: setting.accelerator } })
    },
  }
}
