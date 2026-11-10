import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import { NewTaskCard } from './new-task-card'

const work = { id: 'l1', name: 'Work', color: 1 }

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

const card = () => screen.getByRole('button', { name: 'Arrastar nova tarefa para a grade' })
const estimate = () => screen.getByRole('textbox', { name: 'Estimativa' })

describe('NewTaskCard (PLAN-48)', () => {
  it('without an estimate says Sem estimativa: 1h and drags a new task with no estimate in its list', () => {
    const onDragStart = vi.fn()
    renderWithProviders(<NewTaskCard list={work} onDragStart={onDragStart} />)

    expect(screen.getByText('Sem estimativa: 1h')).toBeInTheDocument()
    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10, button: 0 })
    expect(onDragStart).toHaveBeenCalledExactlyOnceWith(expect.anything(), { kind: 'new', estimate: null, list: work })
  })

  it('with an estimate says how long it takes on the grid and drags it with that estimate', () => {
    const onDragStart = vi.fn()
    renderWithProviders(<NewTaskCard list={work} onDragStart={onDragStart} />)

    fireEvent.change(estimate(), { target: { value: '0100' } })
    expect(estimate()).toHaveValue('01:00')
    expect(screen.getByText('Ocupa 1h na grade')).toBeInTheDocument()
    expect(screen.queryByText('Sem estimativa: 1h')).toBeNull()

    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10, button: 0 })
    expect(onDragStart).toHaveBeenCalledExactlyOnceWith(expect.anything(), { kind: 'new', estimate: 60, list: work })
  })

  it('a refused estimate shows why, as on a board card, and drags nothing', () => {
    const onDragStart = vi.fn()
    renderWithProviders(<NewTaskCard list={work} onDragStart={onDragStart} />)

    fireEvent.change(estimate(), { target: { value: '0175' } })
    expect(estimate()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).not.toBeEmptyDOMElement()
    expect(card()).toBeDisabled()
    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10, button: 0 })
    expect(onDragStart).not.toHaveBeenCalled()
  })

  it('without a list to create it in, the card is disabled', () => {
    renderWithProviders(<NewTaskCard list={null} onDragStart={vi.fn()} />)
    expect(card()).toBeDisabled()
  })
})
