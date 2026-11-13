import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { callTool, connect, listen } from '../support/mcp.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

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

/** A list with a task in Esta semana, a token of the owner with every scope and an MCP client on it. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const taskId = (await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, title: 'Validar', column: 'this_week' })).json()
    .id as string
  const client = await connect(url, (await mintToken(t, roles.owner.token, roles.workspaceId)).value)
  const read = async () => (await call('GET', `/api/tasks/${taskId}`, roles.owner.token, roles.workspaceId)).json()
  return { ...roles, listId, taskId, client, read }
}

const card = (board: Record<string, unknown>, id: string) =>
  (board.columns as { this_week: { tasks: Array<{ id: string }> } }).this_week.tasks.find((task) => task.id === id)

describe('the caixa-de-entrada fields in the MCP tools', () => {
  it('API-02 update_task with priority high and due_on saves both; API-01 get_task and get_board answer them', async () => {
    const { client, listId, taskId, read } = await setup()
    const updated = await callTool(client, 'update_task', { task_id: taskId, priority: 'high', due_on: '2026-11-14' })
    expect(updated.isError).toBe(false)
    expect(updated.json()).toMatchObject({ priority: 'high', due_on: '2026-11-14' })
    expect(await read()).toMatchObject({ priority: 'high', due_on: '2026-11-14' })

    const task = await callTool(client, 'get_task', { task_id: taskId })
    expect(task.json()).toMatchObject({ priority: 'high', due_on: '2026-11-14' })
    const board = await callTool(client, 'get_board', { list_id: listId })
    expect(card(board.json(), taskId)).toMatchObject({ priority: 'high', due_on: '2026-11-14' })
  })

  it('API-01 get_task and get_board answer kind, waiting, flag and group', async () => {
    const { client, listId, taskId } = await setup()
    await callTool(client, 'update_task', { task_id: taskId, waiting: true, waiting_for: 'Fulano', flagged: true, flag_reason: 'Bloqueada' })
    const expected = { kind: 'task', waiting: true, waiting_for: 'Fulano', flagged: true, flag_reason: 'Bloqueada', group_id: null }
    expect((await callTool(client, 'get_task', { task_id: taskId })).json()).toMatchObject(expected)
    expect(card((await callTool(client, 'get_board', { list_id: listId })).json(), taskId)).toMatchObject(expected)
  })

  it('API-02 create_task creates a reminder with priority and due day', async () => {
    const { client, listId, owner, workspaceId } = await setup()
    const created = await callTool(client, 'create_task', { list_id: listId, title: 'Pagar o DAS', kind: 'reminder', priority: 'ultra', due_on: '2026-11-20' })
    expect(created.isError).toBe(false)
    const read = await call('GET', `/api/tasks/${created.json().id as string}`, owner.token, workspaceId)
    expect(read.json()).toMatchObject({ kind: 'reminder', priority: 'ultra', due_on: '2026-11-20', estimate_minutes: null })
  })

  it('API-03 update_task with priority urgent is a tool error with the 422 message and saves nothing', async () => {
    const { client, taskId, read } = await setup()
    const refused = await callTool(client, 'update_task', { task_id: taskId, priority: 'urgent', title: 'Changed' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('priority')
    expect(await read()).toMatchObject({ title: 'Validar', priority: 'none' })
  })

  it('API-03 update_task with waiting_for of 101 characters is a tool error and saves nothing', async () => {
    const { client, taskId, read } = await setup()
    const refused = await callTool(client, 'update_task', { task_id: taskId, waiting: true, waiting_for: 'w'.repeat(101) })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('waiting_for')
    expect(await read()).toMatchObject({ waiting: false, waiting_for: null })
  })

  it('REM-02 API-03 create_task with an estimate on a reminder is a tool error with the 422 message and creates nothing', async () => {
    const { client, listId, owner, workspaceId } = await setup()
    const refused = await callTool(client, 'create_task', { list_id: listId, title: 'Pagar o DAS', kind: 'reminder', estimate_minutes: 30 })
    expect(refused.isError).toBe(true)
    expect(refused.text).toBe('A reminder has no estimate')
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    expect(board.columns.backlog.tasks).toEqual([])
  })
})
