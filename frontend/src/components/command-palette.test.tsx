import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'

import { CaptureOverlay } from '@/components/capture/capture-overlay'
import { CommandPalette } from '@/components/command-palette'
import { DraftGuardProvider } from '@/lib/plan/draft-guard'
import { useDraftGuard } from '@/lib/plan/draft-guard-context'
import { i18n, renderWithProviders } from '@/test/utils'

const state = vi.hoisted(() => ({ isSuperuser: false }))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { email: 'ana@example.com', is_superuser: state.isSuperuser } }),
}))
vi.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({ isLoading: false, features: {}, isEnabled: () => false, updateCheckRepo: null }),
}))

const options = () => screen.getAllByRole('option').map((option) => option.textContent ?? '')

afterEach(async () => {
  state.isSuperuser = false
  localStorage.clear()
  await i18n.changeLanguage('en')
})

/** The plan of a day holding an unsaved draft, with the palette open over it. */
function PlanWithDraft() {
  const { setDraftDay } = useDraftGuard()
  const [open, setOpen] = useState(true)
  useEffect(() => setDraftDay('2026-11-09'), [setDraftDay])
  return (
    <>
      <CommandPalette open={open} onOpenChange={setOpen} />
      <button type="button" onClick={() => setOpen(true)}>
        palette
      </button>
      <span data-testid="where">{useLocation().pathname}</span>
    </>
  )
}

describe('CommandPalette', () => {
  it('the palette hides admin screens from non-admins', async () => {
    const { user } = renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />)

    await screen.findAllByRole('option')
    const home = options()
    expect(home.some((text) => text.includes('Reports'))).toBe(true)
    for (const hidden of ['Files', 'Components', 'Upload a file']) {
      expect(home.some((text) => text.includes(hidden)), hidden).toBe(false)
    }

    // Searching for them finds nothing either.
    for (const query of ['files', 'components', 'upload', 'arquivo']) {
      await user.clear(screen.getByRole('combobox'))
      await user.type(screen.getByRole('combobox'), query)
      await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
    }
  })

  it('lists Files, Components and Upload a file for a superuser', async () => {
    state.isSuperuser = true
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />)

    await screen.findAllByRole('option')
    const home = options()
    for (const shown of ['Files', 'Components', 'Upload a file']) {
      expect(home.some((text) => text.includes(shown)), shown).toBe(true)
    }
  })

  it('CAP-04 the Capturar action closes the palette and opens the capture overlay', async () => {
    await i18n.changeLanguage('pt-BR')
    const onOpenChange = vi.fn()
    const onCapture = vi.fn()
    const { user } = renderWithProviders(<CommandPalette open onOpenChange={onOpenChange} onCapture={onCapture} />)

    await user.click((await screen.findAllByRole('option')).find((option) => option.textContent === 'Capturar')!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1))
  })

  it('CAP-04 Capturar in the palette opens the capture overlay with the field focused', async () => {
    await i18n.changeLanguage('pt-BR')
    // The palette and the overlay wired as the layout wires them.
    function PaletteAndOverlay() {
      const [palette, setPalette] = useState(true)
      const [capture, setCapture] = useState(false)
      return (
        <>
          <CommandPalette open={palette} onOpenChange={setPalette} onCapture={() => setCapture(true)} />
          <CaptureOverlay open={capture} onOpenChange={setCapture} />
        </>
      )
    }
    const { user } = renderWithProviders(<PaletteAndOverlay />)

    await user.click((await screen.findAllByRole('option')).find((option) => option.textContent === 'Capturar')!)

    expect(await screen.findByRole('dialog', { name: 'Capturar' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Capturar na caixa de entrada' })).toHaveFocus())
  })

  it('PLAN-36 leaving an unsaved plan from the palette asks Descartar o rascunho? first', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = renderWithProviders(
      <DraftGuardProvider>
        <PlanWithDraft />
      </DraftGuardProvider>,
      { route: '/planejar/2026-11-09' },
    )
    const reports = (await screen.findAllByRole('option')).find((option) => option.textContent?.includes('Relatórios'))!
    await user.click(reports)

    const dialog = await screen.findByRole('dialog', { name: 'Descartar o rascunho?' })
    expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-09')
    await user.click(within(dialog).getByRole('button', { name: 'Continuar planejando' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-09')

    // The palette again: `Descartar` goes where it was asked to.
    await user.click(screen.getByRole('button', { name: 'palette' }))
    await user.click((await screen.findAllByRole('option')).find((option) => option.textContent?.includes('Relatórios'))!)
    await user.click(within(await screen.findByRole('dialog', { name: 'Descartar o rascunho?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/reports'))
  })
})
