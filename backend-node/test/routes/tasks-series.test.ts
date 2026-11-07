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
