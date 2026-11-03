export interface WindowLike {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

interface AppLike {
  requestSingleInstanceLock(): boolean
  on(event: 'second-instance', listener: () => void): unknown
}

/** Returns false when another instance already holds the lock and this process must quit. */
export function setupSingleInstance(app: AppLike, getWindow: () => WindowLike | null): boolean {
  if (!app.requestSingleInstanceLock()) return false
  app.on('second-instance', () => {
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  return true
}
