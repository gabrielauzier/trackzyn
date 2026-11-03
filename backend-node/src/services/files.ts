import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { Config } from '../config.ts'
import type { Database } from '../db/client.ts'
import { type StoredFileRecord, files } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import type { StorageProvider } from '../ports/storage-provider.ts'

export function allowedExtensions(config: Config): string[] {
  const parsed = config.storageAllowedExtensions
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(parsed)].sort()
}

/** Strips special characters from a filename, keeping a lower-cased alphanumeric extension. */
export function sanitizeFilename(filename: string): string {
  let name = filename
  let ext = ''
  const dot = filename.lastIndexOf('.')
  if (dot !== -1) {
    name = filename.slice(0, dot)
    ext = filename.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  }
  name = name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!name) name = 'file'
  return ext ? `${name}.${ext}` : name
}

function validateFile(config: Config, filename: string, size: number): void {
  if (size > config.storageMaxFileSizeMb * 1024 * 1024) {
    throw new HttpError(400, `File too large. Maximum size is ${config.storageMaxFileSizeMb} MB.`)
  }
  const allowed = allowedExtensions(config)
  const dot = filename.lastIndexOf('.')
  const ext = dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
  if (!allowed.includes(ext)) {
    throw new HttpError(400, `File type '.${ext}' is not allowed. Allowed: ${allowed.join(', ')}`)
  }
}

export async function uploadFile(
  db: Database,
  storage: StorageProvider,
  config: Config,
  input: { workspaceId: string; userId: string; filename: string; contentType: string; data: Buffer },
): Promise<StoredFileRecord> {
  const filename = sanitizeFilename(input.filename)
  validateFile(config, filename, input.data.length)

  const prefix = randomUUID().replaceAll('-', '').slice(0, 12)
  const stored = await storage.upload(`${input.workspaceId}/${prefix}_${filename}`, input.data, input.contentType)
  const record: StoredFileRecord = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    uploadedByUserId: input.userId,
    filename,
    storageKey: stored.storageKey,
    contentType: stored.contentType,
    size: stored.size,
    createdAt: new Date(),
  }
  await db.insert(files).values(record)
  return record
}

export async function listFiles(db: Database, workspaceId: string): Promise<StoredFileRecord[]> {
  return db.select().from(files).where(eq(files.workspaceId, workspaceId)).orderBy(desc(files.createdAt))
}

export async function getFile(db: Database, fileId: string, workspaceId: string): Promise<StoredFileRecord> {
  const [record] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.workspaceId, workspaceId)))
    .limit(1)
  if (!record) throw new HttpError(404, 'File not found')
  return record
}

export async function renameFile(db: Database, fileId: string, workspaceId: string, newFilename: string): Promise<StoredFileRecord> {
  const record = await getFile(db, fileId, workspaceId)
  let filename = sanitizeFilename(newFilename)

  // The original extension stays.
  const extOf = (value: string) => (value.includes('.') ? (value.split('.').pop() as string).toLowerCase() : '')
  const originalExt = extOf(record.filename)
  if (originalExt && extOf(filename) !== originalExt) {
    const namePart = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename
    filename = `${namePart}.${originalExt}`
  }
  await db.update(files).set({ filename }).where(eq(files.id, record.id))
  return { ...record, filename }
}

export async function deleteFile(db: Database, storage: StorageProvider, fileId: string, workspaceId: string): Promise<void> {
  const record = await getFile(db, fileId, workspaceId)
  await storage.delete(record.storageKey)
  await db.delete(files).where(eq(files.id, record.id))
}

/** `urllib.parse.quote`: everything but letters, digits and `_.-~/` is percent-encoded. */
export function quote(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`).replaceAll('%2F', '/')
}
