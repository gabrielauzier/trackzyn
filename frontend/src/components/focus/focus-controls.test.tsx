import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { FocusControls } from '@/components/focus/focus-controls'
import type { Display } from '@/lib/focus/display'
import { i18n, renderWithProviders } from '@/test/utils'

const TASK = 'task-a'

function renderControls(display: Display, pending = 2, spentSeconds?: number) {
  const actions = {
    start: vi.fn(),
    pause: vi.fn(),
    skip: vi.fn(),
    complete: vi.fn(),
    takeBreak: vi.fn(),
    endBreak: vi.fn(),
  }
  const result = renderWithProviders(<FocusControls display={display} taskId={TASK} pending={pending} spentSeconds={spentSeconds} actions={actions} />)
  return { ...result, actions }
}

const buttonNames = () => screen.getAllByRole('button').map((button) => button.textContent?.trim())

describe('FocusControls', () => {
  it('pauses the task counting (FOCUS-04)', async () => {
    const { user, actions } = renderControls({ mode: 'countdown', seconds: 3000 })

    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(actions.pause).toHaveBeenCalledTimes(1)
  })

  it('resumes the paused task with a new start on it (FOCUS-05)', async () => {
    const { user, actions } = renderControls({ mode: 'paused', seconds: 3000 })

    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume' }))

    expect(actions.start).toHaveBeenCalledTimes(1)
    expect(actions.start).toHaveBeenCalledWith(TASK)
  })

  it('skips the task in focus (FOCUS-06)', async () => {
    const { user, actions } = renderControls({ mode: 'countup', seconds: 3601 })

    await user.click(screen.getByRole('button', { name: 'Skip' }))

    expect(actions.skip).toHaveBeenCalledWith(TASK)
  })

  it('disables Skip with one pending task in Today (FOCUS-07)', () => {
    renderControls({ mode: 'countdown', seconds: 3000 }, 1)

    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled()
  })

  it('completes the task in focus (FOCUS-08)', async () => {
    const { user, actions } = renderControls({ mode: 'countdown', seconds: 3000 })

    await user.click(screen.getByRole('button', { name: 'Complete' }))

    expect(actions.complete).toHaveBeenCalledWith(TASK)
  })

  it('takes the break picked (BREAK-01)', async () => {
    const { user, actions } = renderControls({ mode: 'countdown', seconds: 3000 })

    await user.click(screen.getByRole('button', { name: 'Break' }))
    await user.click(screen.getByRole('button', { name: '10 min' }))

    expect(actions.takeBreak).toHaveBeenCalledWith(10)
  })

  it('shows only End break during a break, and ends it (BREAK-04)', async () => {
    const { user, actions } = renderControls({ mode: 'break', seconds: 240 })

    expect(buttonNames()).toEqual(['End break'])
    await user.click(screen.getByRole('button', { name: 'End break' }))

    expect(actions.endBreak).toHaveBeenCalledTimes(1)
  })

  it('a task that never counted shows Start', async () => {
    const { user, actions } = renderControls({ mode: 'paused', seconds: 2700 }, 2, 0)

    // Start (with the play icon) first, then Skip and Complete.
    expect(buttonNames().slice(0, 3)).toEqual(['Start', 'Skip', 'Complete'])
    expect(screen.getByRole('button', { name: 'Start' }).querySelector('svg')).toHaveClass('lucide-play')
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(actions.start).toHaveBeenCalledWith(TASK)
  })

  it('a paused task with time spent shows Resume', () => {
    renderControls({ mode: 'paused', seconds: 2100 }, 2, 600)

    expect(buttonNames().slice(0, 3)).toEqual(['Resume', 'Skip', 'Complete'])
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('reads Começar in Portuguese for a task that never counted', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderControls({ mode: 'paused', seconds: 2700 }, 2, 0)

      expect(buttonNames()).toEqual(['Começar', 'Pular', 'Concluir', 'Intervalo'])
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows the controls in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderControls({ mode: 'paused', seconds: 3000 })

      expect(buttonNames()).toEqual(['Retomar', 'Pular', 'Concluir', 'Intervalo'])
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
