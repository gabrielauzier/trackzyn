import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestApp, bearer, bootstrapAdmin, createTestApp, register } from '../support/test-app.ts'

describe('desktop title bar setting', () => {
  let t: TestApp
  let admin: { token: string }
  beforeAll(async () => {
    t = await createTestApp()
    // The server's setup makes one admin, for the whole file.
    admin = await bootstrapAdmin(t)
  })
  afterAll(async () => {
    await t.close()
  })

  const read = (token: string) => t.app.inject({ method: 'GET', url: '/api/admin/desktop-titlebar', headers: bearer(token) })
  const save = (token: string, value: string) =>
    t.app.inject({ method: 'PATCH', url: '/api/admin/settings/desktop_titlebar', headers: bearer(token), payload: { value } })

  it('answers the page in a card until an admin picks another bar, and every user reads the choice', async () => {
    const user = await register(t)
    expect((await read(user.token)).json()).toEqual({ style: 'contained' })

    for (const style of ['thin', 'search', 'integrated', 'contained']) {
      expect((await save(admin.token, style)).statusCode).toBe(200)
      expect((await read(user.token)).json(), style).toEqual({ style })
    }
  })

  it('refuses a bar it does not know, a user who is not an admin, and a reader who is not signed in', async () => {
    const user = await register(t)
    const unknown = await save(admin.token, 'floating')
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().detail).toContain('desktop_titlebar')
    expect((await save(user.token, 'thin')).statusCode).toBe(403)
    expect((await t.app.inject({ method: 'GET', url: '/api/admin/desktop-titlebar' })).statusCode).toBe(401)
  })
})
