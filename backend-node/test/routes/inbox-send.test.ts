import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { sendItem } from '../../src/services/inbox.ts'
import { completedBy, inWorkspace, invite, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

type Column = 'backlog' | 'this_week' | 'today'

async function setup() {
  const roles = await ownerViewerStranger(t)
  const { owner, workspaceId } = roles
  // Today is told in UTC, so the tests can name it.
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'UTC' } })
  const today = new Date().toISOString().slice(0, 10)
  const listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 1 })).json().id as string
  const capture = async (text: string, token = owner.token, row: object = {}) => {
    const id = (await call('POST', '/api/inbox', token, workspaceId, { text })).json().id as string
    if (Object.keys(row).length > 0) expect((await call('PATCH', `/api/inbox/${id}`, token, workspaceId, row)).statusCode).toBe(200)
    return id
  }
  const send = (id: string, decision: object, token = owner.token) => call('POST', `/api/inbox/${id}/send`, token, workspaceId, { decision })
  const inbox = async (token = owner.token, tab = 'current') =>
    (await call('GET', `/api/inbox?tab=${tab}`, token, workspaceId)).json().items as Array<Record<string, unknown>>
  const column = async (name: Column) => {
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    return board.columns[name].tasks as Array<Record<string, unknown>>
  }
  return { ...roles, today, listId, capture, send, inbox, column }
}

describe('QUICK-04 sending from the row', () => {
  it('creates the task with the text and the row estimate at the end of Backlog, and takes the item out', async () => {
    const { owner, workspaceId, listId, capture, send, inbox, column } = await setup()
    await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Antes', column: 'backlog' })
    const id = await capture('DEV-1701', owner.token, { list_id: listId, estimate_minutes: 90 })

    const reply = await send(id, { type: 'task', list_id: listId })

    expect(reply.statusCode).toBe(200)
    expect(reply.json().tasks).toEqual([expect.objectContaining({ title: 'DEV-1701', estimate_minutes: 90, column: 'backlog', kind: 'task', list_id: listId })])
    expect(reply.json().group).toBeNull()
    expect((await column('backlog')).map((card) => card.title)).toEqual(['Antes', 'DEV-1701'])
    expect(await inbox()).toEqual([])
  })
})

describe('PROC-05, PROC-03, PROC-04 processing an item as a task', () => {
  it('a task scheduled for today goes to Hoje with its name, priority, due day and notes', async () => {
    const { today, listId, capture, send, column } = await setup()
    const id = await capture('dev 1701')
    const reply = await send(id, {
      type: 'task',
      name: 'DEV-1701',
      list_id: listId,
      priority: 'high',
      due_on: '2099-01-01',
      estimate_minutes: 30,
      scheduled_on: today,
      scheduled_time: '23:59',
      notes: 'Ver o log',
    })
    expect(reply.statusCode).toBe(200)
    expect(reply.json().tasks[0]).toMatchObject({
      title: 'DEV-1701',
      column: 'today',
      priority: 'high',
      due_on: '2099-01-01',
      estimate_minutes: 30,
      scheduled_on: today,
      scheduled_time: '23:59',
      notes: 'Ver o log',
    })
    expect((await column('today')).map((card) => card.title)).toEqual(['DEV-1701'])
  })

  it('a column chosen in Vai para wins over the schedule and stays after the next read of the board', async () => {
    const { today, listId, capture, send, column } = await setup()
    const id = await capture('DEV-1701')
    const reply = await send(id, { type: 'task', list_id: listId, scheduled_on: today, column: 'backlog' })
    expect(reply.json().tasks[0]).toMatchObject({ column: 'backlog', scheduled_on: today })
    expect((await column('backlog')).map((card) => card.title)).toEqual(['DEV-1701'])
    expect(await column('today')).toEqual([])
  })
})

