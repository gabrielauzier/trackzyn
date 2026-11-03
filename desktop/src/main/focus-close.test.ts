import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { focusCloseStrings, registerFocusClose } from './focus-close'

interface CloseEvent {
  preventDefault: () => void
  defaultPrevented: boolean
}

/** A main window: `close()` runs the close listeners and the window closes unless one prevents it. */
function fakeWindow() {
  const listeners: Array<(event: CloseEvent) => void> = []
  const win = {
    closed: false,
    sent: [] as string[],
    on: (_name: 'close', listener: (event: CloseEvent) => void) => {
      listeners.push(listener)
    },
    close: () => {
      const event: CloseEvent = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true
        },
      }
      for (const listener of listeners) listener(event)
      if (!event.defaultPrevented) win.closed = true
    },
    webContents: {
      send: (channel: string) => {
        win.sent.push(channel)
      },
    },
  }
  return win
}

function setup(response: number) {
  const win = fakeWindow()
  const showMessageBox = vi.fn<(options: { message: string; buttons: string[]; defaultId: number; cancelId: number }) => Promise<{ response: number }>>(async () => ({ response }))
  const focusClose = registerFocusClose(win, { strings: focusCloseStrings('pt-BR'), showMessageBox })
  return { win, showMessageBox, focusClose }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('closing the desktop app with a task counting (SYNC-08)', () => {
  it('closes at once when no task is counting', async () => {
    const { win, showMessageBox, focusClose } = setup(0)
    win.close()
    expect(win.closed).toBe(true)

    const paused = setup(0)
    paused.focusClose.reportState({ active: true, running: false })
    paused.win.close()
    expect(paused.win.closed).toBe(true)

    await vi.runAllTimersAsync()
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(paused.showMessageBox).not.toHaveBeenCalled()
    expect(focusClose.running()).toBe(false)
  })

  it('asks "Há uma tarefa contando." with Pausar e sair and Cancelar while a task counts', async () => {
    const { win, showMessageBox, focusClose } = setup(1)
    focusClose.reportState({ active: true, running: true })
    win.close()
    expect(win.closed).toBe(false)
    await vi.runAllTimersAsync()
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    const options = showMessageBox.mock.calls[0]![0]
    expect(options.message).toBe('Há uma tarefa contando.')
    expect(options.buttons).toEqual(['Pausar e sair', 'Cancelar'])
    expect(options.buttons[options.defaultId]).toBe('Pausar e sair')
    expect(options.buttons[options.cancelId]).toBe('Cancelar')
  })

  it('Cancelar keeps the window open and asks no pause', async () => {
    const { win, focusClose } = setup(1)
    focusClose.reportState({ active: true, running: true })
    win.close()
    await vi.runAllTimersAsync()
    expect(win.closed).toBe(false)
    expect(win.sent).toEqual([])
  })

  it('Pausar e sair asks the pause and closes once the renderer answers', async () => {
    const { win, focusClose } = setup(0)
    focusClose.reportState({ active: true, running: true })
    win.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(win.sent).toEqual(['focus:pause-request'])
    expect(win.closed).toBe(false)

    await vi.advanceTimersByTimeAsync(1000)
    expect(win.closed).toBe(false)
    focusClose.pauseAnswered()
    await vi.advanceTimersByTimeAsync(0)
    expect(win.closed).toBe(true)
  })

  it('Pausar e sair closes after 3 s without an answer', async () => {
    const { win, focusClose } = setup(0)
    focusClose.reportState({ active: true, running: true })
    win.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(win.sent).toEqual(['focus:pause-request'])

    await vi.advanceTimersByTimeAsync(2999)
    expect(win.closed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(win.closed).toBe(true)
  })

  it('reads only a boolean running from what the renderer reports', () => {
    const { focusClose } = setup(0)
    focusClose.reportState({ active: true, running: true })
    expect(focusClose.running()).toBe(true)
    for (const state of [{ active: true, running: 'yes' }, null, 'running', undefined]) {
      focusClose.reportState(state)
      expect(focusClose.running(), JSON.stringify(state)).toBe(false)
    }
  })

  it('words the dialog in English outside Portuguese', () => {
    expect(focusCloseStrings('en-US')).toEqual({ message: 'A task is running.', pauseAndQuit: 'Pause and quit', cancel: 'Cancel' })
    expect(focusCloseStrings('pt-BR')).toEqual({ message: 'Há uma tarefa contando.', pauseAndQuit: 'Pausar e sair', cancel: 'Cancelar' })
  })
})
