import { and, eq, ne, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { taskSeries, tasks } from '../../src/db/schema.ts'
import type { RecurrenceRule } from '../../src/services/recurrence.ts'
import { setRecurrence } from '../../src/services/series.ts'
import { callTool, connect, listen } from '../support/mcp.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
let url: string
beforeAll(async () => {
  t = await createTestApp()
  vi.spyOn(t.ctx.keyValueStore, 'rateLimitHit').mockResolvedValue(0)
  call = inWorkspace(t)
  url = await listen(t)
})
afterAll(async () => {
  await t.close()
})

const TZ = 'America/Sao_Paulo'
const DAILY: RecurrenceRule = { freq: 'daily', interval: 1, weekdays: null, monthDay: null, until: null, count: null }

/** The day `offset` days from today in the workspace's timezone, as `YYYY-MM-DD`. */
async function day(offset: number): Promise<string> {
  const result = (await t.ctx.db.execute(sql`SELECT ((now() AT TIME ZONE ${TZ})::date + ${offset}::int)::text AS day`)) as unknown as {
    rows: Array<{ day: string }>
  }
  return result.rows[0]!.day
}

/** The roles, a workspace in Sao Paulo time, one list and one task scheduled `offset` days on at `time`, repeating by `rule`. */
async function setup(rule: RecurrenceRule = DAILY, offset = 30, time: string | null = '09:00') {
  const roles = await ownerViewerStranger(t)
  await call('PATCH', `/api/workspaces/${roles.workspaceId}`, roles.owner.token, roles.workspaceId, { timezone: TZ })
  const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const on = await day(offset)
  const taskId = (
    await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, title: 'Review', scheduled_on: on, scheduled_time: time })
  ).json().id as string
  const seriesId = (await setRecurrence(t.ctx.db, taskId, roles.workspaceId, rule)).series!.id
  return { ...roles, listId, taskId, seriesId, on }
}

/** The first day from `from` days on, in the workspace's timezone, that falls on `weekday` (1 = Monday to 7 = Sunday). */
async function next(weekday: number, from = 7): Promise<string> {
  const result = (await t.ctx.db.execute(
    sql`SELECT d::date::text AS day FROM generate_series((now() AT TIME ZONE ${TZ})::date + ${from}::int, (now() AT TIME ZONE ${TZ})::date + ${from + 6}::int, '1 day') AS d
        WHERE extract(isodow FROM d) = ${weekday} LIMIT 1`,
  )) as unknown as { rows: Array<{ day: string }> }
  return result.rows[0]!.day
}

/** A day `months` months from now on day `monthDay`, as `YYYY-MM-DD`. */
async function monthDay(months: number, dayOfMonth: number): Promise<string> {
  const result = (await t.ctx.db.execute(
    sql`SELECT (date_trunc('month', (now() AT TIME ZONE ${TZ})::date) + make_interval(months => ${months}::int) + make_interval(days => ${dayOfMonth - 1}::int))::date::text AS day`,
  )) as unknown as { rows: Array<{ day: string }> }
  return result.rows[0]!.day
}

const others = async (seriesId: string, except: string) =>
  t.ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.seriesId, seriesId), ne(tasks.id, except)))
const series = async (id: string) => (await t.ctx.db.select().from(taskSeries).where(eq(taskSeries.id, id)))[0]!

