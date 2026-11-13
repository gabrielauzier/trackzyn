import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inboxItems } from '../../src/db/schema.ts'
import { inWorkspace, invite, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, createTestApp } from '../support/test-app.ts'

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
  const { owner, workspaceId } = roles
  const listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 1 })).json().id as string
  const capture = (text: string, token = owner.token, extra: object = {}) => call('POST', '/api/inbox', token, workspaceId, { text, ...extra })
  const add = async (text: string, token = owner.token) => {
    const reply = await capture(text, token)
    expect(reply.statusCode, reply.body).toBe(201)
    return reply.json().id as string
  }
  const list = async (tab: 'current' | 'trash' = 'current', token = owner.token, workspace = workspaceId) =>
    (await call('GET', `/api/inbox?tab=${tab}`, token, workspace)).json().items as Array<Record<string, unknown>>
  const counted = async (token = owner.token, workspace = workspaceId) => (await call('GET', '/api/inbox/count', token, workspace)).json().count
  /** Moves the item's arrival or discard back in time, as the clock of the tests cannot. */
  const age = (id: string, values: { createdAt?: Date; discardedAt?: Date }) => t.ctx.db.update(inboxItems).set(values).where(eq(inboxItems.id, id))
  return { ...roles, listId, capture, add, list, counted, age }
}

describe('CAP-01 to CAP-03 capturing an item', () => {
  it('stores the text without its surrounding spaces, with the arrival time and the origin app', async () => {
    const { capture, list } = await setup()
    const before = Date.now()
    const reply = await capture('  Ligar  ')
    expect(reply.statusCode).toBe(201)
    expect(reply.json()).toMatchObject({ text: 'Ligar', source: 'app', created_via: null, list_id: null, estimate_minutes: null, draft: null, discarded_at: null })
    expect(Date.parse(reply.json().created_at)).toBeGreaterThanOrEqual(before - 1000)
    expect(await list()).toEqual([reply.json()])
  })

  it('source desktop stores the origin desktop', async () => {
    const { capture } = await setup()
    expect((await capture('Ligar', undefined, { source: 'desktop' })).json()).toMatchObject({ source: 'desktop' })
  })

  it('an empty text after trimming answers 422 and stores nothing', async () => {
    const { capture, counted } = await setup()
    expect((await capture('   ')).statusCode).toBe(422)
    expect(await counted()).toBe(0)
  })

  it('a text of 501 characters answers 422; one of 500 is stored', async () => {
    const { capture, counted } = await setup()
    expect((await capture('a'.repeat(501))).statusCode).toBe(422)
    expect(await counted()).toBe(0)
    expect((await capture('a'.repeat(500))).statusCode).toBe(201)
  })

  it('a viewer captures too', async () => {
    const { viewer, capture, list } = await setup()
    expect((await capture('Ideia', viewer.token)).statusCode).toBe(201)
    expect((await list('current', viewer.token)).map((item) => item.text)).toEqual(['Ideia'])
  })
})

describe('INBOX-01 to INBOX-03 each user sees only their own items', () => {
  it('two users of the workspace see and count only their own item', async () => {
    const { owner, workspaceId, add, list, counted } = await setup()
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    await add('Do dono')
    await add('Do editor', editor.token)
    expect((await list()).map((item) => item.text)).toEqual(['Do dono'])
    expect((await list('current', editor.token)).map((item) => item.text)).toEqual(['Do editor'])
    expect(await counted()).toBe(1)
    expect(await counted(editor.token)).toBe(1)
  })

  it('PATCH, discard and restore of another user\'s item answer 404 and change nothing', async () => {
    const { owner, workspaceId, listId, add, list } = await setup()
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    const theirs = await add('Do editor', editor.token)
    expect((await call('PATCH', `/api/inbox/${theirs}`, owner.token, workspaceId, { list_id: listId })).statusCode).toBe(404)
    expect((await call('POST', `/api/inbox/${theirs}/discard`, owner.token, workspaceId)).statusCode).toBe(404)
    expect((await call('POST', `/api/inbox/${theirs}/restore`, owner.token, workspaceId)).statusCode).toBe(404)
    expect(await list('current', editor.token)).toEqual([expect.objectContaining({ id: theirs, list_id: null, discarded_at: null })])
  })

  it('the count is 0 with an empty inbox, and does not count the trash', async () => {
    const { owner, workspaceId, add, counted } = await setup()
    expect(await counted()).toBe(0)
    const id = await add('Ligar')
    await call('POST', `/api/inbox/${id}/discard`, owner.token, workspaceId)
    expect(await counted()).toBe(0)
  })
})

describe('INBOX-02 Atuais from the oldest to the newest', () => {
  it('lists the items in the order they arrived', async () => {
    const { add, list, age } = await setup()
    const second = await add('Segundo')
    const first = await add('Primeiro')
    await age(first, { createdAt: new Date(Date.now() - 2 * 86_400_000) })
    await age(second, { createdAt: new Date(Date.now() - 86_400_000) })
    const third = await add('Terceiro')
    expect((await list()).map((item) => item.id)).toEqual([first, second, third])
  })
})

