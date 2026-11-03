import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import type { StorageProvider, StoredFile } from './storage-provider.ts'

/** Files on the local disk under `basePath`, like backend/app/providers/local_storage.py. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local'

  constructor(private readonly basePath: string) {}

  private fullPath(storageKey: string): string {
    const base = resolve(this.basePath)
    const full = resolve(base, storageKey)
    const inside = relative(base, full)
    if (inside.startsWith('..') || resolve(base, inside) !== full) throw new Error('Invalid storage key')
    return full
  }

  async upload(storageKey: string, data: Buffer, contentType: string): Promise<StoredFile> {
    const path = this.fullPath(storageKey)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
    return { storageKey, size: data.length, contentType }
  }

  async download(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.fullPath(storageKey))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new FileNotFoundError(storageKey)
      throw error
    }
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.fullPath(storageKey), { force: true })
  }

  getUrl(): string | null {
    return null
  }
}

export class FileNotFoundError extends Error {
  constructor(storageKey: string) {
    super(`File not found: ${storageKey}`)
    this.name = 'FileNotFoundError'
  }
}

/** The provider `STORAGE_PROVIDER` names. An unknown one fails on first use, as the Python factory does. */
export function createStorageProvider(config: { storageProvider: string; storageLocalPath: string }): StorageProvider {
  if (config.storageProvider === 'local') return new LocalStorageProvider(config.storageLocalPath)
  const unsupported = () => {
    throw new Error(
      `Storage provider '${config.storageProvider}' is not yet implemented. Supported: 'local'`,
    )
  }
  return {
    name: config.storageProvider,
    upload: async () => unsupported(),
    download: async () => unsupported(),
    delete: async () => unsupported(),
    getUrl: () => null,
  }
}
