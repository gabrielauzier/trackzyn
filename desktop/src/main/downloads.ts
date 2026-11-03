export interface DownloadItemLike {
  getFilename(): string
  setSavePath(path: string): void
  cancel(): void
  once(event: 'done', listener: (event: unknown, state: string) => void): unknown
}

interface Options {
  showSaveDialog: (win: unknown, options: { defaultPath: string }) => Promise<{ canceled: boolean; filePath?: string }>
  tempPath: () => string
  getWindow: (webContents: unknown) => unknown
  copyFile?: (from: string, to: string) => Promise<void>
  removeFile?: (path: string) => Promise<void>
}

/**
 * `will-download` handler: the file streams into a temporary path while the
 * save dialog is open, and reaches the chosen path only after the user
 * confirms and the download completes. Cancelling leaves nothing behind.
 */
export function createDownloadHandler(options: Options) {
  const copyFile = options.copyFile ?? (async (from: string, to: string) => (await import('node:fs/promises')).copyFile(from, to))
  const removeFile = options.removeFile ?? (async (target: string) => (await import('node:fs/promises')).rm(target, { force: true }))

  return async function onWillDownload(_event: unknown, item: DownloadItemLike, webContents?: unknown): Promise<void> {
    const temporary = options.tempPath()
    item.setSavePath(temporary)
    const completed = new Promise<boolean>((resolve) => item.once('done', (_done, state) => resolve(state === 'completed')))

    try {
      const choice = await options.showSaveDialog(options.getWindow(webContents), { defaultPath: item.getFilename() })
      if (choice.canceled || !choice.filePath) {
        item.cancel()
        return
      }
      if (await completed) await copyFile(temporary, choice.filePath)
    } finally {
      await removeFile(temporary).catch(() => {})
    }
  }
}
