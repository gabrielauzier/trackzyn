import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type HoursCountMode, focusSessions, lists, workspaces } from '../../src/db/schema.ts'
import { buildBoard } from '../../src/services/board.ts'
import * as focus from '../../src/services/focus.ts'
import { spentMilliseconds, spentSeconds } from '../../src/services/focus-settle.ts'
import { migratedDb } from '../support/db.ts'
import { at, seedFocus } from '../support/focus.ts'

// 09:00 in the workspace timezone (America/Sao_Paulo, UTC-3): the spec examples read as wall-clock times.
const T0 = new Date('2026-10-26T12:00:00Z')
const HOUR = 60 * 60

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

const setMode = (mode: HoursCountMode, workspaceId = seed.workspaceId) =>
  db.update(workspaces).set({ hoursCountMode: mode }).where(eq(workspaces.id, workspaceId))
const closed = (taskId: string, from: number, to: number, userId = seed.userId) =>
  seed.addSession({ taskId, userId, startedAt: at(T0, from), endedAt: at(T0, to) })
const spentOf = async (taskId: string, now = at(T0, 600)) => (await spentSeconds(db, [taskId], now)).get(taskId)

describe('time spent on a task in net hours (#42)', () => {
  it('HOURS-23 HOURS-26 a focus session 09:00–10:00 and a manual one 09:30–10:30 count 1h 30min in net and 2h in gross', async () => {
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 60)
    await seed.addSession({ taskId, startedAt: at(T0, 30), endedAt: at(T0, 90), origin: 'manual', deviceId: 'agenda', endReason: 'manual' })

    expect(await spentOf(taskId)).toBe(2 * HOUR)
    await setMode('net')
    expect(await spentOf(taskId)).toBe(1.5 * HOUR)
  })

  it('HOURS-32 two sessions that only touch count both in net', async () => {
    await setMode('net')
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 60)
    await closed(taskId, 60, 90)

    expect(await spentOf(taskId)).toBe(1.5 * HOUR)
  })

  it('HOURS-33 a session inside another counts as the longer one in net', async () => {
    await setMode('net')
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 120)
    await closed(taskId, 30, 60)

    expect(await spentOf(taskId)).toBe(2 * HOUR)
  })

  it('HOURS-34 a chain of three sessions counts from the first start to the last end in net', async () => {
    await setMode('net')
    const taskId = await seed.addTask({ estimate: 300 })
    await closed(taskId, 0, 60)
    await closed(taskId, 45, 120)
    await closed(taskId, 110, 150)

    expect(await spentOf(taskId)).toBe(2.5 * HOUR)
  })

  it('HOURS-35 an open session over a manual one counts up to now, never past its deadline, and the overlap once', async () => {
    await setMode('net')
    const taskId = await seed.addTask({ estimate: 300 })
    await seed.addSession({ taskId, startedAt: at(T0, 0), deadlineAt: at(T0, 90) })
    await seed.addSession({ taskId, startedAt: at(T0, 10), endedAt: at(T0, 30), origin: 'manual', deviceId: 'agenda', endReason: 'manual' })

    expect(await spentOf(taskId, at(T0, 45))).toBe(45 * 60)
    expect(await spentOf(taskId, at(T0, 200))).toBe(90 * 60)
  })

  it('HOURS-23 joins the sessions of every member of the task in net', async () => {
    await setMode('net')
    const other = await seed.addUser()
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 60)
    await closed(taskId, 30, 90, other)

    expect(await spentOf(taskId)).toBe(1.5 * HOUR)
  })

  it('HOURS-23 the overlap of one task never changes another task of the same workspace in net', async () => {
    await setMode('net')
    const overlapped = await seed.addTask({ estimate: 180 })
    const apart = await seed.addTask({ estimate: 180 })
    await closed(overlapped, 0, 60)
    await closed(overlapped, 30, 90)
    await closed(apart, 0, 60)
    await closed(apart, 60, 75)

    const spent = await spentSeconds(db, [overlapped, apart], at(T0, 600))
    expect(spent.get(overlapped)).toBe(1.5 * HOUR)
    expect(spent.get(apart)).toBe(1.25 * HOUR)
  })

  it('HOURS-23 HOURS-26 each task follows the mode of its own workspace in the same call', async () => {
    await setMode('net')
    const grossWorkspace = randomUUID()
    const grossList = randomUUID()
    await db.insert(workspaces).values({ id: grossWorkspace, name: 'Other', timezone: 'America/Sao_Paulo', createdAt: T0 })
    await db.insert(lists).values({ id: grossList, workspaceId: grossWorkspace, name: 'Gross', color: 1, position: 0, createdByUserId: seed.userId, createdAt: T0 })
    const netTask = await seed.addTask({ estimate: 180 })
    const grossTask = await seed.addTask({ estimate: 180, listId: grossList })
    for (const taskId of [netTask, grossTask]) {
      await closed(taskId, 0, 60)
      await closed(taskId, 30, 90)
    }

    const spent = await spentMilliseconds(db, [netTask, grossTask], at(T0, 600))
    expect(spent.get(netTask)).toBe(1.5 * HOUR * 1000)
    expect(spent.get(grossTask)).toBe(2 * HOUR * 1000)
  })

  it('HOURS-23 leaves breaks out of the time spent in net', async () => {
    await setMode('net')
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 60)
    await seed.addSession({ kind: 'break', startedAt: at(T0, 30), endedAt: at(T0, 90), plannedSeconds: 3600, endReason: 'break_end' })

    expect(await spentOf(taskId)).toBe(1 * HOUR)
  })

  it('HOURS-24 the board card shows the net time spent', async () => {
    await setMode('net')
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 60)
    await closed(taskId, 30, 90)

    const board = await buildBoard(db, seed.listId, { id: seed.workspaceId, timezone: 'America/Sao_Paulo' }, seed.userId, at(T0, 600))
    expect(board.columns.today.tasks.find((task) => task.id === taskId)?.spent_seconds).toBe(1.5 * HOUR)
  })

  it('HOURS-25 a focus session opened after overlapping sessions ends when the net estimate is used up', async () => {
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 60)
    await closed(taskId, 30, 90)
    const start = async (minutes: number) => {
      await focus.startFocus(
        db,
        { userId: seed.userId, workspaceId: seed.workspaceId },
        { actionId: randomUUID(), occurredAt: at(T0, minutes), deviceId: 'A' },
        { taskId, takeover: false },
        at(T0, minutes),
      )
      const [open] = await db.select().from(focusSessions).where(eq(focusSessions.startedAt, at(T0, minutes)))
      return open!
    }

    await setMode('net')
    // 3h of estimate, 1h 30min spent net: 1h 30min left.
    expect((await start(120)).deadlineAt).toEqual(at(T0, 210))
  })

  it('HOURS-25 HOURS-26 the same focus session in gross ends after what is left of the summed time', async () => {
    const taskId = await seed.addTask({ estimate: 180 })
    await closed(taskId, 0, 60)
    await closed(taskId, 30, 90)

    await focus.startFocus(
      db,
      { userId: seed.userId, workspaceId: seed.workspaceId },
      { actionId: randomUUID(), occurredAt: at(T0, 120), deviceId: 'A' },
      { taskId, takeover: false },
      at(T0, 120),
    )
    const [open] = await db.select().from(focusSessions).where(eq(focusSessions.startedAt, at(T0, 120)))
    // 3h of estimate, 2h spent gross: 1h left.
    expect(open!.deadlineAt).toEqual(at(T0, 180))
  })

  it('HOURS-25 Estender follows the net time spent: 1h 30min of a 1h 40min estimate is refused in net, accepted in gross', async () => {
    const taskId = await seed.addTask({ estimate: 100 })
    await closed(taskId, 0, 60)
    // The last session ran out on the estimate, so Estender would be offered once the estimate is used up.
    await seed.addSession({ taskId, startedAt: at(T0, 30), endedAt: at(T0, 90), endReason: 'estimate' })
    const extend = (minutes: number) =>
      focus.extendFocus(
        db,
        { userId: seed.userId, workspaceId: seed.workspaceId },
        { actionId: randomUUID(), occurredAt: at(T0, minutes), deviceId: 'A' },
        { taskId },
        at(T0, minutes),
      )
    const openSessions = async () => (await db.select().from(focusSessions).where(eq(focusSessions.taskId, taskId))).filter((row) => row.endedAt === null)

    await setMode('net')
    // 1h 30min spent net of 1h 40min: the estimate is not used up, so there is nothing to extend.
    await expect(extend(120)).rejects.toThrow()
    expect(await openSessions()).toHaveLength(0)

    await setMode('gross')
    // 2h spent gross of 1h 40min: the estimate is used up and Estender opens a session without deadline.
    await extend(121)
    expect(await openSessions()).toEqual([expect.objectContaining({ startedAt: at(T0, 121), deadlineAt: null })])
  })
})