describe('completing an occurrence through the API and MCP creates the next one (US-10)', () => {
  it('POST /api/tasks/:id/move to done creates the next occurrence at the same time', async () => {
    const { owner, workspaceId, taskId, seriesId } = await setup()
    const reply = await call('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ id: taskId, column: 'done', series: { id: seriesId } })

    const [next] = await others(seriesId, taskId)
    expect(next).toMatchObject({ title: 'Review', scheduledOn: await day(31), scheduledTime: '09:00:00', column: 'backlog' })
    expect((await series(seriesId)).createdCount).toBe(2)
  })

  it('the MCP move_task tool to done creates the next occurrence', async () => {
    const { owner, workspaceId, taskId, seriesId } = await setup()
    const client = await connect(url, (await mintToken(t, owner.token, workspaceId, ['tasks:write'])).value)
    const result = await callTool(client, 'move_task', { task_id: taskId, column: 'done', before_task_id: null })
    await client.close()
    expect(result.isError).toBe(false)

    expect((await others(seriesId, taskId)).map((task) => task.scheduledOn)).toEqual([await day(31)])
    expect((await series(seriesId)).createdCount).toBe(2)
  })
})

describe('DELETE /api/tasks/:id with a scope (US-12)', () => {
  it('scope=occurrence deletes only this one and creates the next, as completing it would', async () => {
    const { owner, workspaceId, taskId, seriesId } = await setup()
    const reply = await call('DELETE', `/api/tasks/${taskId}?scope=occurrence`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(204)

    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).statusCode).toBe(404)
    expect((await others(seriesId, taskId)).map((task) => [task.scheduledOn, task.scheduledTime])).toEqual([[await day(31), '09:00:00']])
    expect(await series(seriesId)).toMatchObject({ createdCount: 2, endedAt: null })
  })

  it('without a scope, deletes only this occurrence', async () => {
    const { owner, workspaceId, taskId, seriesId } = await setup()
    expect((await call('DELETE', `/api/tasks/${taskId}`, owner.token, workspaceId)).statusCode).toBe(204)
    expect(await others(seriesId, taskId)).toHaveLength(1)
  })

  it('scope=series deletes it and ends the series; the completed occurrences stay in the reports', async () => {
    const { owner, workspaceId, taskId, seriesId } = await setup(DAILY, 0, null)
    await call('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
    const [next] = await others(seriesId, taskId)

    const reply = await call('DELETE', `/api/tasks/${next!.id}?scope=series`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(204)
    expect(await others(seriesId, taskId)).toEqual([])
    expect((await series(seriesId)).endedAt).not.toBeNull()

    const today = await day(0)
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ column: 'done', series: { id: seriesId, next_on: null } })
    const report = (await call('GET', `/api/reports/overview?from=${today}&to=${today}`, owner.token, workspaceId)).json()
    expect(report.tiles.tasks_done).toBe(1)
    expect(report.done.days[0].tasks.map((task: { id: string }) => task.id)).toEqual([taskId])
  })

  it('a task without a series is deleted alone, whatever the scope', async () => {
    const { owner, workspaceId, listId } = await setup()
    const plain = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Plain' })).json().id as string
    const before = (await t.ctx.db.select().from(tasks)).length
    expect((await call('DELETE', `/api/tasks/${plain}?scope=series`, owner.token, workspaceId)).statusCode).toBe(204)
    expect((await t.ctx.db.select().from(tasks)).length).toBe(before - 1)
  })

  it('answers 422 for another scope and 403 to a viewer, and deletes nothing', async () => {
    const { owner, viewer, workspaceId, taskId, seriesId } = await setup()
    const bad = await call('DELETE', `/api/tasks/${taskId}?scope=all`, owner.token, workspaceId)
    expect(bad.statusCode).toBe(422)
    expect(bad.json().detail[0].loc).toEqual(['query', 'scope'])
    expect((await call('DELETE', `/api/tasks/${taskId}?scope=series`, viewer.token, workspaceId)).statusCode).toBe(403)
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).statusCode).toBe(200)
    expect((await series(seriesId)).endedAt).toBeNull()
  })
})

describe('POST /api/tasks/:id/skip (US-12, D18)', () => {
  it('moves the occurrence to the next day of the rule and answers the task', async () => {
    const { owner, workspaceId, taskId, seriesId } = await setup()
    const reply = await call('POST', `/api/tasks/${taskId}/skip`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ id: taskId, scheduled_on: await day(31), scheduled_time: '09:00', series: { id: seriesId } })
    expect((await series(seriesId)).createdCount).toBe(2)
  })

  it('answers 409 not_in_series for a task without a series, 403 to a viewer and 404 to another workspace', async () => {
    const { owner, viewer, stranger, workspaceId, strangerWorkspaceId, listId, taskId } = await setup()
    const plain = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Plain' })).json().id as string
    const refused = await call('POST', `/api/tasks/${plain}/skip`, owner.token, workspaceId)
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ code: 'not_in_series' })

    const before = await day(30)
    expect((await call('POST', `/api/tasks/${taskId}/skip`, viewer.token, workspaceId)).statusCode).toBe(403)
    expect((await call('POST', `/api/tasks/${taskId}/skip`, stranger.token, strangerWorkspaceId)).statusCode).toBe(404)
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ scheduled_on: before })
  })

  it('a token with tasks:write skips the occurrence', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['tasks:write'])
    const reply = await t.app.inject({ method: 'POST', url: `/api/tasks/${taskId}/skip`, headers: { authorization: `Bearer ${token.value}` } })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ scheduled_on: await day(31) })
  })
})

