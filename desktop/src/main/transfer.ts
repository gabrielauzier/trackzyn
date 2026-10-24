import path from 'node:path'
import { ImportUnsettledError, exportData, importData } from './export-import'
import type { DataDump, RestoreResult } from './local-backend'
import type { TransferStrings } from './menu'

interface Deps {
  strings: TransferStrings
  userData: string
  appVersion: string
  backend: {
    dump(): Promise<DataDump>
    restore(dump: DataDump, importId: string): Promise<RestoreResult>
    check(dump: DataDump): Promise<RestoreResult>
    hasImport(importId: string): Promise<boolean>
  }
  /** Save and open dialogs, and a message box; each returns what the user chose. */
  chooseSavePath: (defaultPath: string) => Promise<string | null>
  chooseOpenPath: () => Promise<string | null>
  message: (options: { kind: 'info' | 'error'; text: string; confirm?: { action: string; cancel: string } }) => Promise<boolean>
  setExporting: (exporting: boolean) => void
  /** Reloads the app after an import so it shows the restored data. */
  reload: () => void
  /** Restarts the app (the recovery of an import runs at start). */
  restartApp: () => void
  now?: () => Date
}

/** Arquivo > Exportar dados and Importar dados of the local mode. */
export function createTransfer(deps: Deps) {
  const filesDir = path.join(deps.userData, 'files')

  return {
    async exportData(): Promise<void> {
      // Locked from the click: the save dialog already stops the app, and nothing may write during the dump.
      deps.setExporting(true)
      try {
        const stamp = (deps.now?.() ?? new Date()).toISOString().replaceAll(':', '-').replace('.', '-')
        const target = await deps.chooseSavePath(`launchkit-export-${stamp}.zip`)
        if (!target) return
        try {
          await exportData({ dump: () => deps.backend.dump(), filesDir, appVersion: deps.appVersion, target })
        } catch {
          await deps.message({ kind: 'error', text: deps.strings.exportFailed })
          return
        }
        await deps.message({ kind: 'info', text: deps.strings.exportDone })
      } finally {
        deps.setExporting(false)
      }
    },

    async importData(): Promise<void> {
      const source = await deps.chooseOpenPath()
      if (!source) return
      const confirmed = await deps.message({
        kind: 'info',
        text: deps.strings.importConfirm,
        confirm: { action: deps.strings.importAction, cancel: deps.strings.cancel },
      })
      if (!confirmed) return
      let result
      try {
        result = await importData({
          source,
          filesDir,
          userData: deps.userData,
          check: (dump) => deps.backend.check(dump),
          restore: (dump, id) => deps.backend.restore(dump, id),
          hasImport: (id) => deps.backend.hasImport(id),
        })
      } catch (error) {
        if (error instanceof ImportUnsettledError) {
          await deps.message({ kind: 'error', text: deps.strings.restart })
          deps.restartApp()
          return
        }
        await deps.message({ kind: 'error', text: deps.strings.importFailed })
        return
      }
      if (!result.ok) {
        await deps.message({ kind: 'error', text: result.reason === 'not-new' ? deps.strings.notNew : deps.strings.invalid })
        return
      }
      await deps.message({ kind: 'info', text: deps.strings.importDone })
      // The database is imported; only leftovers of the swap remain, which the next start removes.
      if (result.warning === 'cleanup') await deps.message({ kind: 'info', text: deps.strings.cleanupWarning })
      deps.reload()
    },
  }
}
