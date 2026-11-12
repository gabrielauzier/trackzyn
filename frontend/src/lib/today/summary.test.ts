import { describe, expect, it } from 'vitest'

import i18n from '@/lib/i18n'
import { type SummaryInput, summaryMarkdown } from './summary'

const pt = i18n.getFixedT('pt-BR')
const en = i18n.getFixedT('en')
const minutes = (count: number) => count * 60

// The example of the mockup (`Fechar o dia`): 6h 11min focused, 7 of 9 planned done, 68% adherence.
const mockup: SummaryInput = {
  workspace: 'Trackzyn',
  day: '2026-11-11',
  focusedSeconds: minutes(6 * 60 + 11),
  doneCount: 7,
  plannedCount: 9,
  adherence: 68,
  done: [
    { title: 'Revisar MR do checkout', list: 'Frete', spent_seconds: minutes(62), verdict: 'on_time', diff_seconds: minutes(2) },
    { title: 'Corrigir bug do fuso', list: 'Frete', spent_seconds: minutes(100), verdict: 'late', diff_seconds: minutes(40) },
    { title: 'Responder e-mails', list: 'Pessoal', spent_seconds: minutes(25), verdict: 'early', diff_seconds: -minutes(5) },
    { title: 'Escrever spec do dashboard Hoje', list: 'Trackzyn', spent_seconds: minutes(94), verdict: null, diff_seconds: 0 },
  ],
  later: [
    { title: 'Preparar aula de quinta', to: 'tomorrow' },
    { title: 'Atualizar dependências', to: 'backlog' },
    { title: 'Ler capítulo 4', to: 'this_week' },
  ],
  note: '',
}

describe('summaryMarkdown (HOJE-63)', () => {
  it('writes the example of the mockup exactly', () => {
    expect(summaryMarkdown(mockup, pt, 'pt-BR')).toBe(
      [
        '## Trackzyn · 11/11',
        'Focado 6h 11min · 7 de 9 concluídas · aderência 68%',
        '',
        '### Feito',
        '- [x] Revisar MR do checkout (1h 2min, Frete)',
        '- [x] Corrigir bug do fuso (1h 40min, +40min, Frete)',
        '- [x] Responder e-mails (25min, -5min, Pessoal)',
        '- [x] Escrever spec do dashboard Hoje (1h 34min, Trackzyn)',
        '',
        '### Ficou para depois',
        '- Preparar aula de quinta → amanhã',
        '- Atualizar dependências → backlog',
        '- Ler capítulo 4 → esta semana',
      ].join('\n'),
    )
  })

  it('writes the note of the day at the end, after a blank line', () => {
    expect(summaryMarkdown({ ...mockup, note: 'Travou no fuso.\nRever amanhã.' }, pt, 'pt-BR').endsWith(
      '- Ler capítulo 4 → esta semana\n\nTravou no fuso.\nRever amanhã.',
    )).toBe(true)
  })

  it('writes nothing after Ficou para depois without a note, and a blank note counts as none', () => {
    const blank = summaryMarkdown({ ...mockup, note: '   \n ' }, pt, 'pt-BR')
    expect(blank.split('### Ficou para depois\n')[1]).toBe(
      '- Preparar aula de quinta → amanhã\n- Atualizar dependências → backlog\n- Ler capítulo 4 → esta semana',
    )
  })

  it('says nothing was done under Feito without done tasks', () => {
    const text = summaryMarkdown({ ...mockup, done: [], doneCount: 0 }, pt, 'pt-BR')
    expect(text).toContain('### Feito\n- nada concluído\n\n### Ficou para depois')
  })

  it('says nothing was left under Ficou para depois without pending tasks', () => {
    expect(summaryMarkdown({ ...mockup, later: [] }, pt, 'pt-BR').endsWith('### Ficou para depois\n- nada ficou aberto')).toBe(true)
  })

  it('counts only the done tasks without a plan, and leaves the adherence out without blocks so far', () => {
    const text = summaryMarkdown({ ...mockup, plannedCount: null, adherence: null }, pt, 'pt-BR')
    expect(text.split('\n')[1]).toBe('Focado 6h 11min · 7 concluídas')
  })

  it('writes the summary in English', () => {
    expect(summaryMarkdown(mockup, en, 'en').split('\n').slice(0, 5)).toEqual([
      '## Trackzyn · 11/11',
      'Focused 6hr 11min · 7 of 9 done · adherence 68%',
      '',
      '### Done',
      '- [x] Revisar MR do checkout (1hr 2min, Frete)',
    ])
  })
})
