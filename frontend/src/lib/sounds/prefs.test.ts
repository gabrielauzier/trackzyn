import { describe, expect, it, vi } from 'vitest'

import { isEnabled, setEnabled } from '@/lib/sounds/prefs'
import type { SoundKind } from '@/lib/sounds/synth'

const KINDS: SoundKind[] = ['complete', 'progress', 'estimate', 'break_end']

describe('sound switches (SOUND-06)', () => {
  it('has every sound on by default', () => {
    expect(KINDS.map(isEnabled)).toEqual([true, true, true, true])
  })

  it('turns off only progress, leaving the other 3 on', () => {
    setEnabled('progress', false)

    expect(isEnabled('progress')).toBe(false)
    expect(isEnabled('complete')).toBe(true)
    expect(isEnabled('estimate')).toBe(true)
    expect(isEnabled('break_end')).toBe(true)
  })

  it('keeps the switch in localStorage on this device, so it survives a reload', async () => {
    setEnabled('progress', false)
    expect(localStorage.getItem('trackzyn.sounds')).not.toBeNull()

    vi.resetModules()
    const reloaded = await import('@/lib/sounds/prefs')

    expect(KINDS.map(reloaded.isEnabled)).toEqual([true, false, true, true])
  })

  it('turns a sound back on', () => {
    setEnabled('estimate', false)
    setEnabled('estimate', true)

    expect(isEnabled('estimate')).toBe(true)
  })
})
