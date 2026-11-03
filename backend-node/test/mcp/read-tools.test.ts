import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TokenScope } from '../../src/db/schema.ts'
import { callTool, connect, listen, post, toolNames } from '../support/mcp.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

const UNKNOWN = '00000000-0000-4000-8000-000000000000'

let t: TestApp
let url: string
let roles: Awaited<ReturnType<typeof ownerViewerStranger>>
let listId: string
let taskId: string
let foreignListId: string

const asOwner = (method: 'GET' | 'POST', path: string, payload?: object) => inWorkspace(t)(method, path, roles.owner.token, roles.workspaceId, payload)
const clientWith = async (scopes: readonly TokenScope[]) => connect(url, (await mintToken(t, roles.owner.token, roles.workspaceId, scopes)).value)

beforeAll(async () => {
  t = await createTestApp()
  vi.spyOn(t.ctx.keyValueStore, 'rateLimitHit').mockResolvedValue(0)
  roles = await ownerViewerStranger(t)
  listId = (await asOwner('POST', '/api/lists', { name: 'Main', color: 3 })).json().id as string
  taskId = (await asOwner('POST', '/api/tasks', { list_id: listId, title: 'A secret title', column: 'today', notes: 'Some notes', subtasks: ['One'] })).json().id as string
  foreignListId = (await inWorkspace(t)('POST', '/api/lists', roles.stranger.token, roles.strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id as string
  url = await listen(t)
})
afterAll(async () => {
  await t.close()
})

describe('tools/list', () => {
  it.each([
    [['lists:read'], ['list_lists']],
    [['tasks:read'], ['get_board', 'get_task']],
    [['lists:read', 'tasks:read'], ['get_board', 'get_task', 'list_lists']],
  ] as Array<[TokenScope[], string[]]>)('MCP-02 with %j shows only %j', async (scopes, names) => {
    const client = await clientWith(scopes)
    expect(await toolNames(client)).toEqual(names)
    await client.close()
  })

  it('MCP-02 describes each tool and each field for an agent', async () => {
    const client = await clientWith(['lists:read', 'tasks:read'])
    const { tools } = await client.listTools()
    for (const tool of tools) {
      expect(tool.description?.length, tool.name).toBeGreaterThan(20)
      expect(tool.inputSchema.type, tool.name).toBe('object')
      for (const [field, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((schema as { description?: string }).description?.length, `${tool.name}.${field}`).toBeGreaterThan(5)
      }
    }
    const getTask = tools.find((tool) => tool.name === 'get_task')!
    expect(Object.keys(getTask.inputSchema.properties!)).toEqual(['task_id'])
    expect(getTask.inputSchema.required).toEqual(['task_id'])
    await client.close()
  })
})

describe('list_lists', () => {
  const previewOf = async (scopes: TokenScope[]) => {
    const client = await clientWith(scopes)
    const result = await callTool(client, 'list_lists')
    await client.close()
    expect(result.isError).toBe(false)
    const { lists } = result.json() as { lists: Array<{ id: string; name: string; preview: Array<{ title: string }> }> }
    return { text: result.text, list: lists.find((list) => list.id === listId)! }
  }

  it('SCOPE-09 answers the lists with an empty preview without tasks:read', async () => {
    const { text, list } = await previewOf(['lists:read'])
    expect(list.name).toBe('Main')
    expect(list.preview).toEqual([])
    expect(text).not.toContain('A secret title')
  })

  it('SCOPE-09 answers what GET /api/lists answers with tasks:read', async () => {
    const { list, text } = await previewOf(['lists:read', 'tasks:read'])
    expect(list.preview.map((item) => item.title)).toEqual(['A secret title'])
    const token = await mintToken(t, roles.owner.token, roles.workspaceId, ['lists:read', 'tasks:read'])
    const rest = await t.app.inject({ method: 'GET', url: '/api/lists', headers: bearer(token.value) })
    expect(JSON.parse(text)).toEqual(rest.json())
  })
})

describe('get_board and get_task', () => {
  it('get_board answers what the REST route answers', async () => {
    const client = await clientWith(['tasks:read'])
    const result = await callTool(client, 'get_board', { list_id: listId })
    expect(result.isError).toBe(false)
    expect(result.json()).toEqual((await asOwner('GET', `/api/lists/${listId}/board`)).json())
    await client.close()
  })

  it('get_task answers what the REST route answers', async () => {
    const client = await clientWith(['tasks:read'])
    const result = await callTool(client, 'get_task', { task_id: taskId })
    expect(result.isError).toBe(false)
    const rest = (await asOwner('GET', `/api/tasks/${taskId}`)).json()
    expect(result.json()).toEqual(rest)
    expect(rest).toMatchObject({ title: 'A secret title', notes: 'Some notes' })
    await client.close()
  })
})

describe('failures', () => {
  it.each([
    ['list_lists', 'lists:read', {}, ['tasks:read']],
    ['get_board', 'tasks:read', { list_id: UNKNOWN }, ['lists:read']],
    ['get_task', 'tasks:read', { task_id: UNKNOWN }, ['lists:read']],
  ] as Array<[string, string, object, TokenScope[]]>)('MCP-06 %s without %s answers Missing scope', async (name, scope, args, scopes) => {
    const client = await clientWith(scopes)
    const result = await callTool(client, name, args as Record<string, unknown>)
    expect(result).toMatchObject({ isError: true, text: `Missing scope: ${scope}` })
    await client.close()
  })

  it('MCP-06 the scope is checked before the arguments', async () => {
    const client = await clientWith(['lists:read'])
    expect(await callTool(client, 'get_task', { task_id: 'not-a-uuid' })).toMatchObject({ isError: true, text: 'Missing scope: tasks:read' })
    await client.close()
  })

  it.each([
    ['get_task', { task_id: UNKNOWN }, 'Task not found'],
    ['get_board', { list_id: UNKNOWN }, 'List not found'],
  ] as Array<[string, Record<string, unknown>, string]>)('MCP-06 %s of a resource that does not exist answers %s', async (name, args, text) => {
    const client = await clientWith(['tasks:read'])
    expect(await callTool(client, name, args)).toMatchObject({ isError: true, text })
    await client.close()
  })

  it('MCP-06 a list of another workspace answers as if it did not exist, as the REST route does', async () => {
    const token = await mintToken(t, roles.owner.token, roles.workspaceId, ['tasks:read'])
    const client = await connect(url, token.value)
    const rest = await t.app.inject({ method: 'GET', url: `/api/lists/${foreignListId}/board`, headers: bearer(token.value) })
    expect(rest.statusCode).toBe(404)
    expect(await callTool(client, 'get_board', { list_id: foreignListId })).toMatchObject({ isError: true, text: rest.json().detail })
    await client.close()
  })

  it.each([
    ['get_task', 'task_id', (id: string) => `/api/tasks/${id}`],
    ['get_board', 'list_id', (id: string) => `/api/lists/${id}/board`],
  ] as Array<[string, string, (id: string) => string]>)('MCP-06 %s with an invalid argument answers the text of the REST route', async (name, field, path) => {
    const token = await mintToken(t, roles.owner.token, roles.workspaceId, ['tasks:read'])
    const client = await connect(url, token.value)
    const rest = await t.app.inject({ method: 'GET', url: path('not-a-uuid'), headers: bearer(token.value) })
    expect(rest.statusCode).toBe(422)
    const result = await callTool(client, name, { [field]: 'not-a-uuid' })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toEqual(rest.json().detail)
    await client.close()
  })

  it('MCP-06 a missing argument answers Field required', async () => {
    const client = await clientWith(['tasks:read'])
    const result = await callTool(client, 'get_task')
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toEqual([{ type: 'missing', loc: ['path', 'task_id'], msg: 'Field required' }])
    await client.close()
  })

  it('an unknown tool answers isError', async () => {
    const client = await clientWith(['lists:read'])
    expect(await callTool(client, 'drop_everything')).toMatchObject({ isError: true, text: 'Unknown tool: drop_everything' })
    await client.close()
  })
})

describe('an unexpected failure in a tool', () => {
  it('answers JSON-RPC -32603 without the cause, which goes to the log', async () => {
    const lines: string[] = []
    const logged = await createTestApp({}, { server: { logger: { level: 'info', stream: { write: (line: string) => void lines.push(line) } } } })
    try {
      const { owner, workspaceId } = await ownerViewerStranger(logged)
      const token = await mintToken(logged, owner.token, workspaceId)
      const mcp = await listen(logged)
      await logged.ctx.db.execute(sql`ALTER TABLE lists RENAME TO lists_gone`)
      lines.length = 0

      const reply = await post(mcp, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'list_lists', arguments: {} } }, { authorization: `Bearer ${token.value}` })
      const text = await reply.text()
      expect(JSON.parse(text)).toEqual({ jsonrpc: '2.0', id: 9, error: { code: -32603, message: 'Internal server error' } })
      expect(text).not.toContain('lists')
      expect(lines.join('')).toContain('mcp tool failed')
      expect(lines.join('')).toContain('lists')
    } finally {
      await logged.close()
    }
  })
})
