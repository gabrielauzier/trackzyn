import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
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

describe('GET /api/lists/:id/board', () => {
  it('BOARD-01 answers the board of the list, also to a viewer; LIST-11 404 for another workspace; 422 for a non-UUID id', async () => {
    const { owner, viewer, workspaceId, stranger, strangerWorkspaceId } = await ownerViewerStranger(t)
    await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'America/Sao_Paulo' } })
    const list = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Week', color: 2 })).json()
    const today = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Focus', estimate_minutes: 30, column: 'today' })
    await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Later', estimate_minutes: 60, column: 'backlog' })
    const finished = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Finished', column: 'today' })
    await call('POST', `/api/tasks/${finished.json().id}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })

    const reply = await call('GET', `/api/lists/${list.id}/board`, viewer.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    const board = reply.json()
    expect(board).toMatchObject({
      list: { id: list.id, name: 'Week', color: 2 },
      timezone: 'America/Sao_Paulo',
      pending: { count: 2, estimate_minutes: 90 },
      columns: {
        backlog: { estimate_minutes: 60 },
        this_week: { tasks: [], estimate_minutes: 30, done: 1, total: 2 },
        today: { estimate_minutes: 30, done: 1, total: 2 },
        done: { today_count: 1 },
      },
    })
    expect(board.columns.today.tasks).toEqual([
      { id: today.json().id, title: 'Focus', estimate_minutes: 30, spent_seconds: 0, position: 0, subtasks: { done: 0, total: 0 } },
    ])
    expect(board.columns.done.days).toHaveLength(1)
    expect(board.columns.done.days[0].tasks.map((task: { title: string }) => task.title)).toEqual(['Finished'])

    const foreign = await call('GET', `/api/lists/${list.id}/board`, stranger.token, strangerWorkspaceId)
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'List not found' })

    const invalid = await call('GET', '/api/lists/nope/board', owner.token, workspaceId)
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json().detail[0]).toMatchObject({ loc: ['path', 'list_id'], msg: 'Input should be a valid UUID' })
  })
})
