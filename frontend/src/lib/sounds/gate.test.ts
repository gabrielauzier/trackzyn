import { afterEach, describe, expect, it } from 'vitest'

import type { TrackzynApi } from '@/lib/platform'
import { shouldPlayHere } from '@/lib/sounds/gate'

afterEach(() => {
  delete window.trackzyn
})

describe('shouldPlayHere (SOUND-07)', () => {
  it('plays in the browser, with no desktop bridge', () => {
    expect(window.trackzyn).toBeUndefined()

    expect(shouldPlayHere()).toBe(true)
  })

  it('plays in the main window of the desktop app with no widget', () => {
    window.trackzyn = { isDesktop: true, platform: 'darwin', appVersion: '1.0.0' } as TrackzynApi

    expect(shouldPlayHere()).toBe(true)
  })
})