describe('REM-01 processing an item as a reminder', () => {
  it('creates a reminder without estimate, even when the row had one', async () => {
    const { listId, capture, send, column } = await setup()
    const id = await capture('Pagar o DAS', undefined, { list_id: listId, estimate_minutes: 30 })
    const reply = await send(id, { type: 'reminder', list_id: listId, priority: 'medium' })
    expect(reply.statusCode).toBe(200)
    expect(reply.json().tasks[0]).toMatchObject({ title: 'Pagar o DAS', kind: 'reminder', estimate_minutes: null, priority: 'medium', column: 'backlog' })
    expect((await column('backlog')).map((card) => card.kind)).toEqual(['reminder'])
  })

  it('a reminder with an estimate answers 422 and keeps the item', async () => {
    const { listId, capture, send, inbox } = await setup()
    const id = await capture('Pagar o DAS')
    expect((await send(id, { type: 'reminder', list_id: listId, estimate_minutes: 30 })).statusCode).toBe(422)
    expect((await inbox()).map((item) => item.id)).toEqual([id])
  })
})

describe('GRP-01 processing an item as a group', () => {
  it('creates the group and its four tasks, in the order typed, all in the chosen column', async () => {
    const { listId, capture, send, column, inbox } = await setup()
    const id = await capture('Pipeline de scripts')
    const reply = await send(id, {
      type: 'group',
      list_id: listId,
      priority: 'high',
      due_on: '2099-01-01',
      column: 'this_week',
      tasks: [{ title: 'Mapear', estimate_minutes: 30 }, { title: 'Escrever' }, { title: 'Testar', estimate_minutes: 60 }, { title: 'Publicar' }],
    })
    expect(reply.statusCode).toBe(200)
    const group = reply.json().group
    expect(group).toMatchObject({ list_id: listId, name: 'Pipeline de scripts', priority: 'high', due_on: '2099-01-01' })
    const cards = await column('this_week')
    expect(cards.map((card) => [card.title, card.estimate_minutes, card.group_id])).toEqual([
      ['Mapear', 30, group.id],
      ['Escrever', null, group.id],
      ['Testar', 60, group.id],
      ['Publicar', null, group.id],
    ])
    expect(await inbox()).toEqual([])
  })
})

describe('PROC-06 Já fiz', () => {
  it('creates the task in Concluídas, completed now by the user', async () => {
    const { owner, listId, capture, send } = await setup()
    const id = await capture('Responder o e-mail')
    const reply = await send(id, { type: 'done', list_id: listId })
    expect(reply.statusCode).toBe(200)
    const task = reply.json().tasks[0]
    expect(task).toMatchObject({ title: 'Responder o e-mail', column: 'done', completed_at: expect.any(String), estimate_minutes: null })
    expect(await completedBy(t, task.id)).toBe(owner.id)
  })
})

describe('PROC-07 Descartar', () => {
  it('sends the item to the trash and creates nothing', async () => {
    const { capture, send, inbox, column } = await setup()
    const id = await capture('Ideia solta')
    const reply = await send(id, { type: 'discard' })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ tasks: [], group: null })
    expect(await inbox()).toEqual([])
    expect((await inbox(undefined, 'trash')).map((item) => item.id)).toEqual([id])
    expect(await column('backlog')).toEqual([])
  })
})

describe('QUICK-06 a list that cannot receive the item', () => {
  it('an archived list answers 409 list_archived; the item stays with its list cleared', async () => {
    const { owner, workspaceId, listId, capture, send, inbox } = await setup()
    const id = await capture('DEV-1701', undefined, { list_id: listId })
    await call('PATCH', `/api/lists/${listId}`, owner.token, workspaceId, { is_archived: true })
    const reply = await send(id, { type: 'task', list_id: listId })
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toMatchObject({ reason: 'list_archived' })
    expect(await inbox()).toEqual([expect.objectContaining({ id, list_id: null })])
  })

  it('a list the user only reads (viewer) answers 409 list_read_only; the item stays with its list cleared', async () => {
    const { viewer, listId, capture, send, inbox, column } = await setup()
    const id = await capture('Ideia', viewer.token, { list_id: listId })
    const reply = await send(id, { type: 'task', list_id: listId }, viewer.token)
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toMatchObject({ reason: 'list_read_only' })
    expect(await inbox(viewer.token)).toEqual([expect.objectContaining({ id, list_id: null })])
    expect(await column('backlog')).toEqual([])
  })

  it('an editor sends to the list', async () => {
    const { owner, workspaceId, listId, send } = await setup()
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    const id = (await call('POST', '/api/inbox', editor.token, workspaceId, { text: 'Do editor' })).json().id
    expect((await send(id, { type: 'task', list_id: listId }, editor.token)).statusCode).toBe(200)
  })
})

