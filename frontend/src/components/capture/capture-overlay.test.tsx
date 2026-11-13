import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { CaptureOverlay } from '@/components/capture/capture-overlay'
import { useCaptureHotkey } from '@/hooks/use-capture-hotkey'
import { inbox } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'

vi.mock('@/lib/api', () => ({ inbox: { capture: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

/** A screen of the app with the overlay mounted, as the layout mounts it. */
function Screen({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const openCapture = useCallback(() => setOpen(true), [])
  useCaptureHotkey(openCapture)
  return <CaptureOverlay open={open} onOpenChange={setOpen} />
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('pt-BR')
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

const field = () => screen.getByRole('textbox', { name: 'Capturar na caixa de entrada' })

describe('CaptureOverlay', () => {
  it('CAP-04 ⌘⇧Space opens the overlay with the field focused', async () => {
    renderWithProviders(<Screen />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(document, { key: ' ', code: 'Space', metaKey: true, shiftKey: true })
    })

    expect(await screen.findByRole('dialog', { name: 'Capturar' })).toBeInTheDocument()
    await waitFor(() => expect(field()).toHaveFocus())
  })

  it('CAP-04 Ctrl+Shift+Space opens the overlay with the field focused', async () => {
    renderWithProviders(<Screen />)

    act(() => {
      fireEvent.keyDown(document, { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true })
    })

    expect(await screen.findByRole('dialog', { name: 'Capturar' })).toBeInTheDocument()
    await waitFor(() => expect(field()).toHaveFocus())
  })

  it('CAP-01 Enter keeps the text with the origin app and closes', async () => {
    vi.mocked(inbox.capture).mockResolvedValue({
      id: 'new',
      text: 'Ligar para o contador',
      source: 'app',
      created_via: null,
      list_id: null,
      estimate_minutes: null,
      draft: null,
      discarded_at: null,
      created_at: '2026-11-13T12:00:00Z',
    })
    const { user } = renderWithProviders(<Screen initiallyOpen />)

    await user.type(field(), 'Ligar para o contador{Enter}')

    expect(inbox.capture).toHaveBeenCalledWith({ text: 'Ligar para o contador', source: 'app' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Guardado na caixa')
  })

  it('CAP-05 Esc closes without keeping anything', async () => {
    const { user } = renderWithProviders(<Screen initiallyOpen />)

    await user.type(field(), 'Uma ideia')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(inbox.capture).not.toHaveBeenCalled()
  })

  it('a network failure keeps the text and shows Não deu para guardar. Tente de novo.', async () => {
    vi.mocked(inbox.capture).mockRejectedValue(new Error('Network Error'))
    const { user } = renderWithProviders(<Screen initiallyOpen />)

    await user.type(field(), 'Uma ideia{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para guardar. Tente de novo.')
    expect(field()).toHaveValue('Uma ideia')
    expect(screen.getByRole('dialog', { name: 'Capturar' })).toBeInTheDocument()
  })
})
