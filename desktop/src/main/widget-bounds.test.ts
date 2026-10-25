import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createConfigStore } from './config-store'
import { widgetBounds } from './widget-bounds'

const left = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
// A second screen to the right, its work area below a 25 px menu bar.
const right = { workArea: { x: 1920, y: 25, width: 1440, height: 875 } }

describe('focus widget position (WIDGET-09, WIDGET-10, WIDGET-11)', () => {
  it('without a saved position, opens 16 px from the top right corner of the main window screen', () => {
    expect(widgetBounds(null, [left, right], left)).toEqual({ x: 1920 - 300 - 16, y: 16, width: 300, height: 64 })
    expect(widgetBounds(null, [left, right], right)).toEqual({ x: 1920 + 1440 - 300 - 16, y: 25 + 16, width: 300, height: 64 })
    expect(widgetBounds(undefined, [left], left)).toEqual({ x: 1604, y: 16, width: 300, height: 64 })
  })

  it('opens at the saved position while it lands on a connected screen, always compact', () => {
    expect(widgetBounds({ x: 200, y: 300, width: 300, height: 64 }, [left], left)).toEqual({ x: 200, y: 300, width: 300, height: 64 })
    // Saved while the notes were open: the position stays, the size is compact again.
    expect(widgetBounds({ x: 2000, y: 500, width: 300, height: 240 }, [left, right], left)).toEqual({ x: 2000, y: 500, width: 300, height: 64 })
  })

  it('opens at the saved position while any part of it is on a screen (exact edges)', () => {
    const at = (x: number, y: number) => widgetBounds({ x, y, width: 300, height: 64 }, [left], left)
    expect(at(1919, 100)).toEqual({ x: 1919, y: 100, width: 300, height: 64 })
    expect(at(-299, 100)).toEqual({ x: -299, y: 100, width: 300, height: 64 })
    expect(at(100, 1079)).toEqual({ x: 100, y: 1079, width: 300, height: 64 })
    expect(at(100, -63)).toEqual({ x: 100, y: -63, width: 300, height: 64 })
    const corner = { x: 1604, y: 16, width: 300, height: 64 }
    expect(at(1920, 100)).toEqual(corner)
    expect(at(-300, 100)).toEqual(corner)
    expect(at(100, 1080)).toEqual(corner)
    expect(at(100, -64)).toEqual(corner)
  })

  it('opens at the initial corner when the saved position is on a screen that is gone', () => {
    expect(widgetBounds({ x: 2000, y: 500, width: 300, height: 64 }, [left], left)).toEqual({ x: 1604, y: 16, width: 300, height: 64 })
  })

  it('treats a malformed saved value as no saved position', () => {
    for (const garbage of ['x', {}, { x: 1, y: 2, width: 'a', height: 64 }, { x: NaN, y: 0, width: 300, height: 64 }]) {
      expect(widgetBounds(garbage, [left], left), JSON.stringify(garbage)).toEqual({ x: 1604, y: 16, width: 300, height: 64 })
    }
  })
})

describe('config store widget bounds (WIDGET-10)', () => {
  const dirs: string[] = []
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
  })

  function configFile() {
    const dir = mkdtempSync(path.join(tmpdir(), 'trackzyn-cfg-'))
    dirs.push(dir)
    return path.join(dir, 'config.json')
  }

  it('keeps the widget position across a new store, next to the main window bounds', () => {
    const file = configFile()
    const store = createConfigStore(file)
    expect(store.getWidgetBounds()).toBeNull()

    store.setBounds({ x: 1, y: 2, width: 900, height: 700 })
    store.setWidgetBounds({ x: 1500, y: 40, width: 300, height: 64 })

    const reopened = createConfigStore(file)
    expect(reopened.getWidgetBounds()).toEqual({ x: 1500, y: 40, width: 300, height: 64 })
    expect(reopened.getBounds()).toEqual({ x: 1, y: 2, width: 900, height: 700 })
  })

  it('reads a malformed saved widget position as none', () => {
    const file = configFile()
    writeFileSync(file, JSON.stringify({ widgetBounds: { x: 'a', y: 0, width: 300, height: 64 } }))
    expect(createConfigStore(file).getWidgetBounds()).toBeNull()
  })
})
