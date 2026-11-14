import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invite, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

async function setup() {
  const roles = await ownerViewerStranger(t)
  const newList = async (name: string) =>
    (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name, color: 1 })).json().id as string
  const listId = await newList('Work')
  const otherListId = await newList('Home')
  const read = (list: string, token = roles.owner.token) => call('GET', `/api/lists/${list}/card-fields`, token, roles.workspaceId)
  const write = (list: string, hidden: unknown, token = roles.owner.token) =>
    call('PUT', `/api/lists/${list}/card-fields`, token, roles.workspaceId, { hidden })
  return { ...roles, listId, otherListId, read, write }
}

describe('FIELDS-03 the card fields are stored per user and per list', () => {
  it('without a choice, GET answers no hidden field: the four fields are on', async () => {
    const { listId, read } = await setup()
    const reply = await read(listId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ hidden: [] })
  })

  it('PUT stores the choice, and GET answers it after', async () => {
    const { listId, read, write } = await setup()
    const saved = await write(listId, ['waiting', 'due'])
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toEqual({ hidden: ['due', 'waiting'] })
    expect((await read(listId)).json()).toEqual({ hidden: ['due', 'waiting'] })
  })

  it('PUT with no hidden field turns every field on again', async () => {
    const { listId, read, write } = await setup()
    await write(listId, ['due'])
    expect((await write(listId, [])).json()).toEqual({ hidden: [] })
    expect((await read(listId)).json()).toEqual({ hidden: [] })
  })
})

describe('FIELDS-04 hiding a field hides it only for that user and that list', () => {
  it('PUT {hidden: ["due"]} hides Prazo for the user on that list; another list and another user keep every field on', async () => {
    const { owner, workspaceId, listId, otherListId, read, write } = await setup()
    const editor = await invite(t, owner.token, workspaceId, 'editor')

    expect((await write(listId, ['due'])).statusCode).toBe(200)

    expect((await read(listId)).json()).toEqual({ hidden: ['due'] })
    expect((await read(otherListId)).json()).toEqual({ hidden: [] })
    expect((await read(listId, editor.token)).json()).toEqual({ hidden: [] })
  })

  it('a viewer chooses their own fields too', async () => {
    const { viewer, listId, read, write } = await setup()
    expect((await write(listId, ['flag'], viewer.token)).statusCode).toBe(200)
    expect((await read(listId, viewer.token)).json()).toEqual({ hidden: ['flag'] })
    expect((await read(listId)).json()).toEqual({ hidden: [] })
  })
})

describe('the card fields routes refuse', () => {
  it('an unknown field answers 422 and stores nothing', async () => {
    const { listId, read, write } = await setup()
    expect((await write(listId, ['due', 'color'])).statusCode).toBe(422)
    expect((await read(listId)).json()).toEqual({ hidden: [] })
  })

  it('a list of another workspace answers 404', async () => {
    const { stranger, strangerWorkspaceId, listId } = await setup()
    expect((await call('GET', `/api/lists/${listId}/card-fields`, stranger.token, strangerWorkspaceId)).statusCode).toBe(404)
    expect((await call('PUT', `/api/lists/${listId}/card-fields`, stranger.token, strangerWorkspaceId, { hidden: ['due'] })).statusCode).toBe(404)
  })

  it('a token answers 403 on GET and PUT, even with every scope', async () => {
    const { owner, workspaceId, listId, read } = await setup()
    const token = await mintToken(t, owner.token, workspaceId)
    const url = `/api/lists/${listId}/card-fields`
    expect((await t.app.inject({ method: 'GET', url, headers: bearer(token.value) })).statusCode).toBe(403)
    expect((await t.app.inject({ method: 'PUT', url, headers: bearer(token.value), payload: { hidden: ['due'] } })).statusCode).toBe(403)
    expect((await read(listId)).json()).toEqual({ hidden: [] })
  })
})
