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

/** The roles, a workspace in Sao Paulo time, one list and one task scheduled `offset` days on, repeating by `rule`. */
async function setup(rule: RecurrenceRule = DAILY, offset = 30) {
  const roles = await ownerViewerStranger(t)
  await call('PATCH', `/api/workspaces/${roles.workspaceId}`, roles.owner.token, roles.workspaceId, { timezone: TZ })
  const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const on = await day(offset)
  const taskId = (
    await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, title: 'Review', scheduled_on: on, scheduled_time: '09:00' })
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
