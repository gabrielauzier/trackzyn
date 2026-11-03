import { APP_ORIGIN } from './app-protocol'
import type { Mode } from './config-store'

interface Deps {
  getMode: () => Mode | null
  stopLocal: () => Promise<void>
  setMode: (mode: Mode | null) => void
  navigate: (url: string) => void
}

/**
 * "Switch server": remote mode goes to the connect screen (the saved server stays until a new one
 * validates); local mode stops its backend cleanly, leaves the data where it is and reopens the
 * choice between a server and this computer.
 */
export function createSwitchServer({ getMode, stopLocal, setMode, navigate }: Deps): () => Promise<void> {
  return async () => {
    if (getMode() === 'local') {
      await stopLocal()
      setMode(null)
      navigate(`${APP_ORIGIN}/mode`)
      return
    }
    navigate(`${APP_ORIGIN}/connect`)
  }
}
