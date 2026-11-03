import { describe, expect, it } from 'vitest'

import { greetingFor, hourIn } from '@/components/lists/greeting'
import { t } from '@/test/utils'

describe('greetingFor', () => {
  it('splits the day at 05:00, 12:00 and 18:00', () => {
    expect(greetingFor(0)).toBe('dawn')
    expect(greetingFor(4)).toBe('dawn') // 04:59
    expect(greetingFor(5)).toBe('morning') // 05:00
    expect(greetingFor(11)).toBe('morning') // 11:59
    expect(greetingFor(12)).toBe('afternoon') // 12:00
    expect(greetingFor(17)).toBe('afternoon') // 17:59
    expect(greetingFor(18)).toBe('night') // 18:00
    expect(greetingFor(23)).toBe('night') // 23:59
  })
})

describe('hourIn', () => {
  it('reads the hour in the workspace timezone, not in UTC', () => {
    // São Paulo is UTC-3: 07:59 UTC is 04:59 there, 08:00 UTC is 05:00.
    expect(greetingFor(hourIn('America/Sao_Paulo', new Date('2026-10-24T07:59:00Z')))).toBe('dawn')
    expect(greetingFor(hourIn('America/Sao_Paulo', new Date('2026-10-24T08:00:00Z')))).toBe('morning')
    expect(hourIn('America/Sao_Paulo', new Date('2026-10-24T02:30:00Z'))).toBe(23)
  })

  it('reports midnight as 0', () => {
    expect(hourIn('America/Sao_Paulo', new Date('2026-10-24T03:00:00Z'))).toBe(0)
  })
})

describe('greeting copy', () => {
  it('ships the greetings and subtitles in Portuguese', () => {
    const lng = 'pt-BR'
    expect(t('home.greeting.dawn', { lng, name: 'Ana' })).toBe('Boa madrugada, Ana')
    expect(t('home.greeting.morning', { lng, name: 'Ana' })).toBe('Bom dia, Ana')
    expect(t('home.greeting.afternoon', { lng, name: 'Ana' })).toBe('Boa tarde, Ana')
    expect(t('home.greeting.night', { lng, name: 'Ana' })).toBe('Boa noite, Ana')
    expect(t('home.subtitle.dawn', { lng })).toBe('Focando enquanto o mundo dorme.')
    expect(t('home.subtitle.morning', { lng })).toBe('Comece pelo que mais importa.')
    expect(t('home.subtitle.afternoon', { lng })).toBe('Uma tarefa de cada vez.')
    expect(t('home.subtitle.night', { lng })).toBe('Hora de fechar o dia com calma.')
  })

  it('ships the subtitles in English', () => {
    const lng = 'en'
    expect(t('home.subtitle.dawn', { lng })).toBe('Focusing while the world sleeps.')
    expect(t('home.subtitle.morning', { lng })).toBe('Start with what matters most.')
    expect(t('home.subtitle.afternoon', { lng })).toBe('One task at a time.')
    expect(t('home.subtitle.night', { lng })).toBe('Time to wrap up the day calmly.')
  })
})
