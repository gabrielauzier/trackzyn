import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { ProductiveCards } from '@/components/reports/productive-cards'
import { i18n, renderWithProviders } from '@/test/utils'

const card = (label: string) => screen.getByRole('group', { name: label })

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('ProductiveCards (REPORT-05, REPORT-12)', () => {
  it('shows the hour range, the weekday and the month', () => {
    renderWithProviders(<ProductiveCards productive={{ hours: [18], weekdays: [1], months: ['2026-10'] }} />)

    expect(card('Hora mais produtiva')).toHaveTextContent(/^Hora mais produtiva18–19h$/)
    expect(card('Dia mais produtivo')).toHaveTextContent(/^Dia mais produtivoSegunda$/)
    expect(card('Mês mais produtivo')).toHaveTextContent(/^Mês mais produtivoout\. de 2026$/)
    expect(screen.queryByText('Sem atividade no período')).not.toBeInTheDocument()
  })

  it('lists every tied weekday', () => {
    renderWithProviders(<ProductiveCards productive={{ hours: [18], weekdays: [1, 3], months: ['2026-10'] }} />)

    expect(card('Dia mais produtivo')).toHaveTextContent(/^Dia mais produtivoSegunda e quarta$/)
  })

  it('shows a dash in each card and Sem atividade no período without activity', () => {
    renderWithProviders(<ProductiveCards productive={{ hours: [], weekdays: [], months: [] }} />)

    expect(card('Hora mais produtiva')).toHaveTextContent(/^Hora mais produtiva—$/)
    expect(card('Dia mais produtivo')).toHaveTextContent(/^Dia mais produtivo—$/)
    expect(card('Mês mais produtivo')).toHaveTextContent(/^Mês mais produtivo—$/)
    expect(screen.getByText('Sem atividade no período')).toBeInTheDocument()
  })
})
