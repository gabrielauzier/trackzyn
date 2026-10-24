export interface StoredFile {
  storageKey: string
  size: number
  contentType: string
}

/** Same interface as backend/app/providers/storage.py. */
export interface StorageProvider {
  readonly name: string
  upload(storageKey: string, data: Buffer, contentType: string): Promise<StoredFile>
  download(storageKey: string): Promise<Buffer>
  delete(storageKey: string): Promise<void>
  getUrl(storageKey: string): string | null
}