describe('QUICK-07 a text over 255 characters', () => {
  it('without a name answers 422 and keeps the item; with a name it is sent', async () => {
    const { listId, capture, send, inbox } = await setup()
    const id = await capture('a'.repeat(300))
    const refused = await send(id, { type: 'task', list_id: listId })
    expect(refused.statusCode).toBe(422)
    expect((await inbox()).map((item) => item.id)).toEqual([id])
    const sent = await send(id, { type: 'task', list_id: listId, name: 'Resumo' })
    expect(sent.statusCode).toBe(200)
    expect(sent.json().tasks[0]).toMatchObject({ title: 'Resumo' })
  })
})

describe('EDGE-01 the same item sent twice at once', () => {
  it('creates one task and answers 409 already_processed to the other send', async () => {
    const { listId, capture, send, column } = await setup()
    const id = await capture('DEV-1701')
    const replies = await Promise.all([send(id, { type: 'task', list_id: listId }), send(id, { type: 'task', list_id: listId })])
    expect(replies.map((reply) => reply.statusCode).toSorted()).toEqual([200, 409])
    expect(replies.find((reply) => reply.statusCode === 409)!.json()).toMatchObject({ reason: 'already_processed' })
    expect((await column('backlog')).map((card) => card.title)).toEqual(['DEV-1701'])
  })

  it('a send that arrives after the other one finished also answers 409 already_processed', async () => {
    const { listId, capture, send, column } = await setup()
    const id = await capture('DEV-1701')
    expect((await send(id, { type: 'task', list_id: listId })).statusCode).toBe(200)
    const late = await send(id, { type: 'task', list_id: listId })
    expect(late.statusCode).toBe(409)
    expect(late.json()).toMatchObject({ reason: 'already_processed' })
    expect((await column('backlog')).map((card) => card.title)).toEqual(['DEV-1701'])
  })
})

/** `db` whose transactions start only after `before` ran: another window acts between the pre-check and the take. */
function raceBeforeTransaction(db: Database, before: () => Promise<unknown>): Database {
  return new Proxy(db, {
    get(target, property) {
      if (property === 'transaction') {
        return async (...args: Parameters<Database['transaction']>) => {
          await before()
          return target.transaction(...args)
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

describe('EDGE-01 the item taken by another send after the pre-check', () => {
  it('the second send answers 409 already_processed from the take itself, and only one task exists', async () => {
    const { owner, workspaceId, listId, capture, column, inbox } = await setup()
    const id = await capture('DEV-1701')
    const sender = { workspaceId, userId: owner.id, canWrite: true }
    const decision = { type: 'task' as const, list_id: listId, priority: 'none' as const }
    const otherWindow = () => sendItem(t.ctx.db, sender, id, decision)

    const late = sendItem(raceBeforeTransaction(t.ctx.db, otherWindow), sender, id, decision)

    await expect(late).rejects.toMatchObject({ statusCode: 409, extra: { reason: 'already_processed' } })
    expect((await column('backlog')).map((card) => card.title)).toEqual(['DEV-1701'])
    expect(await inbox()).toEqual([])
  })
})

describe('PROC-08 a failed creation keeps the item', () => {
  it('with the list deleted after it was picked, the send fails and the item stays in the inbox', async () => {
    const { owner, workspaceId, listId, capture, send, inbox } = await setup()
    const id = await capture('DEV-1701', undefined, { list_id: listId, estimate_minutes: 45 })
    await call('DELETE', `/api/lists/${listId}`, owner.token, workspaceId)
    const reply = await send(id, { type: 'task', list_id: listId })
    expect(reply.statusCode).toBe(404)
    expect(await inbox()).toEqual([expect.objectContaining({ id, text: 'DEV-1701', estimate_minutes: 45 })])
  })
})

describe('INBOX-03 sending another user\'s item', () => {
  it('answers 404 and creates nothing', async () => {
    const { owner, workspaceId, listId, send, inbox, column } = await setup()
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    const theirs = (await call('POST', '/api/inbox', editor.token, workspaceId, { text: 'Do editor' })).json().id
    expect((await send(theirs, { type: 'task', list_id: listId })).statusCode).toBe(404)
    expect(await column('backlog')).toEqual([])
    expect((await inbox(editor.token)).map((item) => item.id)).toEqual([theirs])
  })
})
