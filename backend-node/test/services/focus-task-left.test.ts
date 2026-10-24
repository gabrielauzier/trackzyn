import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { moveTask } from '../../src/services/tasks.ts'
import { migratedDb } from '../support/db.ts'
import { at, seedFocus } from '../support/focus.ts'

const T0 = new Date('2026-10-24T13:00:00Z')

let db: Database
let client: PGlite
let seed: Awaited<ReturnType<typeof seedFocus>>
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  seed = await seedFocus(db, T0)
})
afterEach(async () => {
  await client.close()
})

describe('FOCUS-15 the focused task leaves Today', () => {
  it('moving the focused task to this_week ends its session at the time of the move, with task_left', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    const id = await seed.addSession({ taskId, startedAt: T0, deadlineAt: at(T0, 60) })

    await moveTask(db, taskId, seed.workspaceId, { column: 'this_week', beforeTaskId: null }, at(T0, 12, 5))

    expect(await seed.session(id)).toMatchObject({ endedAt: at(T0, 12, 5), endReason: 'task_left' })
  })

  it('completing the focused task on the board ends its session at the time of the move', async () => {
    const taskId = await seed.addTask({ estimate: null })
    const id = await seed.addSession({ taskId, startedAt: T0 })

    await moveTask(db, taskId, seed.workspaceId, { column: 'done', beforeTaskId: null }, at(T0, 7))

    expect(await seed.session(id)).toMatchObject({ endedAt: at(T0, 7), endReason: 'task_left' })
  })

  it('moving another task out of Today leaves the session open', async () => {
    const focused = await seed.addTask({ estimate: 60 })
    const other = await seed.addTask({ estimate: 30 })
    const id = await seed.addSession({ taskId: focused, startedAt: T0, deadlineAt: at(T0, 60) })

    await moveTask(db, other, seed.workspaceId, { column: 'backlog', beforeTaskId: null }, at(T0, 5))

    expect(await seed.session(id)).toMatchObject({ endedAt: null, endReason: null })
  })

  it('reordering the focused task inside Today leaves the session open', async () => {
    const focused = await seed.addTask({ estimate: 60 })
    await seed.addTask({ estimate: 30 })
    const id = await seed.addSession({ taskId: focused, startedAt: T0, deadlineAt: at(T0, 60) })

    await moveTask(db, focused, seed.workspaceId, { column: 'today', beforeTaskId: null }, at(T0, 5))

    expect(await seed.session(id)).toMatchObject({ endedAt: null, endReason: null })
  })

  it('FOCUS-11 a session whose deadline passed before the move ends at the deadline, with estimate', async () => {
    const taskId = await seed.addTask({ estimate: 30 })
    const id = await seed.addSession({ taskId, startedAt: T0, deadlineAt: at(T0, 30) })

    await moveTask(db, taskId, seed.workspaceId, { column: 'this_week', beforeTaskId: null }, at(T0, 45))

    expect(await seed.session(id)).toMatchObject({ endedAt: at(T0, 30), endReason: 'estimate' })
  })
})