describe('PATCH /api/tasks/:id with recurrence and scope (US-9, US-12, D16)', () => {
  /** A task scheduled for `on` at 09:00, made to repeat by `recurrence` through the PATCH. */
  async function repeating(on: string, recurrence: object) {
    const roles = await ownerViewerStranger(t)
    await call('PATCH', `/api/workspaces/${roles.workspaceId}`, roles.owner.token, roles.workspaceId, { timezone: TZ })
    const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
    const taskId = (await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, title: 'Review' })).json().id as string
    const patch = (body: object) => call('PATCH', `/api/tasks/${taskId}`, roles.owner.token, roles.workspaceId, body)
    const reply = await patch({ scheduled_on: on, scheduled_time: '09:00', recurrence })
    return { ...roles, taskId, patch, reply }
  }

  it('recurrence in the body makes the task repeat and answers the series', async () => {
    const saturday = await next(6)
    const { reply } = await repeating(saturday, { freq: 'weekly', weekdays: [6] })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({
      scheduled_on: saturday,
      series: { rule: { freq: 'weekly', interval: 1, weekdays: [6], month_day: null, until: null, count: null }, next_on: await next(6, 14) },
    })
  })

  it('a weekly Saturday moved to Sunday for this and the next ones repeats on Sundays', async () => {
    const saturday = await next(6)
    const { patch } = await repeating(saturday, { freq: 'weekly', weekdays: [6] })
    const sunday = await next(7, 8)

    const reply = await patch({ scheduled_on: sunday, scheduled_time: '10:30', scope: 'series' })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ scheduled_on: sunday, scheduled_time: '10:30', series: { rule: { weekdays: [7] }, next_on: await next(7, 15) } })
    expect((await series(reply.json().series.id)).time).toBe('10:30:00')
  })

  it('D27 a new time for this occurrence only leaves the time of the series; for this and the next ones it moves both', async () => {
    const saturday = await next(6)
    const { patch, reply: created } = await repeating(saturday, { freq: 'weekly', weekdays: [6] })
    const seriesId = created.json().series.id as string
    expect((await series(seriesId)).time).toBe('09:00:00')

    const only = await patch({ scheduled_time: '11:00', scope: 'occurrence' })
    expect(only.json()).toMatchObject({ scheduled_on: saturday, scheduled_time: '11:00' })
    expect((await series(seriesId)).time).toBe('09:00:00')

    const both = await patch({ scheduled_time: '12:15', scope: 'series' })
    expect(both.json()).toMatchObject({ scheduled_on: saturday, scheduled_time: '12:15', series: { rule: { weekdays: [6] } } })
    expect((await series(seriesId)).time).toBe('12:15:00')
  })

  it('moved for this occurrence only, the rule stays as it was', async () => {
    const saturday = await next(6)
    const { patch } = await repeating(saturday, { freq: 'weekly', weekdays: [6] })
    const sunday = await next(7, 8)

    const reply = await patch({ scheduled_on: sunday, scope: 'occurrence' })
    expect(reply.json()).toMatchObject({ scheduled_on: sunday, series: { rule: { weekdays: [6] }, next_on: await next(6, 14) } })
  })

  it('a weekly rule on several days swaps only the day of the moved occurrence', async () => {
    const monday = await next(1)
    const { patch } = await repeating(monday, { freq: 'weekly', weekdays: [1, 3] })
    const reply = await patch({ scheduled_on: await next(2, 7), scope: 'series' })
    expect(reply.json().series.rule.weekdays).toEqual([2, 3])
  })

  it('a monthly rule moved for this and the next ones takes the new day of the month', async () => {
    const thirteenth = await monthDay(2, 13)
    const { patch } = await repeating(thirteenth, { freq: 'monthly', month_day: 13 })
    const reply = await patch({ scheduled_on: await monthDay(2, 15), scope: 'series' })
    expect(reply.json()).toMatchObject({ series: { rule: { month_day: 15 }, next_on: await monthDay(3, 15) } })
  })

  it('a new rule counts for the series from there on, and null stops it', async () => {
    const saturday = await next(6)
    const { patch, reply } = await repeating(saturday, { freq: 'weekly', weekdays: [6] })
    const seriesId = reply.json().series.id as string

    const changed = await patch({ recurrence: { freq: 'daily', interval: 2, count: 5 } })
    expect(changed.json()).toMatchObject({ series: { id: seriesId, rule: { freq: 'daily', interval: 2, weekdays: null, count: 5 } } })
    const stopped = await patch({ recurrence: null })
    expect(stopped.json()).toMatchObject({ scheduled_on: saturday, series: null })
    expect((await series(seriesId)).endedAt).not.toBeNull()
  })

  it('answers 422 recurrence_needs_day for a rule on a task without a day', async () => {
    const { owner, workspaceId, listId } = await setup()
    const plain = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Plain' })).json().id as string
    const reply = await call('PATCH', `/api/tasks/${plain}`, owner.token, workspaceId, { recurrence: { freq: 'daily' } })
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toMatchObject({ code: 'recurrence_needs_day' })
  })

  it('answers 422 for a weekly rule without weekdays, until with count and an interval out of range', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const location = async (recurrence: object) => {
      const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { recurrence })
      expect(reply.statusCode).toBe(422)
      return reply.json().detail[0].loc
    }
    expect(await location({ freq: 'weekly' })).toEqual(['body', 'recurrence', 'weekdays'])
    expect(await location({ freq: 'weekly', weekdays: [] })).toEqual(['body', 'recurrence', 'weekdays'])
    expect(await location({ freq: 'daily', until: await day(40), count: 3 })).toEqual(['body', 'recurrence', 'count'])
    expect(await location({ freq: 'daily', interval: 100 })).toEqual(['body', 'recurrence', 'interval'])
    expect(await location({ freq: 'monthly' })).toEqual(['body', 'recurrence', 'month_day'])
  })

  it('answers 422 recurrence_until_before_day for an end before the scheduled day', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { recurrence: { freq: 'daily', until: await day(29) } })
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toMatchObject({ code: 'recurrence_until_before_day' })
  })

  it('answers 403 to a viewer and keeps the rule', async () => {
    const { viewer, owner, workspaceId, taskId, seriesId } = await setup()
    const refused = await call('PATCH', `/api/tasks/${taskId}`, viewer.token, workspaceId, { recurrence: null })
    expect(refused.statusCode).toBe(403)
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ series: { id: seriesId } })
  })
})
