import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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

/** The plan page as far as the guard sees it: a draft to make or clear, and an in-app link that asks first. */
function PlanRoute() {
  const { setDraftDay, confirmLeave } = useDraftGuard()
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => setDraftDay('2026-11-09')}>
        draft
      </button>
      <button type="button" onClick={() => setDraftDay(null)}>
        save
      </button>
      <button type="button" onClick={() => confirmLeave(() => navigate('/agenda'))}>
        agenda
      </button>
    </>
  )
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

/** The real `BrowserRouter` on jsdom's `window.history`, opened on `/` and then on the plan by a link. */
async function showInBrowser() {
  window.history.replaceState(null, '', '/')
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <DraftGuardProvider>
          <Routes>
            <Route path="/" element={<Link to="/planejar/2026-11-09">plan</Link>} />
            <Route path="/planejar/:day" element={<PlanRoute />} />
            <Route path="/agenda" element={<span>agenda page</span>} />
          </Routes>
          <Where />
        </DraftGuardProvider>
      </BrowserRouter>
    </I18nextProvider>,
  )
  await user.click(screen.getByRole('link', { name: 'plan' }))
  expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-09')
  return user
}

const where = () => screen.getByTestId('where')
const back = () => act(() => window.history.back())

describe('DraftGuardProvider and the browser Back (PLAN-36)', () => {
  it('with a draft, Back asks `Descartar o rascunho?` and stays on the plan; `Descartar` goes back', async () => {
    const user = await showInBrowser()
    await user.click(screen.getByRole('button', { name: 'draft' }))

    back()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Descartar o rascunho?' })).toBeInTheDocument()
    expect(where()).toHaveTextContent('/planejar/2026-11-09')
    expect(window.location.pathname).toBe('/planejar/2026-11-09')

    await user.click(within(dialog).getByRole('button', { name: 'Continuar planejando' }))
    expect(where()).toHaveTextContent('/planejar/2026-11-09')

    // Still guarded: Back asks again and stays on the plan, and `Descartar` leaves for the page before the plan.
    back()
    const again = await screen.findByRole('dialog')
    expect(within(again).getByRole('heading', { name: 'Descartar o rascunho?' })).toBeInTheDocument()
    expect(where()).toHaveTextContent('/planejar/2026-11-09')
    expect(window.location.pathname).toBe('/planejar/2026-11-09')
    await user.click(within(again).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(where()).toHaveTextContent(/^\/$/))
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('without a draft any more, Back leaves at once: the saved plan leaves no extra entry behind', async () => {
    const user = await showInBrowser()
    await user.click(screen.getByRole('button', { name: 'draft' }))
    await user.click(screen.getByRole('button', { name: 'save' }))
    // The extra entry of the plan is popped in place.
    await waitFor(() => expect(window.history.state?.planDraftGuard).toBeUndefined())
    expect(where()).toHaveTextContent('/planejar/2026-11-09')

    back()
    await waitFor(() => expect(where()).toHaveTextContent(/^\/$/))
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a link discarded out of the draft leaves no extra entry of the plan: Back from it opens the plan, then the page before', async () => {
    const user = await showInBrowser()
    await user.click(screen.getByRole('button', { name: 'draft' }))
    await user.click(screen.getByRole('button', { name: 'agenda' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(where()).toHaveTextContent('/agenda'))

    back()
    await waitFor(() => expect(where()).toHaveTextContent('/planejar/2026-11-09'))
    back()
    await waitFor(() => expect(where()).toHaveTextContent(/^\/$/))
  })
})
