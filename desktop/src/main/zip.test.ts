import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readZip, writeZip, ZipError } from './zip'

const entry = (name: string, text = 'hello world') => ({ name, data: Buffer.from(text) })

/** Offset of the first entry's payload (local header is 30 bytes + name + extra). */
function payloadOffset(zip: Buffer): number {
  return 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28)
}

function centralOffset(zip: Buffer): number {
  return zip.readUInt32LE(zip.length - 22 + 16)
}

describe('zip', () => {
  it('round trips stored and deflated entries', () => {
    const big = 'a'.repeat(5000)
    const out = readZip(writeZip([entry('a.txt', 'abc'), entry('files/b.txt', big)]))
    expect(out.map((item) => [item.name, item.data.toString()])).toEqual([
      ['a.txt', 'abc'],
      ['files/b.txt', big],
    ])
  })

  it('refuses a payload corrupted without touching the headers (crc)', () => {
    // "abc" is stored (deflate would be longer), so a flipped payload byte still inflates: only the CRC sees it.
    const zip = writeZip([entry('a.txt', 'abc')])
    zip[payloadOffset(zip)] ^= 0xff
    expect(() => readZip(zip)).toThrow(/checksum/)
  })

  it('refuses a declared size that is not the real size', () => {
    const zip = writeZip([entry('a.txt', 'abc')])
    zip.writeUInt32LE(5, centralOffset(zip) + 24)
    expect(() => readZip(zip)).toThrow(ZipError)
  })

  it('refuses a deflated entry bigger than its declared size without inflating it all', () => {
    // 64 MiB of zeros deflate to ~64 KB; the header claims 10 bytes.
    const bomb = deflateRawSync(Buffer.alloc(64 * 1024 * 1024))
    const zip = writeZip([entry('a.txt', 'x')])
    const head = zip.subarray(0, payloadOffset(zip))
    const tail = zip.subarray(payloadOffset(zip) + 1)
    const forged = Buffer.concat([head, bomb, tail])
    forged.writeUInt16LE(8, 8)
    forged.writeUInt32LE(bomb.length, 18)
    forged.writeUInt32LE(10, 22)
    const delta = bomb.length - 1
    const central = centralOffset(zip) + delta
    forged.writeUInt16LE(8, central + 10)
    forged.writeUInt32LE(bomb.length, central + 20)
    forged.writeUInt32LE(10, central + 24)
    forged.writeUInt32LE(centralOffset(zip) + delta, forged.length - 22 + 16)
    const before = process.memoryUsage().arrayBuffers
    expect(() => readZip(forged)).toThrow(ZipError)
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(16 * 1024 * 1024)
  })

  it('refuses an entry or a total declared bigger than the limits before inflating anything', () => {
    const zip = writeZip([entry('a.txt', 'x'.repeat(100)), entry('b.txt', 'y'.repeat(100))])
    expect(() => readZip(zip, { maxEntryBytes: 99 })).toThrow(/too large/)
    expect(() => readZip(zip, { maxEntryBytes: 100, maxTotalBytes: 150 })).toThrow(/too large/)
    expect(readZip(zip, { maxEntryBytes: 100, maxTotalBytes: 200 })).toHaveLength(2)
    // A forged header claiming 4 GiB is refused from the header alone.
    const huge = writeZip([entry('a.txt', 'x')])
    huge.writeUInt32LE(0xffffffff, centralOffset(huge) + 24)
    expect(() => readZip(huge)).toThrow(/too large/)
  })

  it('refuses names that could collide or escape', () => {
    const bad: Array<[string, string[]]> = [
      ['duplicate', ['files/a', 'files/a']],
      ['empty segment', ['files//x']],
      ['drive', ['files/C:/x']],
      ['alternate data stream', ['files/x:ads']],
      ['nul', ['files/a\0b']],
      ['file and folder', ['files/a', 'files/a/b']],
      ['folder and file', ['files/a/b', 'files/a']],
      ['backslash', ['files\\x']],
      ['dot segment', ['files/./x']],
      ['case collision', ['files/Readme', 'files/README']],
      ['folder and file by case', ['files/A/b', 'files/a']],
      ['reserved', ['files/CON']],
      ['reserved with extension', ['files/aux.txt']],
      ['numbered device', ['files/com1']],
      ['trailing dot', ['files/a.']],
      ['trailing space', ['files/a ']],
      ['parent', ['files/../x']],
      ['absolute', ['/etc/x']],
    ]
    for (const [label, names] of bad) {
      expect(() => readZip(writeZip(names.map((name) => entry(name)))), label).toThrow(ZipError)
    }
  })

  it('refuses an archive with more entries than the limit', () => {
    const zip = writeZip([entry('a'), entry('b'), entry('c')])
    expect(() => readZip(zip, { maxEntries: 2 })).toThrow(/too many/)
    expect(readZip(zip, { maxEntries: 3 })).toHaveLength(3)
  })
})
