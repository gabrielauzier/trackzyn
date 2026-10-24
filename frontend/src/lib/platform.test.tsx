import { afterEach, describe, expect, it } from 'vitest'
import { getDesktopApi, isDesktop } from './platform'

afterEach(() => {
  Reflect.deleteProperty(window, 'launchkit')
})

describe('platform', () => {
  it('is not desktop without window.launchkit', () => {
    expect(isDesktop()).toBe(false)
    expect(() => getDesktopApi()).toThrow()
  })

  it('is desktop only when window.launchkit.isDesktop is true', () => {
    Object.defineProperty(window, 'launchkit', { value: { isDesktop: false }, configurable: true })
    expect(isDesktop()).toBe(false)
    Object.defineProperty(window, 'launchkit', { value: { isDesktop: true }, configurable: true })
    expect(isDesktop()).toBe(true)
    expect(getDesktopApi().isDesktop).toBe(true)
  })
})
