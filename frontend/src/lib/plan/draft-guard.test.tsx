import { useState } from 'react'
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import { DraftGuardProvider } from './draft-guard'
import { useDraftGuard } from './draft-guard-context'

/** A page that may hold a draft and a link that leaves it through the guard. */
function Page() {
  const { setDraftDay, confirmLeave } = useDraftGuard()
  const [left, setLeft] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setDraftDay('2026-11-09')}>
        draft
      </button>
      <button type="button" onClick={() => confirmLeave(() => setLeft(true))}>
        leave
      </button>
      <span data-testid="where">{left ? 'left' : 'here'}</span>
    </>
  )
}

const show = () =>
  renderWithProviders(
    <DraftGuardProvider>
      <Page />
    </DraftGuardProvider>,
  )

const unload = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('DraftGuardProvider (PLAN-36)', () => {
  it('without a draft, leaves at once and the tab closes without asking', async () => {
    const { user } = show()
    expect(unload()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'leave' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('left')
  })

  it('with a draft, asks `Descartar o rascunho?`; `Continuar planejando` stays', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'draft' }))
    await user.click(screen.getByRole('button', { name: 'leave' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Descartar o rascunho?' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Continuar planejando' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('here')
    // The draft is still there: leaving asks again.
    await user.click(screen.getByRole('button', { name: 'leave' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('with a draft, `Descartar` leaves and nothing asks any more', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'draft' }))
    await user.click(screen.getByRole('button', { name: 'leave' }))

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descartar' }))

    expect(screen.getByTestId('where')).toHaveTextContent('left')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(unload()).toBe(false)
  })

  it('with a draft, closing or reloading the tab asks the browser first', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'draft' }))

    expect(unload()).toBe(true)
  })
})
