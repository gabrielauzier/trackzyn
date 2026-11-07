import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeAll, launchApp, readConfig } from './support/launch'
import { api, createLocalData, dialogState, startLocalMode, stubDialogs } from './support/local'

test.afterEach(async () => {
  await closeAll()
})

// Without a window manager (xvfb on the Linux CI), minimize and restore change no state and send no
// event: there the system's restore is the event the window manager would send.
const linux = process.platform === 'linux'

/** Ctrl+Shift+F, or Cmd+Shift+F on macOS, typed into one window as the keyboard would. */
async function pressShortcut(app: ElectronApplication, target: 'main' | 'widget'): Promise<void> {
  await app.evaluate(({ BrowserWindow }, which) => {
    const win = BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((item) => item.webContents.getURL().endsWith('/widget') === (which === 'widget'))!
    const modifiers: Array<'shift' | 'meta' | 'control'> = ['shift', process.platform === 'darwin' ? 'meta' : 'control']
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F', modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F', modifiers })
  }, target)
}

/** The widget window's page, once it exists. */
async function widgetPage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((page) => page.url().endsWith('/widget')), { timeout: 15_000 }).toBe(true)
  return app.windows().find((page) => page.url().endsWith('/widget'))!
}

/** A widget window closing can still be listed while it is destroyed; every helper skips those, or `getURL` throws. */
async function widgetCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).filter((win) => win.webContents.getURL().endsWith('/widget')).length)
}

async function mainMinimized(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((win) => !win.webContents.getURL().endsWith('/widget'))!.isMinimized())
}

/** Restores the main window the way the taskbar or the Dock does (WIDGET-19). */
async function restoreMainBySystem(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }, emitOnly) => {
    const main = BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((win) => !win.webContents.getURL().endsWith('/widget'))!
    if (emitOnly) main.emit('restore')
    else main.restore()
  }, linux)
}

/**
 * Puts the system cursor over the widget window or away from it, as the main process reads it (#34):
 * the widget page gets no mouse events over its drag region, so a page hover would show nothing.
 */
async function placeCursor(app: ElectronApplication, where: 'widget' | 'away'): Promise<void> {
  await app.evaluate(({ BrowserWindow, screen }, over) => {
    const win = BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((item) => item.webContents.getURL().endsWith('/widget'))
    const bounds = win?.getBounds()
    const point = over && bounds ? { x: bounds.x + Math.floor(bounds.width / 2), y: bounds.y + Math.floor(bounds.height / 2) } : { x: -10_000, y: -10_000 }
    screen.getCursorScreenPoint = () => point
  }, where === 'widget')
}

