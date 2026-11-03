import { afterEach, describe, expect, it } from 'vitest'
import { getDesktopApi, isDesktop } from './platform'

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
})

describe('platform', () => {
  it('is not desktop without window.trackzyn', () => {
    expect(isDesktop()).toBe(false)
    expect(() => getDesktopApi()).toThrow()
  })

  it('is desktop only when window.trackzyn.isDesktop is true', () => {
    Object.defineProperty(window, 'trackzyn', { value: { isDesktop: false }, configurable: true })
    expect(isDesktop()).toBe(false)
    Object.defineProperty(window, 'trackzyn', { value: { isDesktop: true }, configurable: true })
    expect(isDesktop()).toBe(true)
    expect(getDesktopApi().isDesktop).toBe(true)
  })
})
