import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import { BreakDialog } from './break-dialog'

const work = { id: 'l1', name: 'Work', color: 1 }
const home = { id: 'l2', name: 'Home', color: 3 }

function show() {
  const onCreate = vi.fn()
  const onOpenChange = vi.fn()
  const result = renderWithProviders(<BreakDialog open onOpenChange={onOpenChange} lists={[work, home]} onCreate={onCreate} />)
  return { onCreate, onOpenChange, ...result }
}

const setDuration = (value: string) => fireEvent.change(screen.getByLabelText('Duration'), { target: { value } })

describe('BreakDialog (PLAN-16, PLAN-17, PLAN-18)', () => {
  it('creates the break with its name, its length and the first active list', async () => {
    const { user, onCreate, onOpenChange } = show()
    expect(screen.getByRole('combobox', { name: 'Break list' })).toHaveTextContent('Work')
    await user.type(screen.getByLabelText('Name'), '  Walk  ')
    setDuration('00:20')
    await user.click(screen.getByRole('button', { name: 'Create break' }))
    expect(onCreate).toHaveBeenCalledExactlyOnceWith({ kind: 'break', name: 'Walk', minutes: 20, list: work })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('creates the break on the list chosen', async () => {
    const { user, onCreate } = show()
    await user.type(screen.getByLabelText('Name'), 'Walk')
    await user.click(screen.getByRole('combobox', { name: 'Break list' }))
    await user.click(await screen.findByRole('option', { name: 'Home' }))
    await user.click(screen.getByRole('button', { name: 'Create break' }))
    expect(onCreate).toHaveBeenCalledExactlyOnceWith({ kind: 'break', name: 'Walk', minutes: 15, list: home })
  })

  it('does not create a break with an empty name', async () => {
    const { user, onCreate } = show()
    await user.type(screen.getByLabelText('Name'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create break' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('The name takes 1 to 40 characters')
  })

  it('does not create a break with a name over 40 characters, and does with 40', async () => {
    const { user, onCreate } = show()
    await user.type(screen.getByLabelText('Name'), 'x'.repeat(41))
    await user.click(screen.getByRole('button', { name: 'Create break' }))
    expect(onCreate).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Name'), '{Backspace}')
    await user.click(screen.getByRole('button', { name: 'Create break' }))
    expect(onCreate).toHaveBeenCalledExactlyOnceWith({ kind: 'break', name: 'x'.repeat(40), minutes: 15, list: work })
  })

  it.each([
    ['00:04', 'under 5 min'],
    ['02:01', 'over 2h'],
    ['', 'empty'],
  ])('refuses %s (%s) with A pausa vai de 5 min a 2h', async (value) => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user, onCreate } = show()
      await user.type(screen.getByLabelText('Nome'), 'Caminhada')
      fireEvent.change(screen.getByLabelText('Duração'), { target: { value } })
      await user.click(screen.getByRole('button', { name: 'Criar pausa' }))
      expect(onCreate).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent('A pausa vai de 5 min a 2h')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('accepts the edges, 5 min and 2h', async () => {
    const { user, onCreate } = show()
    await user.type(screen.getByLabelText('Name'), 'Walk')
    setDuration('00:05')
    await user.click(screen.getByRole('button', { name: 'Create break' }))
    setDuration('02:00')
    await user.click(screen.getByRole('button', { name: 'Create break' }))
    expect(onCreate.mock.calls.map(([item]) => item.minutes)).toEqual([5, 120])
  })

  it('closes on Esc and on Cancel without creating', async () => {
    const { user, onCreate, onOpenChange } = show()
    await user.type(screen.getByLabelText('Name'), 'Walk')
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledTimes(2)
    expect(onCreate).not.toHaveBeenCalled()
  })
})