test('the focus widget opens, acts, expands, closes on restore and toggles with the shortcut', async () => {
  test.setTimeout(240_000)
  const { app, page, configPath } = await launchApp()
  await startLocalMode(page)
  const data = await createLocalData(page, 'widget@example.com')
  const headers = { 'X-Workspace-Id': data.workspaceId }
  const list = await api<{ id: string }>(page, '/api/lists', { method: 'POST', token: data.token, headers, json: { name: 'Week', color: 3 } })
  expect(list.status).toBe(201)
  const task = await api(page, '/api/tasks', {
    method: 'POST',
    token: data.token,
    headers,
    json: { list_id: list.body.id, title: 'Write the quarterly report', estimate_minutes: 30, column: 'today' },
  })
  expect(task.status).toBe(201)
  await page.evaluate(({ token, workspaceId }) => {
    localStorage.setItem('token', token)
    localStorage.setItem('workspace_id', workspaceId)
  }, data)
  await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed())[0]!.loadURL(url), `app://trackzyn/lists/${list.body.id}`)

  await test.step('Focus now starts the task and opens the widget over the minimized main window (WIDGET-01, WIDGET-06, WIDGET-09)', async () => {
    await page.getByRole('button', { name: 'Focus now' }).click()
    const widget = await widgetPage(app)
    await expect(widget.getByText('Write the quarterly report')).toBeVisible()
    await expect(widget.getByRole('timer')).toHaveText(/^00:(30:00|29:\d\d)$/)
    if (!linux) await expect.poll(() => mainMinimized(app)).toBe(true)

    const shape = await app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((item) => item.webContents.getURL().endsWith('/widget'))!
      const main = BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((item) => item !== win)!
      const area = screen.getDisplayMatching(main.getBounds()).workArea
      return { bounds: win.getBounds(), onTop: win.isAlwaysOnTop(), resizable: win.isResizable(), area }
    })
    expect(shape.onTop).toBe(true)
    expect(shape.resizable).toBe(false)
    expect({ width: shape.bounds.width, height: shape.bounds.height }).toEqual({ width: 300, height: 64 })
    expect(shape.bounds.x).toBe(shape.area.x + shape.area.width - 300 - 16)
    expect(shape.bounds.y).toBe(shape.area.y + 16)
  })

  await test.step('pausing in the widget stops the main window timer within 1 s (WIDGET-12, WIDGET-22)', async () => {
    const widget = await widgetPage(app)
    // The server keeps whole seconds and a task with 0 s spent offers Start, not Resume: pause only once
    // a full second ran, however the timer rounds. Without a window manager to wait for (Linux), or with a
    // quick minimize (Windows), the pause would otherwise land under a second after the start.
    await expect(widget.getByRole('timer')).toHaveText(/^00:29:([0-4]\d|5[0-8])$/, { timeout: 5000 })
    await placeCursor(app, 'widget')
    await widget.getByRole('button', { name: 'Pause' }).click()
    const clicked = Date.now()
    await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(1, { timeout: 1000 })
    expect(Date.now() - clicked).toBeLessThanOrEqual(1000)
    await expect(widget.getByRole('button', { name: 'Resume' })).toBeVisible()
    const state = await api<{ session: unknown }>(page, '/api/focus', { token: data.token, headers })
    expect(state.body.session).toBeNull()
  })

  await test.step('Expand closes the widget and brings the main window back on the focus screen (WIDGET-18)', async () => {
    const widget = await widgetPage(app)
    await placeCursor(app, 'widget')
    await widget.getByRole('button', { name: 'Expand' }).click()
    await expect.poll(() => widgetCount(app)).toBe(0)
    expect(await mainMinimized(app)).toBe(false)
    await expect(page).toHaveURL(`app://trackzyn/focus/${list.body.id}`)
  })

  await test.step('the shortcut opens the widget from the main window, and restoring the main window closes it (WIDGET-04, WIDGET-19)', async () => {
    await page.getByRole('button', { name: 'Resume' }).waitFor()
    await pressShortcut(app, 'main')
    await widgetPage(app)
    expect(await widgetCount(app)).toBe(1)
    if (!linux) await expect.poll(() => mainMinimized(app)).toBe(true)

    await restoreMainBySystem(app)
    await expect.poll(() => widgetCount(app)).toBe(0)
  })

  await test.step('the widget keeps the position it was dragged to (WIDGET-10)', async () => {
    await pressShortcut(app, 'main')
    await widgetPage(app)
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((win) => win.webContents.getURL().endsWith('/widget'))!.setPosition(120, 140)
    })
    await expect.poll(() => readConfig(configPath).widgetBounds, { timeout: 5000 }).toMatchObject({ x: 120, y: 140 })
  })

  await test.step('the shortcut in the widget does what Expand does (WIDGET-20)', async () => {
    const widget = await widgetPage(app)
    await expect(widget.getByRole('group', { name: 'Focus widget' })).toBeVisible()
    await pressShortcut(app, 'widget')
    await expect.poll(() => widgetCount(app)).toBe(0)
    expect(await mainMinimized(app)).toBe(false)
    await expect(page).toHaveURL(`app://trackzyn/focus/${list.body.id}`)

    await pressShortcut(app, 'main')
    await widgetPage(app)
    const bounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((win) => win.webContents.getURL().endsWith('/widget'))!.getBounds(),
    )
    expect({ x: bounds.x, y: bounds.y }).toEqual({ x: 120, y: 140 })
  })

  await test.step('quitting with the widget open and the task counting asks first (Edge Case, SYNC-08)', async () => {
    const widget = await widgetPage(app)
    await placeCursor(app, 'widget')
    await widget.getByRole('button', { name: 'Resume' }).click()
    await expect(widget.getByRole('button', { name: 'Pause' })).toBeVisible()
    await stubDialogs(app, { confirm: false })
    // The main window reports the counting task before the quit asks.
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(1)

    await app.evaluate(({ app: electronApp }) => electronApp.quit())
    await expect.poll(async () => (await dialogState(app)).messages).toEqual(['A task is running.'])
    // Closing at the end of the test pauses and quits.
    await stubDialogs(app, { confirm: true })
    // Cancel keeps the app open, with the main window back in front of the question.
    if (!linux) await expect.poll(() => mainMinimized(app)).toBe(false)
    expect(app.windows().length).toBeGreaterThan(0)
  })
})

