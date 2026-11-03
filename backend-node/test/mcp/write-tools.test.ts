import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TOKEN_SCOPES, type TokenScope } from '../../src/db/schema.ts'
import { callTool, connect, listen, toolNames } from '../support/mcp.ts'
import { completedBy, invite, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

const UNKNOWN = '00000000-0000-4000-8000-000000000000'
const TABLE: Record<TokenScope, string[]> = {
  'lists:read': ['list_lists'],
  'tasks:read': ['get_board', 'get_task'],
  'tasks:create': ['create_task'],
  'tasks:write': ['add_subtask', 'move_task', 'update_task'],
  'tasks:delete': ['delete_task'],
}

let t: TestApp
let url: string
let roles: Awaited<ReturnType<typeof ownerViewerStranger>>
let listId: string
let foreignTaskId: string

const asOwner = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) => inWorkspace(t)(method, path, roles.owner.token, roles.workspaceId, payload)
const clientWith = async (scopes: readonly TokenScope[]) => connect(url, (await mintToken(t, roles.owner.token, roles.workspaceId, scopes)).value)
const newTask = async (column = 'backlog') => (await asOwner('POST', '/api/tasks', { list_id: listId, title: 'A task', column })).json().id as string
const readTask = async (id: string) => (await asOwner('GET', `/api/tasks/${id}`)).json() as { title: string; notes: string; estimate_minutes: number | null; column: string; position: number; completed_at: string | null; subtasks: Array<{ title: string }> }

/** A valid call of each write tool, on a task of its own. */
const CALLS: Record<string, () => Promise<Record<string, unknown>>> = {
  update_task: async () => ({ task_id: await newTask(), title: 'Renamed' }),
  move_task: async () => ({ task_id: await newTask(), column: 'today', before_task_id: null }),
  add_subtask: async () => ({ task_id: await newTask(), title: 'A subtask' }),
  delete_task: async () => ({ task_id: await newTask() }),
}
const SCOPE_OF: Record<string, TokenScope> = { update_task: 'tasks:write', move_task: 'tasks:write', add_subtask: 'tasks:write', delete_task: 'tasks:delete' }

