import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import CaptureWindowPage from '@/pages/capture-window'
import { inbox } from '@/lib/api'
import type { TrackzynApi } from '@/lib/platform'
import { i18n, renderWithProviders } from '@/test/utils'

vi.mock('@/lib/api', () => ({ inbox: { capture: vi.fn() } }))

function installCaptureBridge() {
  const bridge = { isDesktop: true, windowRole: 'capture', closeCapture: vi.fn(async () => undefined) }
  Object.defineProperty(window, 'trackzyn', { value: bridge as unknown as TrackzynApi, configurable: true })
  return bridge
}

let bridge: ReturnType<typeof installCaptureBridge>
beforeEach(async () => {
  vi.clearAllMocks()
  bridge = installCaptureBridge()
  await i18n.changeLanguage('pt-BR')
})
afterEach(async () => {
  Reflect.deleteProperty(window, 'trackzyn')
  await i18n.changeLanguage('en')
})

const field = () => screen.getByRole('textbox', { name: 'Capturar na caixa de entrada' })

describe('/capture, the desktop capture window (CAP-06)', () => {
  it('opens with the field focused', async () => {
    renderWithProviders(<CaptureWindowPage />)
    await waitFor(() => expect(field()).toHaveFocus())
  })

  it('Enter keeps the item with the origin desktop and closes the window', async () => {
    vi.mocked(inbox.capture).mockResolvedValue({
      id: 'new',
      text: 'Ligar para o contador',
      source: 'desktop',
      created_via: null,
      list_id: null,
      estimate_minutes: null,
      draft: null,
      discarded_at: null,
      created_at: '2026-11-13T12:00:00Z',
    })
    const { user } = renderWithProviders(<CaptureWindowPage />)

    await user.type(field(), 'Ligar para o contador{Enter}')

    expect(inbox.capture).toHaveBeenCalledWith({ text: 'Ligar para o contador', source: 'desktop' })
    await waitFor(() => expect(bridge.closeCapture).toHaveBeenCalledTimes(1))
  })

  it('a failed capture keeps the window open with the text and the reason', async () => {
    vi.mocked(inbox.capture).mockRejectedValue(new Error('offline'))
    const { user } = renderWithProviders(<CaptureWindowPage />)

    await user.type(field(), 'Ligar para o contador{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para guardar. Tente de novo.')
    expect(field()).toHaveValue('Ligar para o contador')
    expect(bridge.closeCapture).not.toHaveBeenCalled()
  })

  it('Esc closes the window without keeping anything', async () => {
    const { user } = renderWithProviders(<CaptureWindowPage />)
    await user.type(field(), 'Rascunho')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(bridge.closeCapture).toHaveBeenCalledTimes(1)
    expect(inbox.capture).not.toHaveBeenCalled()
  })
})
