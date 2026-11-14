import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { createGroup } from '../../src/services/groups.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
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

type Column = 'backlog' | 'this_week' | 'today' | 'done'

/** A list with the group Pipeline, and helpers to add tasks, move them and read a column's order by title. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const { owner, workspaceId } = roles
  const newList = async (name: string) => (await call('POST', '/api/lists', owner.token, workspaceId, { name, color: 1 })).json().id as string
  const listId = await newList('Work')
  const group = await createGroup(t.ctx.db as Database, listId, { name: 'Pipeline' })
  const ids = new Map<string, string>()
  const add = async (title: string, column: Column, extra: object = {}) => {
    const reply = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title, column, ...extra })
    expect(reply.statusCode, reply.body).toBe(201)
    ids.set(title, reply.json().id)
    return reply.json().id as string
  }
  const id = (title: string) => ids.get(title)!
  const move = (title: string, column: Column, before: string | null, extra: object = {}) =>
    call('POST', `/api/tasks/${id(title)}/move`, owner.token, workspaceId, { column, before_task_id: before && id(before), ...extra })
  const read = async (title: string) => (await call('GET', `/api/tasks/${id(title)}`, owner.token, workspaceId)).json()
  const titles = new Map<string, string>()
  const order = async (column: Exclude<Column, 'done'>) => {
    for (const [title, taskId] of ids) titles.set(taskId, title)
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    return (board.columns[column].tasks as Array<{ id: string; position: number }>).map((card) => titles.get(card.id))
  }
  return { ...roles, listId, newList, group, add, id, move, read, order }
}

describe('GRP-06 dropping inside the container of the same group', () => {
  it('in another column: the task changes column, stays in the group and sits with the other tasks of the group', async () => {
    const { group, add, move, read, order } = await setup()
    await add('g1', 'this_week', { group_id: group.id })
    await add('g2', 'this_week', { group_id: group.id })
    await add('a', 'today')
    await add('g3', 'today', { group_id: group.id })
    await add('b', 'today')

    const moved = await move('g1', 'today', 'b', { group_id: group.id })

    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ column: 'today', group_id: group.id })
    expect(await order('today')).toEqual(['a', 'g3', 'g1', 'b'])
    expect(await order('this_week')).toEqual(['g2'])
    expect(await read('g2')).toMatchObject({ group_id: group.id })
  })

  it('without group_id the task keeps its group, and its block stays together', async () => {
    const { group, add, move, read, order } = await setup()
    await add('a', 'today')
    await add('g1', 'today', { group_id: group.id })
    await add('g2', 'today', { group_id: group.id })
    await add('b', 'today')

    expect((await move('g2', 'today', null)).statusCode).toBe(200)

    expect(await read('g2')).toMatchObject({ group_id: group.id })
    expect(await order('today')).toEqual(['a', 'g1', 'g2', 'b'])
  })
})

describe('GRP-07 dropping a task of the group outside the container', () => {
  it('with group_id null, the task leaves the group and stays where it was dropped, out of the block', async () => {
    const { group, add, move, order } = await setup()
    await add('g1', 'today', { group_id: group.id })
    await add('g2', 'today', { group_id: group.id })
    await add('a', 'today')
    await add('b', 'today')

    const moved = await move('g2', 'today', 'b', { group_id: null })

    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ group_id: null })
    expect(await order('today')).toEqual(['g1', 'a', 'g2', 'b'])
  })
})

describe('GRP-08 dropping a loose task inside a container', () => {
  it('with the group id, the task enters the group at that place of the block', async () => {
    const { group, add, move, order } = await setup()
    await add('x', 'backlog')
    await add('a', 'today')
    await add('g1', 'today', { group_id: group.id })
    await add('g2', 'today', { group_id: group.id })
    await add('b', 'today')

    const moved = await move('x', 'today', 'g2', { group_id: group.id })

    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ column: 'today', group_id: group.id })
    expect(await order('today')).toEqual(['a', 'g1', 'x', 'g2', 'b'])
    expect(await order('backlog')).toEqual([])
  })

  it('a group of another list answers 422 group_of_another_list and moves nothing', async () => {
    const { group, newList, add, move, read, order } = await setup()
    const theirs = await createGroup(t.ctx.db as Database, await newList('Home'), { name: 'Mudança' })
    await add('x', 'backlog')
    await add('g1', 'today', { group_id: group.id })

    const refused = await move('x', 'today', null, { group_id: theirs.id })

    expect(refused.statusCode).toBe(422)
    expect(refused.json()).toMatchObject({ code: 'group_of_another_list' })
    expect(await read('x')).toMatchObject({ column: 'backlog', group_id: null })
    expect(await order('today')).toEqual(['g1'])
  })
})

describe('GRP-10 a group without a next action', () => {
  it('completing the last open task of the group answers the group; completing one that is not the last answers null', async () => {
    const { group, add, move } = await setup()
    await add('g1', 'today', { group_id: group.id })
    await add('g2', 'this_week', { group_id: group.id })

    const first = await move('g1', 'done', null)
    expect(first.statusCode).toBe(200)
    expect(first.json().group_without_next_action).toBeNull()

    const last = await move('g2', 'done', null)
    expect(last.statusCode).toBe(200)
    expect(last.json().group_without_next_action).toEqual({ id: group.id, name: 'Pipeline' })
  })

  it('an open task of another group does not count for this one, and a loose task answers null', async () => {
    const { listId, group, add, move } = await setup()
    const other = await createGroup(t.ctx.db as Database, listId, { name: 'Mudança' })
    await add('g1', 'today', { group_id: group.id })
    await add('h1', 'today', { group_id: other.id })
    await add('loose', 'today')

    expect((await move('g1', 'done', null)).json().group_without_next_action).toEqual({ id: group.id, name: 'Pipeline' })
    expect((await move('loose', 'done', null)).json().group_without_next_action).toBeNull()
  })

  it('moving a task of the group between open columns answers null', async () => {
    const { group, add, move } = await setup()
    await add('g1', 'today', { group_id: group.id })
    expect((await move('g1', 'this_week', null)).json().group_without_next_action).toBeNull()
  })
})

describe('a task of a group is born and joins at the end of the block (AD-013)', () => {
  it('POST /api/tasks with group_id puts the task at the end of the group block in its column', async () => {
    const { group, add, order } = await setup()
    await add('g1', 'today', { group_id: group.id })
    await add('g2', 'today', { group_id: group.id })
    await add('a', 'today')
    await add('g3', 'today', { group_id: group.id })
    expect(await order('today')).toEqual(['g1', 'g2', 'g3', 'a'])
  })

  it('a duplicated task of a group joins the end of the block', async () => {
    const { owner, workspaceId, group, add, id, order } = await setup()
    await add('g1', 'today', { group_id: group.id })
    await add('a', 'today')
    const copy = await call('POST', `/api/tasks/${id('g1')}/duplicate`, owner.token, workspaceId)
    expect(copy.statusCode).toBe(201)
    expect(copy.json()).toMatchObject({ group_id: group.id, position: 1 })
    const board = await order('today')
    expect(board).toEqual(['g1', undefined, 'a'])
  })
})

describe('MODAL-04 changing the group in PATCH', () => {
  it('another group puts the task at the end of that group block in its column', async () => {
    const { owner, workspaceId, group, add, id, order } = await setup()
    await add('g1', 'today', { group_id: group.id })
    await add('a', 'today')
    await add('b', 'today')
    const reply = await call('PATCH', `/api/tasks/${id('b')}`, owner.token, workspaceId, { group_id: group.id })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ group_id: group.id, column: 'today' })
    expect(await order('today')).toEqual(['g1', 'b', 'a'])
  })

  it('Sem grupo takes the task out of the group and out of the block', async () => {
    const { owner, workspaceId, group, add, id, order } = await setup()
    await add('g1', 'today', { group_id: group.id })
    await add('g2', 'today', { group_id: group.id })
    await add('g3', 'today', { group_id: group.id })
    await add('a', 'today')
    const reply = await call('PATCH', `/api/tasks/${id('g2')}`, owner.token, workspaceId, { group_id: null })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ group_id: null })
    expect(await order('today')).toEqual(['g1', 'g3', 'g2', 'a'])
  })
})

describe('MODAL-06 a reminder never joins a group', () => {
  it('moving a reminder with a group id answers 422 reminder_field and keeps it loose; a task makes the same move', async () => {
    const { group, add, move, read, order } = await setup()
    await add('g1', 'today', { group_id: group.id })
    await add('r', 'backlog', { kind: 'reminder' })
    await add('x', 'backlog')

    const refused = await move('r', 'today', 'g1', { group_id: group.id })

    expect(refused.statusCode).toBe(422)
    expect(refused.json()).toMatchObject({ code: 'reminder_field' })
    expect(await read('r')).toMatchObject({ column: 'backlog', group_id: null })
    expect(await order('today')).toEqual(['g1'])
    const moved = await move('x', 'today', 'g1', { group_id: group.id })
    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ group_id: group.id })
  })

  it('a reminder still moves between columns without a group id or with group_id null', async () => {
    const { add, move, read } = await setup()
    await add('r', 'backlog', { kind: 'reminder' })

    expect((await move('r', 'today', null)).statusCode).toBe(200)
    expect((await move('r', 'this_week', null, { group_id: null })).statusCode).toBe(200)
    expect(await read('r')).toMatchObject({ column: 'this_week', group_id: null })
  })
})
