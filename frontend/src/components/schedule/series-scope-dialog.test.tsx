import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { SeriesScopeDialog } from '@/components/schedule/series-scope-dialog'
import { renderWithProviders } from '@/test/utils'

function show(props: Partial<Parameters<typeof SeriesScopeDialog>[0]> = {}) {
  const onChoose = vi.fn()
  const onCancel = vi.fn()
  const result = renderWithProviders(<SeriesScopeDialog open variant="move" onChoose={onChoose} onCancel={onCancel} {...props} />)
  return { ...result, onChoose, onCancel }
}

describe('SeriesScopeDialog: moving an occurrence (US-12, D16)', () => {
  it('offers this occurrence only and this and the next ones, each with what it does', () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Change a repeating task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^This occurrence only/ })).toHaveTextContent(
      'This occurrence onlyChanges this task only. The next ones follow the rule.',
    )
    expect(screen.getByRole('button', { name: /^This and the next ones/ })).toHaveTextContent(
      'This and the next onesFrom this one on, the rule takes the new day and the new time.',
    )
  })

  it.each([
    [/^This occurrence only/, 'occurrence'],
    [/^This and the next ones/, 'series'],
  ])('answers the scope of the option chosen: %s', async (name, scope) => {
    const { user, onChoose, onCancel } = show()
    await user.click(screen.getByRole('button', { name }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(scope)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels without a scope on Cancel and on Esc', async () => {
    const { user, onChoose, onCancel } = show()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onChoose).not.toHaveBeenCalled()
  })
})

describe('SeriesScopeDialog: deleting an occurrence (US-12)', () => {
  it('names the day of the next occurrence and reminds of Skip this occurrence', () => {
    show({ variant: 'delete', title: 'Weekly review', nextOn: '2026-11-20' })
    expect(screen.getByRole('dialog', { name: 'Delete a repeating task' })).toHaveTextContent('Weekly review is an occurrence of a series.')
    expect(screen.getByRole('button', { name: /^Delete this one only/ })).toHaveTextContent('The next occurrence is created for Fri, Nov 20.')
    expect(screen.getByRole('button', { name: /^Delete this one and end the series/ })).toHaveTextContent('No new occurrence is created.')
    expect(screen.getByRole('dialog')).toHaveTextContent('To only postpone it, use Skip this occurrence.')
  })

  it('says it is the last occurrence when the series has no next day', () => {
    show({ variant: 'delete', title: 'Weekly review', nextOn: null })
    expect(screen.getByRole('button', { name: /^Delete this one only/ })).toHaveTextContent('This is the last occurrence of the series.')
  })

  it.each([
    [/^Delete this one only/, 'occurrence'],
    [/^Delete this one and end the series/, 'series'],
  ])('answers the scope of the option chosen: %s', async (name, scope) => {
    const { user, onChoose } = show({ variant: 'delete', title: 'Weekly review', nextOn: '2026-11-20' })
    await user.click(screen.getByRole('button', { name }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(scope)
  })

  it('cancels without a scope on Esc', async () => {
    const { user, onChoose, onCancel } = show({ variant: 'delete', title: 'Weekly review', nextOn: '2026-11-20' })
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onChoose).not.toHaveBeenCalled()
  })
})
