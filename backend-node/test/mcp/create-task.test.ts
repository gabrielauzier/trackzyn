import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { personalAccessTokens, taskIdempotencyKeys, tasks } from '../../src/db/schema.ts'
import { callTool, connect, listen, post, toolNames } from '../support/mcp.ts'
import { completedBy, invite, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

const UNKNOWN = '00000000-0000-4000-8000-000000000000'

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

/** The roles, one empty list, a token of the owner with every scope and an MCP client on it. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const list = await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })
  const listId = list.json().id as string
  const token = await mintToken(t, roles.owner.token, roles.workspaceId)
  const client = await connect(url, token.value)
  const create = (args: Record<string, unknown>) => callTool(client, 'create_task', { list_id: listId, ...args })
  const rest = (payload: object, headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'POST', url: '/api/tasks', headers: { ...bearer(token.value), ...headers }, payload: { list_id: listId, ...payload } })
  const stored = () => t.ctx.db.select().from(tasks).where(eq(tasks.listId, listId))
  return { ...roles, listId, token, client, create, rest, stored }
}

describe('tools/list', () => {
  it('MCP-02 shows create_task only with tasks:create', async () => {
    const { owner, workspaceId } = await setup()
    const creating = await connect(url, (await mintToken(t, owner.token, workspaceId, ['lists:read', 'tasks:create'])).value)
    expect(await toolNames(creating)).toEqual(['create_task', 'list_lists'])
    const reading = await connect(url, (await mintToken(t, owner.token, workspaceId, ['lists:read'])).value)
    expect(await toolNames(reading)).toEqual(['list_lists'])
  })

  it('MCP-03 describes the fields and limits of POST /api/tasks and idempotency_key', async () => {
    const { client } = await setup()
    const { tools } = await client.listTools()
    const { inputSchema, description } = tools.find((tool) => tool.name === 'create_task')!
    expect(description?.length).toBeGreaterThan(20)
    expect(inputSchema.required).toEqual(['list_id', 'title'])
    const fields = inputSchema.properties as Record<string, Record<string, unknown>>
    expect(Object.keys(fields).sort()).toEqual(['column', 'estimate_minutes', 'idempotency_key', 'list_id', 'notes', 'subtasks', 'title'])
    expect(fields.list_id).toMatchObject({ type: 'string', pattern: expect.any(String) })
    expect(fields.title).toMatchObject({ type: 'string', minLength: 1, maxLength: 255 })
    expect(fields.column).toMatchObject({ enum: ['backlog', 'this_week', 'today', 'done'], default: 'backlog' })
    expect(fields.notes).toMatchObject({ type: 'string', maxLength: 10_000 })
    expect(fields.subtasks).toMatchObject({ type: 'array', maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 255 } })
    expect(fields.idempotency_key).toMatchObject({ type: 'string', minLength: 1, maxLength: 255 })
    expect(JSON.stringify(fields.estimate_minutes)).toContain('"maximum":1440')
    expect(JSON.stringify(fields.estimate_minutes)).toContain('"minimum":1')
    expect(JSON.stringify(fields.estimate_minutes)).toContain('"type":"null"')
    for (const [field, schema] of Object.entries(fields)) expect((schema.description as string)?.length, field).toBeGreaterThan(5)
  })
})

describe('create_task', () => {
  it('MCP-04 with list_id and title creates at the end of backlog and answers the id and the title', async () => {
    const { create, stored } = await setup()
    const first = await create({ title: 'First' })
    const second = await create({ title: 'Second' })
    expect(first.isError).toBe(false)
    expect(first.json()).toMatchObject({ title: 'First', column: 'backlog', replayed: false })
    const rows = await stored()
    expect(rows.find((row) => row.id === first.json().id)).toMatchObject({ title: 'First', column: 'backlog', position: 0 })
    expect(rows.find((row) => row.id === second.json().id)).toMatchObject({ title: 'Second', column: 'backlog', position: 1 })
  })

  it('MCP-04 records every field', async () => {
    const { create, owner, workspaceId } = await setup()
    const result = await create({ title: 'Full', column: 'today', estimate_minutes: 25, notes: 'Some notes', subtasks: ['One', 'Two'] })
    expect(result.isError).toBe(false)
    const read = await call('GET', `/api/tasks/${result.json().id as string}`, owner.token, workspaceId)
    expect(read.json()).toMatchObject({ title: 'Full', column: 'today', estimate_minutes: 25, notes: 'Some notes' })
    expect((read.json().subtasks as Array<{ title: string }>).map((subtask) => subtask.title)).toEqual(['One', 'Two'])
  })

  it('ORIGIN-01 the task shows on the board with the name of the token', async () => {
    const { create, listId, token, owner, workspaceId } = await setup()
    const [row] = await t.ctx.db.select({ name: personalAccessTokens.name }).from(personalAccessTokens).where(eq(personalAccessTokens.id, token.id))
    const result = await create({ title: 'On the board' })
    expect(result.json().created_via).toBe(row!.name)
    const board = await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)
    expect(board.json().columns.backlog.tasks).toEqual([expect.objectContaining({ id: result.json().id, created_via: row!.name })])
  })

  it('API-10 in the done column counts for the owner of the token', async () => {
    const { create, owner } = await setup()
    const result = await create({ title: 'Finished', column: 'done' })
    expect(await completedBy(t, result.json().id as string)).toBe(owner.id)
  })
})

describe('failures', () => {
  it('MCP-13 a JSON-RPC batch answers 400 and runs none of its calls', async () => {
    const { listId, token } = await setup()
    const message = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'create_task', arguments: { list_id: listId, title: `Batch ${id}` } } })
    const reply = await post(url, [message(1), message(2)], { authorization: `Bearer ${token.value}` })
    expect(reply.status).toBe(400)
    expect(await reply.json()).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch requests are not supported' } })
    expect(await t.ctx.db.select().from(tasks).where(eq(tasks.listId, listId))).toEqual([])
  })

  it('MCP-13 a batch of one item answers 400 and does not run it', async () => {
    const { listId, token, stored } = await setup()
    const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_task', arguments: { list_id: listId, title: 'Batch' } } }
    const reply = await post(url, [message], { authorization: `Bearer ${token.value}` })
    expect(reply.status).toBe(400)
    expect(await stored()).toEqual([])
  })

  it('API-12 add_subtask with a NUL character is a tool error and adds nothing', async () => {
    const { client, create } = await setup()
    const task = JSON.parse((await create({ title: 'A' })).text) as { id: string }
    const result = await callTool(client, 'add_subtask', { task_id: task.id, title: 'a\u0000b' })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)[0].loc).toEqual(['body', 'title'])
    expect(JSON.parse((await callTool(client, 'get_task', { task_id: task.id })).text).subtasks).toEqual([])
  })

  it('MCP-06 an idempotency_key with a NUL character is a tool error and creates nothing', async () => {
    const { create, stored } = await setup()
    const result = await create({ title: 'A', idempotency_key: 'a\u0000b' })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)[0].loc).toEqual(['body', 'idempotency_key'])
    expect(await stored()).toEqual([])
  })

  it('API-12 a title with a NUL character is a tool error, like the 422 of the route', async () => {
    const { client, listId } = await setup()
    const result = await callTool(client, 'create_task', { list_id: listId, title: 'a\u0000b' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('title')
    expect(await t.ctx.db.select().from(tasks).where(eq(tasks.listId, listId))).toEqual([])
  })

  it.each([
    ['an empty title', { title: '' }],
    ['a title over the limit', { title: 'x'.repeat(256) }],
    ['no title', {}],
    ['an estimate over the limit', { title: 'A', estimate_minutes: 1441 }],
    ['notes over the limit', { title: 'A', notes: 'x'.repeat(10_001) }],
    ['too many subtasks', { title: 'A', subtasks: Array.from({ length: 51 }, () => 'x') }],
    ['an unknown column', { title: 'A', column: 'someday' }],
  ])('MCP-06 %s answers the text of the REST route and creates nothing', async (_name, args) => {
    const { create, rest, stored } = await setup()
    const reply = await rest(args)
    expect(reply.statusCode).toBe(422)
    const result = await create(args)
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toEqual(reply.json().detail)
    expect(await stored()).toEqual([])
  })

  it('MCP-06 a list that does not exist answers the text of the REST route', async () => {
    const { client, rest } = await setup()
    const reply = await rest({ list_id: UNKNOWN, title: 'A' })
    expect(reply.statusCode).toBe(404)
    expect(await callTool(client, 'create_task', { list_id: UNKNOWN, title: 'A' })).toMatchObject({ isError: true, text: reply.json().detail })
  })

  it('MCP-04 an archived list answers List is archived', async () => {
    const { create, listId, owner, workspaceId, stored } = await setup()
    await call('PATCH', `/api/lists/${listId}`, owner.token, workspaceId, { is_archived: true })
    expect(await create({ title: 'Late' })).toMatchObject({ isError: true, text: 'List is archived' })
    expect(await stored()).toEqual([])
  })

  it('MCP-06 without tasks:create answers Missing scope', async () => {
    const { owner, workspaceId, listId } = await setup()
    const client = await connect(url, (await mintToken(t, owner.token, workspaceId, ['lists:read'])).value)
    expect(await callTool(client, 'create_task', { list_id: listId, title: 'A' })).toMatchObject({ isError: true, text: 'Missing scope: tasks:create' })
  })

  it('MCP-06 a viewer with the scope answers Read-only role, before looking at the arguments', async () => {
    const { owner, workspaceId, listId, stored } = await setup()
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    const client = await connect(url, (await mintToken(t, editor.token, workspaceId, ['tasks:create'])).value)
    await call('PATCH', `/api/workspaces/${workspaceId}/members/${editor.id}`, owner.token, workspaceId, { role: 'viewer' })
    expect(await callTool(client, 'create_task', { list_id: listId, title: 'A' })).toMatchObject({ isError: true, text: 'Read-only role' })
    expect(await callTool(client, 'create_task', { title: '' })).toMatchObject({ isError: true, text: 'Read-only role' })
    expect(await stored()).toEqual([])
  })
})

describe('idempotency_key', () => {
  it('MCP-05 the same key does not duplicate, and the retry says so', async () => {
    const { create, stored } = await setup()
    const first = await create({ title: 'Once', idempotency_key: 'k-1' })
    const second = await create({ title: 'Once', idempotency_key: 'k-1' })
    expect(first.json().replayed).toBe(false)
    expect(second.json().replayed).toBe(true)
    expect(second.json().id).toBe(first.json().id)
    expect(await stored()).toHaveLength(1)
  })

  it('MCP-05 the same key in REST and in MCP by the same token does not duplicate, both ways', async () => {
    const { create, rest, stored } = await setup()
    const fromRest = await rest({ title: 'Once' }, { 'idempotency-key': 'k-rest' })
    const fromMcp = await create({ title: 'Once', idempotency_key: 'k-rest' })
    expect(fromMcp.json()).toMatchObject({ id: fromRest.json().id, replayed: true })

    const created = await create({ title: 'Twice', idempotency_key: 'k-mcp' })
    const replay = await rest({ title: 'Twice' }, { 'idempotency-key': 'k-mcp' })
    expect(replay.headers['idempotency-replayed']).toBe('true')
    expect(replay.json().id).toBe(created.json().id)
    expect(await stored()).toHaveLength(2)
  })

  it('MCP-05 the same key with another payload answers the conflict of the REST route', async () => {
    const { create, stored } = await setup()
    await create({ title: 'Once', idempotency_key: 'k-2' })
    expect(await create({ title: 'Other', idempotency_key: 'k-2' })).toMatchObject({ isError: true, text: 'Idempotency key reused with a different payload' })
    expect(await stored()).toHaveLength(1)
  })

  it('MCP-05 the key of a deleted task answers Task was deleted', async () => {
    const { create, owner, workspaceId, stored } = await setup()
    const first = await create({ title: 'Once', idempotency_key: 'k-3' })
    await call('DELETE', `/api/tasks/${first.json().id as string}`, owner.token, workspaceId)
    expect(await create({ title: 'Once', idempotency_key: 'k-3' })).toMatchObject({ isError: true, text: 'Task was deleted' })
    expect(await stored()).toEqual([])
  })

  it.each([
    ['empty', '', 'string_too_short', 'String should have at least 1 characters'],
    ['over 255 characters', 'k'.repeat(256), 'string_too_long', 'String should have at most 255 characters'],
  ])('MCP-05 a key that is %s answers the message of the REST route', async (_name, key, type, msg) => {
    const { create, stored } = await setup()
    const result = await create({ title: 'A', idempotency_key: key })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toEqual([{ type, loc: ['body', 'idempotency_key'], msg }])
    expect(await stored()).toEqual([])
  })

  it('MCP-05 a key older than 24h creates a new task', async () => {
    const { create, stored, token } = await setup()
    const first = await create({ title: 'Once', idempotency_key: 'k-4' })
    await t.ctx.db.update(taskIdempotencyKeys).set({ createdAt: new Date(Date.now() - 86_400_001) }).where(eq(taskIdempotencyKeys.tokenId, token.id))
    const second = await create({ title: 'Once', idempotency_key: 'k-4' })
    expect(second.json()).toMatchObject({ replayed: false })
    expect(second.json().id).not.toBe(first.json().id)
    expect(await stored()).toHaveLength(2)
  })

  it('MCP-05 two tokens with the same key create one task each', async () => {
    const { create, owner, workspaceId, listId, stored } = await setup()
    const other = await connect(url, (await mintToken(t, owner.token, workspaceId)).value)
    const mine = await create({ title: 'Once', idempotency_key: 'k-5' })
    const theirs = await callTool(other, 'create_task', { list_id: listId, title: 'Once', idempotency_key: 'k-5' })
    expect(theirs.json().id).not.toBe(mine.json().id)
    expect(await stored()).toHaveLength(2)
  })
})