test('the widget shows its controls when the cursor is over it', async () => {
  test.setTimeout(180_000)
  const { app, page } = await launchApp()
  // The test ends on Pause and closes the app: if the main window has not heard of the pause yet, it
  // asks whether to pause before closing (SYNC-08), and an unanswered system dialog holds the close.
  await stubDialogs(app, {})
  await startLocalMode(page)
  const data = await createLocalData(page, 'widget-hover@example.com')
  const headers = { 'X-Workspace-Id': data.workspaceId }
  const list = await api<{ id: string }>(page, '/api/lists', { method: 'POST', token: data.token, headers, json: { name: 'Week', color: 3 } })
  expect(list.status).toBe(201)
  for (const title of ['Write the quarterly report', 'Review the budget']) {
    const task = await api(page, '/api/tasks', { method: 'POST', token: data.token, headers, json: { list_id: list.body.id, title, estimate_minutes: 30, column: 'today' } })
    expect(task.status).toBe(201)
  }
  await page.evaluate(({ token, workspaceId }) => {
    localStorage.setItem('token', token)
    localStorage.setItem('workspace_id', workspaceId)
  }, data)
  await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed())[0]!.loadURL(url), `app://trackzyn/lists/${list.body.id}`)
  await placeCursor(app, 'away')
  await page.getByRole('button', { name: 'Focus now' }).click()
  const widget = await widgetPage(app)
  const group = widget.getByRole('group', { name: 'Focus widget' })
  await expect(widget.getByText('Write the quarterly report')).toBeVisible()
  const size = async () =>
    app.evaluate(({ BrowserWindow }) => {
      const { width, height } = BrowserWindow.getAllWindows().filter((open) => !open.isDestroyed() && !open.webContents.isDestroyed()).find((item) => item.webContents.getURL().endsWith('/widget'))!.getBounds()
      return { width, height }
    })

  await test.step('at rest, the title and the timer only', async () => {
    await expect(widget.getByRole('timer')).toBeVisible()
    await expect(widget.getByRole('button')).toHaveCount(0)
  })

  await test.step('the cursor over the widget shows the controls, in the same 300×64', async () => {
    await placeCursor(app, 'widget')
    await expect(widget.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(widget.getByRole('button', { name: 'Skip' })).toBeVisible()
    await expect(widget.getByRole('button', { name: 'Expand' })).toBeVisible()
    expect(await size()).toEqual({ width: 300, height: 64 })
  })

  await test.step('the cursor leaving hides them, and coming back any time later shows them again', async () => {
    for (let round = 0; round < 2; round += 1) {
      await placeCursor(app, 'away')
      await expect(widget.getByRole('button')).toHaveCount(0)
      await placeCursor(app, 'widget')
      await expect(widget.getByRole('button', { name: 'Pause' })).toBeVisible()
    }
  })

  await test.step('the whole window drags, the row of controls takes the clicks', async () => {
    const regions = await group.evaluate((element) => {
      const region = (node: Element) => getComputedStyle(node).getPropertyValue('-webkit-app-region') || (getComputedStyle(node) as unknown as { appRegion?: string }).appRegion
      const row = element.querySelector('[data-widget-controls]')!
      return { widget: region(element), row: region(row), timer: region(element.querySelector('[role="timer"]')!) }
    })
    expect(regions.widget).toBe('drag')
    expect(regions.row).toBe('no-drag')
    // Inside the drag region, the title and the timer are not taken out of it.
    expect(regions.timer).not.toBe('no-drag')
    await widget.getByRole('button', { name: 'Pause' }).click()
    await expect(widget.getByRole('button', { name: 'Resume' })).toBeVisible()
  })
})
