interface KeyInput {
  type: string
  key: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  isAutoRepeat: boolean
}

interface InputWebContents {
  on(event: 'before-input-event', listener: (event: { preventDefault(): void }, input: KeyInput) => void): unknown
}

interface ShortcutController {
  isOpen(): boolean
  focusActive(): boolean
  open(): void
  close(reason: 'expand'): void
}

/**
 * Ctrl+Shift+F (Cmd+Shift+F on macOS) in a trackzyn window: opens the widget while a focus is active,
 * and from the widget does what Expandir does (WIDGET-04, WIDGET-20). It reads the window's own input,
 * so the keys reach other apps while trackzyn is not active (WIDGET-05).
 */
export function bindWidgetShortcut(webContents: InputWebContents, controller: ShortcutController, platform: string): void {
  const mac = platform === 'darwin'
  webContents.on('before-input-event', (event, input) => {
    const matches =
      input.type === 'keyDown' &&
      !input.isAutoRepeat &&
      input.key.toLowerCase() === 'f' &&
      input.shift &&
      !input.alt &&
      input.meta === mac &&
      input.control === !mac
    if (!matches) return
    if (controller.isOpen()) controller.close('expand')
    else if (controller.focusActive()) controller.open()
    else return
    event.preventDefault()
  })
}
