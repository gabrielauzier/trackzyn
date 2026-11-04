import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { overview } from '../../src/services/reports.ts'
import { listSessions } from '../../src/services/sessions.ts'
import { moveTaskToList } from '../../src/services/tasks.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// #21: a task that moves to another list takes its recorded time with it; a break stays with its list.
const SP = (local: string) => new Date(`${local}-03:00`)
const NOW = SP('2026-10-25T12:00:00')
const WEEK = { from: '2026-10-19', to: '2026-10-25' }
const H = 3600

let db: Database
let client: PGlite
let seed: Awaited<ReturnType<typeof seedFocus>>
let workspace: { id: string; timezone: string | null }
let target: string
let moved: string
let stayed: string
let pauseId: string
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  seed = await seedFocus(db, SP('2026-10-01T09:00:00'))
  workspace = { id: seed.workspaceId, timezone: 'America/Sao_Paulo' }
  target = await seed.addList()
  moved = await seed.addTask({ title: 'moved' })
  stayed = await seed.addTask({ title: 'stayed' })
  await seed.addSession({ kind: 'task', taskId: moved, startedAt: SP('2026-10-20T09:00:00'), endedAt: SP('2026-10-20T11:00:00') })
  await seed.addSession({ kind: 'task', taskId: moved, startedAt: SP('2026-10-21T09:00:00'), endedAt: SP('2026-10-21T10:00:00') })
  await seed.addSession({ kind: 'task', taskId: stayed, startedAt: SP('2026-10-22T09:00:00'), endedAt: SP('2026-10-22T10:00:00') })
  pauseId = await seed.addSession({ kind: 'break', startedAt: SP('2026-10-21T10:00:00'), endedAt: SP('2026-10-21T10:10:00'), plannedSeconds: 600 })
})
afterEach(async () => {
  await client.close()
})

describe('moving a task to another list (#21)', () => {
  it('counts every earlier session of the task for the new list in the report, and leaves the other task where it was', async () => {
    await moveTaskToList(db, moved, seed.workspaceId, target, NOW)

    const report = await overview(db, seed.userId, workspace, { ...WEEK, listId: null }, NOW)
    expect(report.by_list.map((item) => [item.list_id, item.seconds])).toEqual([
      [target, 3 * H],
      [seed.listId, H],
    ])
    const onlyTarget = await overview(db, seed.userId, workspace, { ...WEEK, listId: target }, NOW)
    expect(onlyTarget.by_list).toEqual([{ list_id: target, name: 'Other', color: 2, is_archived: false, seconds: 3 * H }])
  })

  it('shows the moved task sessions under the new list in the agenda, and the break under the list it was taken in', async () => {
    await moveTaskToList(db, moved, seed.workspaceId, target, NOW)

    const sessions = await listSessions(db, { userId: seed.userId }, workspace, { ...WEEK, listId: null }, NOW)
    expect(sessions.map((session) => [session.task_title ?? 'break', session.list_id, session.list_name])).toEqual([
      ['moved', target, 'Other'],
      ['moved', target, 'Other'],
      ['break', seed.listId, 'Work'],
      ['stayed', seed.listId, 'Work'],
    ])
    expect((await seed.session(pauseId)).listId).toBe(seed.listId)
  })
})
