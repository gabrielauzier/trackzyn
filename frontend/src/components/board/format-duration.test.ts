import { describe, expect, it } from 'vitest'

import { formatDuration } from '@/components/board/format-duration'

describe('formatDuration', () => {
  it('formats durations in pt-BR', () => {
    expect(formatDuration(0, 'pt-BR')).toBe('0min')
    expect(formatDuration(59, 'pt-BR')).toBe('0min')
    expect(formatDuration(60, 'pt-BR')).toBe('1min')
    expect(formatDuration(3600, 'pt-BR')).toBe('1h')
    expect(formatDuration(5220, 'pt-BR')).toBe('1h 27min')
    expect(formatDuration(86400, 'pt-BR')).toBe('24h')
  })

  it('formats durations in English', () => {
    expect(formatDuration(0, 'en')).toBe('0min')
    expect(formatDuration(59, 'en')).toBe('0min')
    expect(formatDuration(60, 'en')).toBe('1min')
    expect(formatDuration(3600, 'en')).toBe('1hr')
    expect(formatDuration(5220, 'en')).toBe('1hr 27min')
    expect(formatDuration(86400, 'en')).toBe('24hr')
  })

  it('shows whole minutes under an hour', () => {
    expect(formatDuration(27 * 60, 'pt-BR')).toBe('27min')
  })
})
