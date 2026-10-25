import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { PrintHeader } from '@/components/reports/print-header'
import { i18n, renderWithProviders } from '@/test/utils'

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PrintHeader (REPORT-23)', () => {
  it('names the overview, its period and its list for the printed page', () => {
    renderWithProviders(<PrintHeader from="2026-10-19" to="2026-10-25" listName="Semana" />)

    expect(screen.getByText('Relatórios · Visão geral')).toBeInTheDocument()
    expect(screen.getByText('Período: 19 de out. de 2026 - 25 de out. de 2026')).toBeInTheDocument()
    expect(screen.getByText('Lista: Semana')).toBeInTheDocument()
  })
})
