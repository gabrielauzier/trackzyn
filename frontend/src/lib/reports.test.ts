import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultRange, formatProductive } from './reports'

describe('defaultRange (REPORT-01)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('on a Sunday, starts on the Monday before and ends today', () => {
    expect(defaultRange('America/Sao_Paulo', new Date('2026-10-25T15:00:00Z'))).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  })

  it('on a Monday, starts and ends on the same day', () => {
    expect(defaultRange('America/Sao_Paulo', new Date('2026-10-26T15:00:00Z'))).toEqual({ from: '2026-10-26', to: '2026-10-26' })
  })

  it('in the middle of the week, starts on its Monday', () => {
    expect(defaultRange('America/Sao_Paulo', new Date('2026-10-21T15:00:00Z'))).toEqual({ from: '2026-10-19', to: '2026-10-21' })
  })

  it('decides today in the workspace timezone: 02:00 UTC on a Monday is still Sunday in Sao Paulo', () => {
    const instant = new Date('2026-10-26T02:00:00Z')

    expect(defaultRange('America/Sao_Paulo', instant)).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(defaultRange('Asia/Tokyo', instant)).toEqual({ from: '2026-10-26', to: '2026-10-26' })
  })

  it('without a clock, uses the current time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T15:00:00Z'))

    expect(defaultRange('America/Sao_Paulo')).toEqual({ from: '2026-10-19', to: '2026-10-23' })
  })
})

describe('formatProductive (REPORT-05)', () => {
  it('shows the most productive hour as a one-hour range', () => {
    expect(formatProductive([18], 'hour', 'pt-BR')).toBe('18–19h')
    expect(formatProductive([18], 'hour', 'en')).toBe('6–7 PM')
  })

  it('crosses noon and midnight in the hour range', () => {
    expect(formatProductive([23], 'hour', 'pt-BR')).toBe('23–24h')
    expect(formatProductive([0], 'hour', 'pt-BR')).toBe('0–1h')
    expect(formatProductive([11], 'hour', 'en')).toBe('11 AM–12 PM')
    expect(formatProductive([23], 'hour', 'en')).toBe('11 PM–12 AM')
  })

  it('lists one, two and three tied weekdays (ISO 1 = Monday)', () => {
    expect(formatProductive([1], 'weekday', 'pt-BR')).toBe('Segunda')
    expect(formatProductive([1, 3], 'weekday', 'pt-BR')).toBe('Segunda e quarta')
    expect(formatProductive([1, 3, 5], 'weekday', 'pt-BR')).toBe('Segunda, quarta e sexta')
    expect(formatProductive([7], 'weekday', 'pt-BR')).toBe('Domingo')
    expect(formatProductive([1, 3], 'weekday', 'en')).toBe('Monday and Wednesday')
  })

  it('lists tied hours and months', () => {
    expect(formatProductive([9, 18], 'hour', 'pt-BR')).toBe('9–10h e 18–19h')
    expect(formatProductive(['2026-10'], 'month', 'pt-BR')).toBe('out. de 2026')
    expect(formatProductive(['2026-10', '2026-11', '2026-12'], 'month', 'pt-BR')).toBe('out. de 2026, nov. de 2026 e dez. de 2026')
    expect(formatProductive(['2026-10'], 'month', 'en')).toBe('Oct 2026')
  })

  it('shows a dash without activity', () => {
    expect(formatProductive([], 'hour', 'pt-BR')).toBe('—')
    expect(formatProductive([], 'month', 'en')).toBe('—')
  })
})
