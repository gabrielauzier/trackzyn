import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Buffer
}

/** The archive cannot be read: not a zip, truncated, a bad checksum or an entry that escapes the folder. */
export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const UTF8 = 0x0800

/** DOS time and date, which zip stores; the export does not need them to be exact. */
function dosStamp(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export function writeZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, day } = dosStamp(now)
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const deflated = deflateRawSync(data)
    const stored = deflated.length < data.length
    const body = stored ? deflated : data
    const checksum = crc32(data)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(LOCAL, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(UTF8, 6)
    header.writeUInt16LE(stored ? 8 : 0, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(day, 12)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(body.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    chunks.push(header, nameBytes, body)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(CENTRAL, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(UTF8, 8)
    entry.writeUInt16LE(stored ? 8 : 0, 10)
    entry.writeUInt16LE(time, 12)
    entry.writeUInt16LE(day, 14)
    entry.writeUInt32LE(checksum, 16)
    entry.writeUInt32LE(body.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)

    offset += header.length + nameBytes.length + body.length
  }
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, ...central, end])
}

export interface ReadLimits {
  /** Largest uncompressed entry (declared in the header and enforced while inflating). */
  maxEntryBytes?: number
  /** Largest sum of the uncompressed entries. */
  maxTotalBytes?: number
  maxEntries?: number
}

export const MAX_ENTRY_BYTES = 256 * 1024 * 1024
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024
export const MAX_ENTRIES = 100_000

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Names the archive may carry: relative, no empty, `.`, `..` or drive/stream (`:`) segments, no NUL or backslash, nothing Windows cannot create. */
function checkName(name: string): void {
  const unsafe =
    name === '' ||
    name.startsWith('/') ||
    name.includes('\0') ||
    name.includes('\\') ||
    name.split('/').some((segment) => segment === '' || segment === '.' || segment === '..' || segment.includes(':') || RESERVED.test(segment) || /[. ]$/.test(segment))
  if (unsafe) throw new ZipError(`unsafe entry name: ${JSON.stringify(name)}`)
}

export function readZip(buffer: Buffer, limits: ReadLimits = {}): ZipEntry[] {
  const maxEntry = limits.maxEntryBytes ?? MAX_ENTRY_BYTES
  const maxTotal = limits.maxTotalBytes ?? MAX_TOTAL_BYTES
  const maxEntries = limits.maxEntries ?? MAX_ENTRIES
  // The end-of-central-directory record is within the last 64 KB + 22 bytes (a comment may follow it).
  let end = -1
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 22 - 0xffff); at--) {
    if (buffer.readUInt32LE(at) === END) {
      end = at
      break
    }
  }
  if (end < 0) throw new ZipError('not a zip archive')
  const count = buffer.readUInt16LE(end + 10)
  const centralSize = buffer.readUInt32LE(end + 12)
  let cursor = buffer.readUInt32LE(end + 16)
  if (cursor + centralSize > end) throw new ZipError('the central directory is damaged')

  if (count > maxEntries) throw new ZipError('too many entries')
  const entries: ZipEntry[] = []
  const names = new Set<string>()
  let total = 0
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL) throw new ZipError('the central directory is damaged')
    const method = buffer.readUInt16LE(cursor + 10)
    const checksum = buffer.readUInt32LE(cursor + 16)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const size = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    cursor += 46 + nameLength + extraLength + commentLength

    checkName(name)
    // Compared without case: macOS and Windows would write both names to one file.
    if (names.has(name.toLowerCase())) throw new ZipError(`duplicate entry: ${name}`)
    names.add(name.toLowerCase())
    // Declared sizes are checked before anything is inflated; the inflate is then capped at the declared size.
    if (size > maxEntry || (total += size) > maxTotal) throw new ZipError('an entry is too large')
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) throw new ZipError('an entry is damaged')
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
    if (start + compressedSize > buffer.length) throw new ZipError('the archive is truncated')
    const body = buffer.subarray(start, start + compressedSize)
    let data: Buffer
    try {
      data = method === 8 ? inflateRawSync(body, { maxOutputLength: Math.max(size, 1) }) : method === 0 ? Buffer.from(body) : (() => { throw new ZipError(`unsupported method ${method}`) })()
    } catch (error) {
      throw error instanceof ZipError ? error : new ZipError('an entry cannot be decompressed')
    }
    if (data.length !== size || crc32(data) !== checksum) throw new ZipError(`checksum mismatch in ${name}`)
    entries.push({ name, data })
  }
  // A name may not be both a file and a folder (`files/a` and `files/a/b`).
  for (const name of names) {
    const parts = name.split('/')
    for (let end = 1; end < parts.length; end++) {
      if (names.has(parts.slice(0, end).join('/'))) throw new ZipError(`entry ${name} is under a file`)
    }
  }
  return entries
}
