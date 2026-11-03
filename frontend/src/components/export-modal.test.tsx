import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExportModal } from './export-modal'
import { writesBlocked } from '@/lib/write-lock'
import { I18nextProvider } from 'react-i18next'
import { i18n } from '@/test/utils'
import type { TrackzynApi } from '@/lib/platform'

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
})

function install() {
  let emit: (state: { exporting: boolean }) => void = () => {}
  const api = { isDesktop: true, onExportState: vi.fn((callback: typeof emit) => { emit = callback; return () => {} }) } as unknown as TrackzynApi
  Object.defineProperty(window, 'trackzyn', { value: api, configurable: true })
  return (state: { exporting: boolean }) => act(() => emit(state))
}

describe('export modal', () => {
  it('blocks the interface and every write while exporting', async () => {
    const emit = install()
    render(<I18nextProvider i18n={i18n}><ExportModal /></I18nextProvider>)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writesBlocked()).toBe(false)

    emit({ exporting: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(writesBlocked()).toBe(true)

    // The client refuses the three kinds of write and still reads.
    const { workspaces } = await import('@/lib/api')
    await expect(workspaces.create({ name: 'x' })).rejects.toThrow('Writes are blocked')
    await expect(workspaces.update('1', { name: 'y' })).rejects.toThrow('Writes are blocked')
    await expect(workspaces.removeMember('1', '2')).rejects.toThrow('Writes are blocked')

    emit({ exporting: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writesBlocked()).toBe(false)
  })
})
