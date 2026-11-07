import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { taskSeries, tasks } from '../../src/db/schema.ts'
import { callTool, connect, listen } from '../support/mcp.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

const DAY_MS = 24 * 60 * 60_000
// Far enough ahead to stay out of this week, whatever day the suite runs: the task keeps its column.
const date = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)

let t: TestApp
let url: string
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  vi.spyOn(t.ctx.keyValueStore, 'rateLimitHit').mockResolvedValue(0)
  call = inWorkspace(t)
  url = await listen(t)
})
afterAll(async () => {
  await t.close()
})

/** A workspace in UTC with one list, and an MCP client on a token of the owner with every scope. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${roles.workspaceId}`, headers: bearer(roles.owner.token), payload: { timezone: 'UTC' } })
  const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const client = await connect(url, (await mintToken(t, roles.owner.token, roles.workspaceId)).value)
  const create = (args: Record<string, unknown>) => callTool(client, 'create_task', { list_id: listId, title: 'Review', ...args })
  const stored = () => t.ctx.db.select().from(tasks).where(eq(tasks.listId, listId))
  return { ...roles, client, listId, create, stored }
}

const WEEKLY = (weekday: number) => ({ freq: 'weekly', interval: 1, weekdays: [weekday] })
/** 1 (Monday) to 7 (Sunday). */
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7

describe('create_task with a schedule (US-7)', () => {
  it('takes scheduled_on and scheduled_time and answers them', async () => {
    const { create } = await setup()
    const result = await create({ scheduled_on: date(20), scheduled_time: '14:15' })
    expect(result.isError).toBe(false)
    expect(result.json()).toMatchObject({ column: 'backlog', scheduled_on: date(20), scheduled_time: '14:15', series: null, replayed: false })
  })

  it('applies the rules of saving: a day of today takes the task to today (D21)', async () => {
    const { create } = await setup()
    expect((await create({ scheduled_on: date(0) })).json()).toMatchObject({ column: 'today', scheduled_on: date(0), scheduled_time: null })
  })

  it('takes a recurrence and answers its rule and the next day', async () => {
    const { create } = await setup()
    const day = date(20)
    const result = await create({ scheduled_on: day, scheduled_time: '09:00', recurrence: WEEKLY(weekdayOf(day)) })
    expect(result.isError).toBe(false)
    expect(result.json().series).toEqual({
      id: expect.any(String),
      rule: { freq: 'weekly', interval: 1, weekdays: [weekdayOf(day)], month_day: null, until: null, count: null },
      next_on: date(27),
    })
  })

  it('refuses a recurrence without scheduled_on with the validation message and creates nothing', async () => {
    const { create, stored } = await setup()
    const result = await create({ recurrence: { freq: 'daily', interval: 1 } })
    expect(result).toMatchObject({ isError: true, text: 'A recurrence needs a scheduled day' })
    expect(await stored()).toEqual([])
  })

  it('refuses scheduled_time without scheduled_on and creates nothing', async () => {
    const { create, stored } = await setup()
    const result = await create({ scheduled_time: '10:00' })
    expect(result).toMatchObject({ isError: true, text: 'A scheduled time needs a scheduled day' })
    expect(await stored()).toEqual([])
  })

  it('refuses an invalid date, a time that is not HH:MM and an invalid rule with the validation message', async () => {
    const { create, stored } = await setup()
    const badDay = await create({ scheduled_on: '2026-02-30' })
    expect(badDay.isError).toBe(true)
    expect(JSON.parse(badDay.text)[0]).toMatchObject({ loc: ['body', 'scheduled_on'], msg: 'Input should be a valid date (YYYY-MM-DD)' })
    const badTime = await create({ scheduled_on: date(20), scheduled_time: '10:60' })
    expect(JSON.parse(badTime.text)[0]).toMatchObject({ loc: ['body', 'scheduled_time'], msg: 'Input should be a time (HH:MM)' })
    const noWeekdays = await create({ scheduled_on: date(20), recurrence: { freq: 'weekly', interval: 1 } })
    expect(noWeekdays.isError).toBe(true)
    expect(JSON.parse(noWeekdays.text)[0]).toMatchObject({ loc: ['body', 'recurrence', 'weekdays'] })
    expect(await stored()).toEqual([])
  })

  it('D31 takes a day before today, and the next read of the board shows the task in Today', async () => {
    const { create, listId, owner, workspaceId } = await setup()
    const result = await create({ scheduled_on: date(-2) })
    expect(result.isError).toBe(false)
    expect(result.json()).toMatchObject({ scheduled_on: date(-2), scheduled_time: null })
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    expect(board.columns.today.tasks).toEqual([expect.objectContaining({ id: result.json().id, scheduled_on: date(-2) })])
  })
})

