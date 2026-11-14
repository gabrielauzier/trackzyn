import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import { CaptureShortcutSettings } from '@/components/capture/capture-shortcut-settings'
import type { SetCaptureShortcutResult, TrackzynApi } from '@/lib/platform'
import { i18n, renderWithProviders } from '@/test/utils'

const DEFAULT = { enabled: true, accelerator: 'CommandOrControl+Shift+Space' }

function installBridge(platform: string, saved = DEFAULT, result: SetCaptureShortcutResult = { ok: true }) {
  const bridge = {
    isDesktop: true,
    platform,
    windowRole: 'main',
    getCaptureShortcut: vi.fn(async () => saved),
    setCaptureShortcut: vi.fn(async () => result),
  }
  Object.defineProperty(window, 'trackzyn', { value: bridge as unknown as TrackzynApi, configurable: true })
  return bridge
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})
afterEach(async () => {
  Reflect.deleteProperty(window, 'trackzyn')
  await i18n.changeLanguage('en')
})

const shortcutSwitch = () => screen.getByRole('switch', { name: 'Atalho de captura' })
const recorder = () => screen.getByRole('button', { name: /Combinação/ })

describe('CaptureShortcutSettings, the Neste computador card (CAP-07, CAP-08)', () => {
  it('does not show outside the desktop', () => {
    renderWithProviders(<CaptureShortcutSettings />)
    expect(screen.queryByRole('heading', { name: 'Neste computador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows the saved shortcut on and its combination as ⌘⇧Space on macOS', async () => {
    installBridge('darwin')
    renderWithProviders(<CaptureShortcutSettings />)
    expect(screen.getByRole('heading', { name: 'Neste computador' })).toBeInTheDocument()
    await waitFor(() => expect(shortcutSwitch()).toHaveAttribute('aria-checked', 'true'))
    expect(recorder()).toHaveTextContent('⌘⇧Space')
  })

  it('shows the combination as Ctrl+Shift+Space on Windows and Linux', async () => {
    installBridge('win32')
    renderWithProviders(<CaptureShortcutSettings />)
    await waitFor(() => expect(recorder()).toHaveTextContent('Ctrl+Shift+Space'))
  })

  it('turning it off calls the IPC with the switch off (CAP-07)', async () => {
    const bridge = installBridge('linux')
    const { user } = renderWithProviders(<CaptureShortcutSettings />)
    await waitFor(() => expect(shortcutSwitch()).toHaveAttribute('aria-checked', 'true'))

    await user.click(shortcutSwitch())

    expect(bridge.setCaptureShortcut).toHaveBeenCalledWith({ enabled: false, accelerator: 'CommandOrControl+Shift+Space' })
    await waitFor(() => expect(shortcutSwitch()).toHaveAttribute('aria-checked', 'false'))
  })

  it('recording a new combination calls the IPC with it, on (CAP-07)', async () => {
    const bridge = installBridge('linux')
    const { user } = renderWithProviders(<CaptureShortcutSettings />)
    await waitFor(() => expect(recorder()).toHaveTextContent('Ctrl+Shift+Space'))

    await user.click(recorder())
    expect(recorder()).toHaveTextContent('Aperte a combinação')
    fireEvent.keyDown(recorder(), { key: 'k', code: 'KeyK', ctrlKey: true, altKey: true })

    expect(bridge.setCaptureShortcut).toHaveBeenCalledWith({ enabled: true, accelerator: 'CommandOrControl+Alt+K' })
    await waitFor(() => expect(recorder()).toHaveTextContent('Ctrl+Alt+K'))
    expect(shortcutSwitch()).toHaveAttribute('aria-checked', 'true')
  })

  it('a key without a modifier is not taken as a combination', async () => {
    const bridge = installBridge('linux')
    const { user } = renderWithProviders(<CaptureShortcutSettings />)
    await waitFor(() => expect(recorder()).toHaveTextContent('Ctrl+Shift+Space'))

    await user.click(recorder())
    fireEvent.keyDown(recorder(), { key: 'k', code: 'KeyK' })
    fireEvent.keyDown(recorder(), { key: 'Control', code: 'ControlLeft', ctrlKey: true })

    expect(bridge.setCaptureShortcut).not.toHaveBeenCalled()
  })

  it('Esc stops recording and keeps the combination', async () => {
    const bridge = installBridge('linux')
    const { user } = renderWithProviders(<CaptureShortcutSettings />)
    await waitFor(() => expect(recorder()).toHaveTextContent('Ctrl+Shift+Space'))

    await user.click(recorder())
    fireEvent.keyDown(recorder(), { key: 'Escape', code: 'Escape' })

    expect(recorder()).toHaveTextContent('Ctrl+Shift+Space')
    expect(bridge.setCaptureShortcut).not.toHaveBeenCalled()
  })

  it('a combination in use shows Esse atalho já está em uso and the switch off (CAP-08)', async () => {
    installBridge('linux', DEFAULT, { ok: false, reason: 'in_use' })
    const { user } = renderWithProviders(<CaptureShortcutSettings />)
    await waitFor(() => expect(recorder()).toHaveTextContent('Ctrl+Shift+Space'))

    await user.click(recorder())
    fireEvent.keyDown(recorder(), { key: 'k', code: 'KeyK', ctrlKey: true, altKey: true })

    expect(await screen.findByText('Esse atalho já está em uso')).toBeInTheDocument()
    expect(shortcutSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(recorder()).toHaveTextContent('Ctrl+Alt+K')
  })

  it('turning it on with the combination in use shows the message and keeps it off (CAP-08)', async () => {
    const bridge = installBridge('linux', { enabled: false, accelerator: 'Alt+Space' }, { ok: false, reason: 'in_use' })
    const { user } = renderWithProviders(<CaptureShortcutSettings />)
    await waitFor(() => expect(recorder()).toHaveTextContent('Alt+Space'))

    await user.click(shortcutSwitch())

    expect(bridge.setCaptureShortcut).toHaveBeenCalledWith({ enabled: true, accelerator: 'Alt+Space' })
    expect(await screen.findByText('Esse atalho já está em uso')).toBeInTheDocument()
    expect(shortcutSwitch()).toHaveAttribute('aria-checked', 'false')
  })
})
