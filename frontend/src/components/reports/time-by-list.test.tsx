import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { TimeByList } from '@/components/reports/time-by-list'
import { i18n, renderWithProviders } from '@/test/utils'
import type { Overview } from '@/types'

const list = (id: string, name: string, minutes: number): Overview['by_list'][number] => ({
  list_id: id,
  name,
  color: 3,
  is_archived: false,
  seconds: minutes * 60,
})

const legend = () => screen.getAllByRole('listitem').map((item) => item.textContent)
const percentages = () => legend().map((text) => Number(/(\d+)%$/.exec(text ?? '')?.[1]))

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('TimeByList (REPORT-06, REPORT-12)', () => {
  it('shows one list of 16h 52min and 10min of breaks as 99% and 1% of 17h 2min', () => {
    renderWithProviders(<TimeByList byList={[list('a', 'Semana', 16 * 60 + 52)]} breakSeconds={600} />)

    expect(screen.getByText('1 lista, Tempo total: 17h 2min')).toBeInTheDocument()
    expect(legend()).toEqual(['Semana16h 52min99%', 'Intervalos10min1%'])
  })

  it('counts two lists in the header', () => {
    renderWithProviders(<TimeByList byList={[list('a', 'Semana', 60), list('b', 'Casa', 30)]} breakSeconds={0} />)

    expect(screen.getByText('2 listas, Tempo total: 1h 30min')).toBeInTheDocument()
    expect(legend()).toEqual(['Semana1h67%', 'Casa30min33%', 'Intervalos0min0%'])
  })

  it('makes the percentages add up to 100', () => {
    renderWithProviders(
      <TimeByList byList={[list('a', 'Semana', 20), list('b', 'Casa', 20), list('c', 'Estudo', 20)]} breakSeconds={0} />,
    )

    expect(percentages().reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(percentages()).toEqual([34, 33, 33, 0])
  })

  it('says 0 listas when only breaks have time', () => {
    renderWithProviders(<TimeByList byList={[]} breakSeconds={600} />)

    expect(screen.getByText('0 listas, Tempo total: 10min')).toBeInTheDocument()
    expect(legend()).toEqual(['Intervalos10min100%'])
  })

  it('shows Sem atividade no período without any session', () => {
    renderWithProviders(<TimeByList byList={[]} breakSeconds={0} />)

    expect(screen.getByText('Sem atividade no período')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
