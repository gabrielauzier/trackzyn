import type { MenuItemConstructorOptions } from 'electron'
import en from '../../../frontend/src/locales/en.json'
import ptBR from '../../../frontend/src/locales/pt-BR.json'

export interface MenuStrings {
  file: string
  switchServer: string
  // select-stack:begin node
  exportData: string
  importData: string
  // select-stack:end
  edit: string
  view: string
  window: string
  help: string
  documentation: string
}

export const DOCS_URL = 'https://github.com/gabrielauzier/launchkit'

export function menuStrings(locale: string): MenuStrings {
  const resource = locale.toLowerCase().startsWith('pt') ? ptBR : en
  return { ...resource.desktop.menu }
}

interface Options {
  isMac: boolean
  strings: MenuStrings
  onSwitchServer: () => void
  // select-stack:begin node
  /** Export and import exist only in local mode, with the backend running. */
  transfer?: { enabled: boolean; onExport: () => void; onImport: () => void }
  // select-stack:end
  onOpenDocs?: () => void
}

// select-stack:begin node
export function buildMenuTemplate({ isMac, strings, onSwitchServer, transfer, onOpenDocs }: Options): MenuItemConstructorOptions[] {
// select-stack:end
// select-stack:begin python
//~ export function buildMenuTemplate({ isMac, strings, onSwitchServer, onOpenDocs }: Options): MenuItemConstructorOptions[] {
// select-stack:end
  return [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: strings.file,
      submenu: [
        { id: 'switch-server', label: strings.switchServer, click: onSwitchServer },
        // select-stack:begin node
        ...(transfer
          ? [
              { id: 'export-data', label: strings.exportData, enabled: transfer.enabled, click: transfer.onExport },
              { id: 'import-data', label: strings.importData, enabled: transfer.enabled, click: transfer.onImport },
            ]
          : []),
        // select-stack:end
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' },
      ],
    },
    { role: 'editMenu', label: strings.edit },
    { role: 'viewMenu', label: strings.view },
    { role: 'windowMenu', label: strings.window },
    {
      role: 'help',
      label: strings.help,
      submenu: [{ label: strings.documentation, click: () => onOpenDocs?.() }],
    },
  ]
}

// select-stack:begin node
export interface TransferStrings {
  exporting: string
  exportDone: string
  exportFailed: string
  importTitle: string
  importConfirm: string
  importAction: string
  cancel: string
  importDone: string
  invalid: string
  notNew: string
  importFailed: string
  cleanupWarning: string
  restart: string
}

export function transferStrings(locale: string): TransferStrings {
  const resource = locale.toLowerCase().startsWith('pt') ? ptBR : en
  return { ...resource.desktop.transfer }
}
// select-stack:end