describe('update_task with a schedule (US-7)', () => {
  it('sets the day and the time, keeps the time with a new day, makes the task repeat and stops it', async () => {
    const { client, create } = await setup()
    const id = (await create({})).json().id as string
    const update = (args: Record<string, unknown>) => callTool(client, 'update_task', { task_id: id, ...args })

    expect((await update({ scheduled_on: date(20), scheduled_time: '08:30' })).json()).toMatchObject({ scheduled_on: date(20), scheduled_time: '08:30' })
    expect((await update({ scheduled_on: date(21) })).json()).toMatchObject({ scheduled_on: date(21), scheduled_time: '08:30' })
    const repeating = (await update({ recurrence: { freq: 'daily', interval: 2, count: 4 } })).json()
    expect(repeating.series).toMatchObject({ rule: { freq: 'daily', interval: 2, count: 4 }, next_on: date(23) })
    expect((await update({ recurrence: null })).json()).toMatchObject({ series: null, scheduled_on: date(21) })
    expect((await update({ scheduled_on: null })).json()).toMatchObject({ scheduled_on: null, scheduled_time: null })
  })

  it('refuses a recurrence on a task without scheduled_on and changes nothing', async () => {
    const { client, create } = await setup()
    const id = (await create({})).json().id as string
    const result = await callTool(client, 'update_task', { task_id: id, title: 'Renamed', recurrence: { freq: 'daily', interval: 1 } })
    expect(result).toMatchObject({ isError: true, text: 'A recurrence needs a scheduled day' })
    expect((await callTool(client, 'get_task', { task_id: id })).json()).toMatchObject({ title: 'Review', series: null })
  })

  it('refuses a time with scheduled_on null', async () => {
    const { client, create } = await setup()
    const id = (await create({ scheduled_on: date(20) })).json().id as string
    const result = await callTool(client, 'update_task', { task_id: id, scheduled_on: null, scheduled_time: '10:00' })
    expect(result).toMatchObject({ isError: true, text: 'A scheduled time needs a scheduled day' })
  })
})

describe('get_task and get_board read the schedule (US-7)', () => {
  it('answer the day, the time, the rule and the next projected day', async () => {
    const { client, create, listId } = await setup()
    const day = date(20)
    const id = (await create({ scheduled_on: day, scheduled_time: '09:00', recurrence: WEEKLY(weekdayOf(day)) })).json().id as string
    const series = {
      id: expect.any(String),
      rule: { freq: 'weekly', interval: 1, weekdays: [weekdayOf(day)], month_day: null, until: null, count: null },
      next_on: date(27),
    }

    expect((await callTool(client, 'get_task', { task_id: id })).json()).toMatchObject({ scheduled_on: day, scheduled_time: '09:00', series })
    const board = (await callTool(client, 'get_board', { list_id: listId })).json() as { columns: { backlog: { tasks: Array<Record<string, unknown>> } } }
    expect(board.columns.backlog.tasks).toEqual([expect.objectContaining({ id, scheduled_on: day, scheduled_time: '09:00', series })])
  })
})

describe('get_board and get_task apply due schedules (US-4, AD-009)', () => {
  it('get_board shows a task due yesterday in today, with no REST read before', async () => {
    const { client, create, listId, stored } = await setup()
    const id = (await create({ scheduled_on: date(-1) })).json().id as string
    // Saved in Backlog or This week, by the weekday the suite runs; not yet in Today.
    const [saved] = await stored()
    expect(saved).toMatchObject({ id, scheduleAppliedAt: null })
    expect(['backlog', 'this_week']).toContain(saved!.column)

    const board = (await callTool(client, 'get_board', { list_id: listId })).json() as { columns: Record<string, { tasks: Array<Record<string, unknown>> }> }
    expect(board.columns.today!.tasks).toEqual([expect.objectContaining({ id, scheduled_on: date(-1) })])
    expect(board.columns.backlog!.tasks).toEqual([])
    expect(board.columns.this_week!.tasks).toEqual([])
  })

  it('get_task answers a task due yesterday in today, with no REST read before', async () => {
    const { client, create, stored } = await setup()
    const id = (await create({ scheduled_on: date(-1) })).json().id as string
    const [saved] = await stored()
    expect(saved).toMatchObject({ id, scheduleAppliedAt: null })
    expect(['backlog', 'this_week']).toContain(saved!.column)

    expect((await callTool(client, 'get_task', { task_id: id })).json()).toMatchObject({ id, column: 'today', scheduled_on: date(-1) })
  })
})

describe('delete_task on an occurrence (US-12, D13)', () => {
  it('deletes only this occurrence and creates the next, keeping the series, as REST DELETE without a scope', async () => {
    const { client, create, stored } = await setup()
    const created = (await create({ scheduled_on: date(20), scheduled_time: '09:00', recurrence: { freq: 'daily', interval: 1 } })).json() as { id: string; series: { id: string } }
    const id = created.id
    const seriesId = created.series.id

    const result = await callTool(client, 'delete_task', { task_id: id })
    expect(result.isError).toBe(false)
    expect(result.json()).toEqual({ id, deleted: true })

    expect((await stored()).map((task) => [task.title, task.seriesId, task.scheduledOn, task.scheduledTime])).toEqual([
      ['Review', seriesId, date(21), '09:00:00'],
    ])
    const [series] = await t.ctx.db.select().from(taskSeries).where(eq(taskSeries.id, seriesId))
    expect(series).toMatchObject({ createdCount: 2, endedAt: null })
  })

  it('deletes a task outside a series and creates nothing', async () => {
    const { client, create, stored } = await setup()
    const id = (await create({ scheduled_on: date(20) })).json().id as string
    expect((await callTool(client, 'delete_task', { task_id: id })).json()).toEqual({ id, deleted: true })
    expect(await stored()).toEqual([])
  })
})

describe('tools/list', () => {
  it('describes scheduled_on, scheduled_time and recurrence on create_task and update_task', async () => {
    const { client } = await setup()
    const { tools } = await client.listTools()
    for (const name of ['create_task', 'update_task']) {
      const fields = tools.find((tool) => tool.name === name)!.inputSchema.properties as Record<string, { description?: string }>
      for (const field of ['scheduled_on', 'scheduled_time', 'recurrence']) {
        expect(fields[field]?.description?.length, `${name}.${field}`).toBeGreaterThan(20)
      }
    }
  })
})