describe('INBOX-04, INBOX-05, EDGE-03 the trash', () => {
  it('discarding takes the item out of Atuais to the trash with the discard date', async () => {
    const { owner, workspaceId, add, list } = await setup()
    const id = await add('Ligar')
    const before = Date.now()
    const reply = await call('POST', `/api/inbox/${id}/discard`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(await list()).toEqual([])
    const trash = await list('trash')
    expect(trash.map((item) => item.id)).toEqual([id])
    expect(Date.parse(trash[0]!.discarded_at as string)).toBeGreaterThanOrEqual(before - 1000)
  })

  it('restoring brings the item back to Atuais at the place of its arrival, with its list and estimate', async () => {
    const { owner, workspaceId, listId, add, list, age } = await setup()
    const old = await add('Antigo')
    await age(old, { createdAt: new Date(Date.now() - 86_400_000) })
    const newer = await add('Novo')
    await call('PATCH', `/api/inbox/${old}`, owner.token, workspaceId, { list_id: listId, estimate_minutes: 90 })
    await call('POST', `/api/inbox/${old}/discard`, owner.token, workspaceId)

    const restored = await call('POST', `/api/inbox/${old}/restore`, owner.token, workspaceId)

    expect(restored.statusCode).toBe(200)
    expect(restored.json()).toMatchObject({ list_id: listId, estimate_minutes: 90, discarded_at: null })
    expect((await list()).map((item) => item.id)).toEqual([old, newer])
    expect(await list('trash')).toEqual([])
  })
})

describe('INBOX-06 the trash keeps an item 30 days', () => {
  it('an item discarded 31 days ago is deleted on the read; one discarded 29 days ago stays', async () => {
    const { owner, workspaceId, add, list, age } = await setup()
    const gone = await add('Velho')
    const kept = await add('Recente')
    for (const id of [gone, kept]) await call('POST', `/api/inbox/${id}/discard`, owner.token, workspaceId)
    await age(gone, { discardedAt: new Date(Date.now() - 31 * 86_400_000) })
    await age(kept, { discardedAt: new Date(Date.now() - 29 * 86_400_000) })

    expect((await list('trash')).map((item) => item.id)).toEqual([kept])
    expect(await t.ctx.db.select().from(inboxItems).where(eq(inboxItems.id, gone))).toEqual([])
  })
})

describe('QUICK-02, QUICK-05 the list and the estimate of the row', () => {
  it('PATCH stores the list and the estimate, and a new read answers them', async () => {
    const { owner, workspaceId, listId, add, list } = await setup()
    const id = await add('DEV-1701')
    const reply = await call('PATCH', `/api/inbox/${id}`, owner.token, workspaceId, { list_id: listId, estimate_minutes: 90 })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ list_id: listId, estimate_minutes: 90 })
    expect(await list()).toEqual([expect.objectContaining({ id, list_id: listId, estimate_minutes: 90 })])
  })

  it('an estimate of 0 or of 1441 minutes answers 422 and keeps the stored one', async () => {
    const { owner, workspaceId, add, list } = await setup()
    const id = await add('DEV-1701')
    await call('PATCH', `/api/inbox/${id}`, owner.token, workspaceId, { estimate_minutes: 30 })
    expect((await call('PATCH', `/api/inbox/${id}`, owner.token, workspaceId, { estimate_minutes: 0 })).statusCode).toBe(422)
    expect((await call('PATCH', `/api/inbox/${id}`, owner.token, workspaceId, { estimate_minutes: 1441 })).statusCode).toBe(422)
    expect((await list())[0]).toMatchObject({ estimate_minutes: 30 })
  })

  it('a list of another workspace answers 404 and is not stored', async () => {
    const { owner, workspaceId, stranger, strangerWorkspaceId, add, list } = await setup()
    const theirs = (await call('POST', '/api/lists', stranger.token, strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id
    const id = await add('DEV-1701')
    expect((await call('PATCH', `/api/inbox/${id}`, owner.token, workspaceId, { list_id: theirs })).statusCode).toBe(404)
    expect((await list())[0]).toMatchObject({ list_id: null })
  })
})

describe('EDGE-07 the inbox of each workspace', () => {
  it('an item of workspace B does not show nor count in A', async () => {
    const { owner, add, list, counted } = await setup()
    const other = (await t.app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'B', self_membership: true },
    })).json().id as string
    expect((await call('POST', '/api/inbox', owner.token, other, { text: 'Do B' })).statusCode).toBe(201)
    await add('Do A')
    expect((await list()).map((item) => item.text)).toEqual(['Do A'])
    expect(await counted()).toBe(1)
    expect((await list('current', owner.token, other)).map((item) => item.text)).toEqual(['Do B'])
    expect(await counted(owner.token, other)).toBe(1)
  })
})
