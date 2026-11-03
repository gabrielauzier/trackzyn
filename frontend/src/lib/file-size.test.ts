import { describe, expect, it } from 'vitest'
import { formatFileSize } from './file-size'

describe('formatFileSize', () => {
  it('keeps bytes whole', () => {
    expect(formatFileSize(0, 'en-US')).toBe('0 B')
    expect(formatFileSize(512, 'en-US')).toBe('512 B')
  })

  it('steps through the units with one decimal below 100', () => {
    expect(formatFileSize(1536, 'en-US')).toBe('1.5 KB')
    expect(formatFileSize(5 * 1024 * 1024, 'en-US')).toBe('5 MB')
    expect(formatFileSize(250 * 1024 * 1024, 'en-US')).toBe('250 MB')
  })

  it('uses the locale decimal separator', () => {
    expect(formatFileSize(1536, 'pt-BR')).toBe('1,5 KB')
  })

  it('refuses nonsense', () => {
    expect(formatFileSize(-1)).toBe('—')
    expect(formatFileSize(Number.NaN)).toBe('—')
  })
})
