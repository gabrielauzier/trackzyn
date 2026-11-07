import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import type { PlannedBlock as Planned } from '@/types'
import { PlannedBlock } from './planned-block'

const TODAY = '2026-11-09'
const list = { id: 'l1', name: 'Work', color: 3 }

const coffee = (day: string): Planned => ({ id: 'p1', day, kind: 'break', start: '10:30', minutes: 15, name: 'Café', list })
const task: Planned = {
  id: 'p2',
  day: TODAY,
  kind: 'task',
  start: '10:45',
  minutes: 75,
  task: { id: 't1', title: 'Escrever a spec', list, done: false, scheduled_on: TODAY, estimate_minutes: 75 },
}

const piece = (planned: Planned, start: number) => ({ planned, start, end: start + planned.minutes, lane: 0, lanes: 1 })

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PlannedBlock (PLAN-24, PLAN-28)', () => {
  it('a break of today shows Começar, which starts it without opening the block', async () => {
    const onStart = vi.fn()
    const onOpen = vi.fn()
    const { user } = renderWithProviders(
      <PlannedBlock piece={piece(coffee(TODAY), 630)} pxPerMinute={1} today={TODAY} onStart={onStart} onOpen={onOpen} />,
    )

    await user.click(screen.getByRole('button', { name: 'Começar' }))

    expect(onStart).toHaveBeenCalledExactlyOnceWith(coffee(TODAY))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a break of another day has no Começar', () => {
    renderWithProviders(<PlannedBlock piece={piece(coffee('2026-11-10'), 630)} pxPerMinute={1} today={TODAY} onStart={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^Café, 10:30 – 10:45/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Começar' })).toBeNull()
  })

  it('draws a break gray and hatched, and a task dashed in the colour of its list, without Começar', async () => {
    const { user, unmount } = renderWithProviders(<PlannedBlock piece={piece(coffee(TODAY), 630)} pxPerMinute={1} today={TODAY} />)
    expect(screen.getByRole('button', { name: /^Café/ }).style.backgroundImage).toContain('repeating-linear-gradient')
    unmount()

    const onOpen = vi.fn()
    renderWithProviders(<PlannedBlock piece={piece(task, 645)} pxPerMinute={1} today={TODAY} onStart={vi.fn()} onOpen={onOpen} />)
    const block = screen.getByRole('button', { name: /^Escrever a spec, 10:45 – 12:00/ })
    expect(block).toHaveClass('border-dashed')
    expect(block.style.borderColor).toBe('var(--chart-3)')
    expect(screen.queryByRole('button', { name: 'Começar' })).toBeNull()

    await user.click(block)
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(task)
  })
})
