import en from '../../../frontend/src/locales/en.json'
import ptBR from '../../../frontend/src/locales/pt-BR.json'
import { IPC } from '../shared/ipc'

export interface FocusCloseStrings {
  message: string
  pauseAndQuit: string
  cancel: string
}

export function focusCloseStrings(locale: string): FocusCloseStrings {
  const resource = locale.toLowerCase().startsWith('pt') ? ptBR : en
  return { ...resource.desktop.focusClose }
}

/** How long `Pausar e sair` waits for the renderer before closing anyway. */
export const PAUSE_ANSWER_MS = 3000

interface WindowLike {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown
  close(): void
  webContents: { send(channel: string): void }
}

interface Deps {
  strings: FocusCloseStrings
  showMessageBox(options: { type: 'question'; message: string; buttons: string[]; defaultId: number; cancelId: number }): Promise<{ response: number }>
}

/**
 * Closing the main window while a task counts (SYNC-08): the close is cancelled and a dialog asks
 * first. `Pausar e sair` asks the renderer to pause, waits for its answer (3 s at most) and closes.
 */
export function registerFocusClose(win: WindowLike, deps: Deps) {
  let running = false
  let leaving = false
  let answer: (() => void) | null = null

  const ask = async () => {
    const { strings } = deps
    const { response } = await deps.showMessageBox({
      type: 'question',
      message: strings.message,
      buttons: [strings.pauseAndQuit, strings.cancel],
      defaultId: 0,
      cancelId: 1,
    })
    if (response !== 0) return
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        answer = null
        resolve()
      }
      const timer = setTimeout(done, PAUSE_ANSWER_MS)
      answer = done
      win.webContents.send(IPC.focusPauseRequest)
    })
    leaving = true
    win.close()
  }

  win.on('close', (event) => {
    if (leaving || !running) return
    event.preventDefault()
    void ask()
  })

  return {
    reportState(state: unknown) {
      running = (state as { running?: unknown } | null | undefined)?.running === true
    },
    pauseAnswered() {
      answer?.()
    },
    running: () => running,
  }
}
