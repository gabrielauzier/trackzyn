/**
 * Electron accelerators for the capture shortcut (CAP-07): what a pressed combination is as an accelerator,
 * and how one reads on screen, `⌘⇧Space` on macOS and `Ctrl+Shift+Space` elsewhere.
 */

export interface KeyCombination {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
}

function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return NAMED[code] ?? null
}

/**
 * The accelerator of a pressed combination, or `null` while it is not one: only modifiers are down, or no
 * modifier other than Shift is (a global shortcut of a bare key would take that key from every app). The
 * main modifier (⌘ on macOS, Ctrl elsewhere) is `CommandOrControl`, like the default.
 */
export function acceleratorFromKey(event: KeyCombination, platform: string): string | null {
  const key = keyName(event.code)
  if (!key) return null
  const mac = platform === 'darwin'
  const parts: string[] = []
  if (mac ? event.metaKey : event.ctrlKey) parts.push('CommandOrControl')
  if (mac && event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (parts.length === 0) return null
  if (event.shiftKey) parts.push('Shift')
  return [...parts, key].join('+')
}

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
}

const OTHER_NAMES: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Control: 'Ctrl',
}

/** How an accelerator reads on this platform. */
export function formatAccelerator(accelerator: string, platform: string): string {
  const parts = accelerator.split('+')
  if (platform === 'darwin') return parts.map((part) => MAC_SYMBOLS[part] ?? part).join('')
  return parts.map((part) => OTHER_NAMES[part] ?? part).join('+')
}