beforeAll(async () => {
  t = await createTestApp()
  vi.spyOn(t.ctx.keyValueStore, 'rateLimitHit').mockResolvedValue(0)
  roles = await ownerViewerStranger(t)
  listId = (await asOwner('POST', '/api/lists', { name: 'Main', color: 1 })).json().id as string
  const call = inWorkspace(t)
  const theirList = (await call('POST', '/api/lists', roles.stranger.token, roles.strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id as string
  foreignTaskId = (await call('POST', '/api/tasks', roles.stranger.token, roles.strangerWorkspaceId, { list_id: theirList, title: 'Theirs', column: 'backlog' })).json().id as string
  url = await listen(t)
})
afterAll(async () => {
  await t.close()
})

describe('tools/list', () => {
  it.each(Object.entries(TABLE))('MCP-02 %s alone shows exactly its tools of the table', async (scope, names) => {
    const client = await clientWith([scope as TokenScope])
    expect(await toolNames(client)).toEqual(names)
    await client.close()
  })

  it('MCP-02 every scope shows the whole table, and delete_task only with tasks:delete', async () => {
    const all = await clientWith(TOKEN_SCOPES)
    expect(await toolNames(all)).toEqual(Object.values(TABLE).flat().sort())
    const others = await clientWith(TOKEN_SCOPES.filter((scope) => scope !== 'tasks:delete'))
    expect(await toolNames(others)).not.toContain('delete_task')
  })

  it('MCP-02 describes the tools and the fields', async () => {
    const client = await clientWith(['tasks:write', 'tasks:delete'])
    for (const tool of (await client.listTools()).tools) {
      expect(tool.description?.length, tool.name).toBeGreaterThan(20)
      for (const [field, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((schema as { description?: string }).description?.length, `${tool.name}.${field}`).toBeGreaterThan(5)
      }
    }
  })
})

describe('update_task', () => {
  it('applies the given fields and leaves the others', async () => {
    const client = await clientWith(['tasks:write'])
    const id = await newTask()
    const result = await callTool(client, 'update_task', { task_id: id, title: 'Renamed', estimate_minutes: 30, notes: 'New notes' })
    expect(result.isError).toBe(false)
    expect(result.json()).toMatchObject({ id, title: 'Renamed', estimate_minutes: 30, notes: 'New notes' })
    expect(await readTask(id)).toMatchObject({ title: 'Renamed', estimate_minutes: 30, notes: 'New notes' })

    await callTool(client, 'update_task', { task_id: id, notes: 'Only notes' })
    expect(await readTask(id)).toMatchObject({ title: 'Renamed', estimate_minutes: 30, notes: 'Only notes' })

    await callTool(client, 'update_task', { task_id: id, estimate_minutes: null })
    expect((await readTask(id)).estimate_minutes).toBeNull()
  })
})

describe('move_task', () => {
  it('moves to the end of a column with null', async () => {
    const client = await clientWith(['tasks:write'])
    const already = await newTask('today')
    const id = await newTask()
    const result = await callTool(client, 'move_task', { task_id: id, column: 'today', before_task_id: null })
    expect(result.isError).toBe(false)
    expect(result.json()).toMatchObject({ id, column: 'today' })
    expect((await readTask(id)).position).toBeGreaterThan((await readTask(already)).position)
  })

  it('moves right before another task', async () => {
    const client = await clientWith(['tasks:write'])
    const anchor = await newTask('this_week')
    const id = await newTask()
    await callTool(client, 'move_task', { task_id: id, column: 'this_week', before_task_id: anchor })
    expect((await readTask(id)).position).toBeLessThan((await readTask(anchor)).position)
  })

  it('AD-006 into done counts for the owner of the token', async () => {
    const client = await clientWith(['tasks:write'])
    const id = await newTask()
    await callTool(client, 'move_task', { task_id: id, column: 'done', before_task_id: null })
    expect((await readTask(id)).completed_at).not.toBeNull()
    expect(await completedBy(t, id)).toBe(roles.owner.id)
  })
})

describe('add_subtask', () => {
  it('adds to the end of the task', async () => {
    const client = await clientWith(['tasks:write'])
    const id = await newTask()
    await callTool(client, 'add_subtask', { task_id: id, title: 'First' })
    const result = await callTool(client, 'add_subtask', { task_id: id, title: 'Second' })
    expect(result.isError).toBe(false)
    expect(result.json()).toMatchObject({ task_id: id, title: 'Second', done: false })
    expect((await readTask(id)).subtasks.map((subtask) => subtask.title)).toEqual(['First', 'Second'])
  })
})

describe('delete_task', () => {
  it('deletes the task and says which', async () => {
    const client = await clientWith(['tasks:delete'])
    const id = await newTask()
    const result = await callTool(client, 'delete_task', { task_id: id })
    expect(result.isError).toBe(false)
    expect(result.json()).toEqual({ id, deleted: true })
    expect((await asOwner('GET', `/api/tasks/${id}`)).statusCode).toBe(404)
  })
})

describe.each(Object.keys(CALLS))('%s', (name) => {
  it('MCP-06 without its scope answers Missing scope and changes nothing', async () => {
    const client = await clientWith(TOKEN_SCOPES.filter((scope) => scope !== SCOPE_OF[name]))
    const args = await CALLS[name]!()
    const before = await readTask(args.task_id as string)
    expect(await callTool(client, name, args)).toMatchObject({ isError: true, text: `Missing scope: ${SCOPE_OF[name]!}` })
    expect(await readTask(args.task_id as string)).toEqual(before)
  })

  it('MCP-06 a task of another workspace answers Task not found and changes nothing', async () => {
    const client = await clientWith(TOKEN_SCOPES)
    const args = await CALLS[name]!()
    expect(await callTool(client, name, { ...args, task_id: foreignTaskId })).toMatchObject({ isError: true, text: 'Task not found' })
    const theirs = await inWorkspace(t)('GET', `/api/tasks/${foreignTaskId}`, roles.stranger.token, roles.strangerWorkspaceId)
    expect(theirs.json()).toMatchObject({ title: 'Theirs', column: 'backlog', subtasks: [] })
  })

  it('MCP-06 a task that does not exist answers Task not found', async () => {
    const client = await clientWith(TOKEN_SCOPES)
    expect(await callTool(client, name, { ...(await CALLS[name]!()), task_id: UNKNOWN })).toMatchObject({ isError: true, text: 'Task not found' })
  })

  it('MCP-06 an invalid task_id answers the text of the REST route', async () => {
    const client = await clientWith(TOKEN_SCOPES)
    const rest = await t.app.inject({ method: 'GET', url: '/api/tasks/not-a-uuid', headers: bearer((await mintToken(t, roles.owner.token, roles.workspaceId)).value) })
    const result = await callTool(client, name, { ...(await CALLS[name]!()), task_id: 'not-a-uuid' })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toEqual(rest.json().detail)
  })

  it('MCP-06 a viewer with the scope answers Read-only role and changes nothing', async () => {
    const editor = await invite(t, roles.owner.token, roles.workspaceId, 'editor')
    const client = await connect(url, (await mintToken(t, editor.token, roles.workspaceId)).value)
    await asOwner('PATCH', `/api/workspaces/${roles.workspaceId}/members/${editor.id}`, { role: 'viewer' })
    const args = await CALLS[name]!()
    const before = await readTask(args.task_id as string)
    expect(await callTool(client, name, args)).toMatchObject({ isError: true, text: 'Read-only role' })
    expect(await readTask(args.task_id as string)).toEqual(before)
  })
})

describe('invalid arguments answer the text of the REST route', () => {
  it.each([
    ['update_task', 'PATCH', '', { title: '' }],
    ['update_task', 'PATCH', '', { estimate_minutes: 1441 }],
    ['update_task', 'PATCH', '', { notes: 'x'.repeat(10_001) }],
    ['move_task', 'POST', '/move', { column: 'someday', before_task_id: null }],
    ['move_task', 'POST', '/move', { column: 'today' }],
    ['add_subtask', 'POST', '/subtasks', { title: '' }],
    ['add_subtask', 'POST', '/subtasks', {}],
  ] as Array<[string, 'PATCH' | 'POST', string, Record<string, unknown>]>)('MCP-06 %s %s%s %j', async (name, method, suffix, args) => {
    const client = await clientWith(TOKEN_SCOPES)
    const id = await newTask()
    const rest = await asOwner(method, `/api/tasks/${id}${suffix}`, args)
    expect(rest.statusCode).toBe(422)
    const result = await callTool(client, name, { task_id: id, ...args })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toEqual(rest.json().detail)
  })
})
