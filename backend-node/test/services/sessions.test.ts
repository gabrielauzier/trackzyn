import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { lists, workspaces } from '../../src/db/schema.ts'
import { type AgendaFilter, listSessions } from '../../src/services/sessions.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// America/Sao_Paulo is UTC-3.
const SP = (local: string) => new Date(`${local}-03:00`)
const NOW = SP('2026-11-04T12:00:00')
const WEEK: AgendaFilter = { from: '2026-11-02', to: '2026-11-08', listId: null }

let db: Database
let client: PGlite
let seed: Awaited<ReturnType<typeof seedFocus>>
let workspace: { id: string; timezone: string | null }
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  seed = await seedFocus(db, SP('2026-10-01T09:00:00'))
  workspace = { id: seed.workspaceId, timezone: 'America/Sao_Paulo' }
})
afterEach(async () => {
  await client.close()
})

const actor = () => ({ userId: seed.userId })

describe('listSessions', () => {
  it('AGENDA-01 AGENDA-03 AGENDA-04 returns each session uncut with task, list, color and origin; a break has no task', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const task = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T09:00:00'), endedAt: SP('2026-11-02T10:15:00') })
    const pause = await seed.addSession({
      kind: 'break',
      startedAt: SP('2026-11-02T10:15:00'),
      endedAt: SP('2026-11-02T10:20:00'),
      plannedSeconds: 300,
    })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found).toEqual([
      {
        id: task,
        kind: 'task',
        origin: 'focus',
        task_id: write,
        task_title: 'Write',
        list_id: seed.listId,
        list_name: 'Work',
        list_color: 1,
        started_at: SP('2026-11-02T09:00:00').toISOString(),
        ended_at: SP('2026-11-02T10:15:00').toISOString(),
      },
      {
        id: pause,
        kind: 'break',
        origin: 'focus',
        task_id: null,
        task_title: null,
        list_id: seed.listId,
        list_name: 'Work',
        list_color: 1,
        started_at: SP('2026-11-02T10:15:00').toISOString(),
        ended_at: SP('2026-11-02T10:20:00').toISOString(),
      },
    ])
  })

  it('AGENDA-05 returns the open session with ended_at null', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const open = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-04T11:20:00') })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found.map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at }))).toEqual([
      { id: open, started_at: SP('2026-11-04T11:20:00').toISOString(), ended_at: null },
    ])
  })

  it('AGENDA-07 a session from 23:30 to 00:30 comes whole when asking for only the first day and for only the second', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const id = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T23:30:00'), endedAt: SP('2026-11-03T00:30:00') })
    // Outside both days: ends at the first midnight, starts at the second.
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-01T23:00:00'), endedAt: SP('2026-11-02T00:00:00') })
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-04T00:00:00'), endedAt: SP('2026-11-04T00:30:00') })
    const whole = { started_at: SP('2026-11-02T23:30:00').toISOString(), ended_at: SP('2026-11-03T00:30:00').toISOString() }

    const first = await listSessions(db, actor(), workspace, { from: '2026-11-02', to: '2026-11-02', listId: null }, NOW)
    const second = await listSessions(db, actor(), workspace, { from: '2026-11-03', to: '2026-11-03', listId: null }, NOW)

    expect(first.map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at }))).toEqual([{ id, ...whole }])
    expect(second.map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at }))).toEqual([{ id, ...whole }])
  })

  it('AGENDA-10 leaves out the sessions of another user and of another workspace of the same user', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const mine = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T09:00:00'), endedAt: SP('2026-11-02T10:00:00') })
    await seed.addSession({
      kind: 'task',
      taskId: write,
      userId: await seed.addUser(),
      startedAt: SP('2026-11-02T11:00:00'),
      endedAt: SP('2026-11-02T12:00:00'),
    })
    const otherWorkspace = randomUUID()
    const otherList = randomUUID()
    await db.insert(workspaces).values({ id: otherWorkspace, name: 'Other', timezone: 'America/Sao_Paulo', createdAt: NOW })
    await db.insert(lists).values({ id: otherList, workspaceId: otherWorkspace, name: 'Elsewhere', color: 3, position: 0, createdByUserId: seed.userId, createdAt: NOW })
    await seed.addSession({
      kind: 'break',
      workspaceId: otherWorkspace,
      listId: otherList,
      startedAt: SP('2026-11-02T13:00:00'),
      endedAt: SP('2026-11-02T13:05:00'),
    })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found.map((s) => s.id)).toEqual([mine])
  })

  it('AD-001 an open session past its deadline comes closed at the deadline', async () => {
    const write = await seed.addTask({ title: 'Write', estimate: 25 })
    const id = await seed.addSession({
      kind: 'task',
      taskId: write,
      startedAt: SP('2026-11-04T10:00:00'),
      deadlineAt: SP('2026-11-04T10:25:00'),
    })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found.map((s) => ({ id: s.id, ended_at: s.ended_at }))).toEqual([{ id, ended_at: SP('2026-11-04T10:25:00').toISOString() }])
    const row = await seed.session(id)
    expect(row.endedAt?.toISOString()).toBe(SP('2026-11-04T10:25:00').toISOString())
    expect(row.endReason).toBe('estimate')
  })

  it('AGENDA-09 the list filter keeps only the sessions of that list', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const other = await seed.addList()
    const plan = await seed.addTask({ title: 'Plan', listId: other })
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T09:00:00'), endedAt: SP('2026-11-02T10:00:00') })
    const kept = await seed.addSession({ kind: 'task', taskId: plan, listId: other, startedAt: SP('2026-11-02T10:00:00'), endedAt: SP('2026-11-02T11:00:00') })
    const keptBreak = await seed.addSession({ kind: 'break', listId: other, startedAt: SP('2026-11-02T11:00:00'), endedAt: SP('2026-11-02T11:05:00') })

    const found = await listSessions(db, actor(), workspace, { ...WEEK, listId: other }, NOW)

    expect(found.map((s) => ({ id: s.id, list_id: s.list_id, list_name: s.list_name, list_color: s.list_color }))).toEqual([
      { id: kept, list_id: other, list_name: 'Other', list_color: 2 },
      { id: keptBreak, list_id: other, list_name: 'Other', list_color: 2 },
    ])
  })

  it('AGENDA-11 a week without sessions returns none', async () => {
    const write = await seed.addTask({ title: 'Write' })
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-10-26T09:00:00'), endedAt: SP('2026-10-26T10:00:00') })

    expect(await listSessions(db, actor(), workspace, WEEK, NOW)).toEqual([])
  })
})
