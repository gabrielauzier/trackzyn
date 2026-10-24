import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { focusActions } from '../../src/db/schema.ts'
import { settle, spentSeconds } from '../../src/services/focus-settle.ts'
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

describe('settle', () => {
  it('FOCUS-11 closes a task session exactly at its deadline, with estimate, also when settled 2h later', async () => {
    const taskId = await seed.addTask({ estimate: 30 })
    const id = await seed.addSession({ taskId, startedAt: T0, deadlineAt: at(T0, 30) })

    await settle(db, seed.userId, at(T0, 150))

    const row = await seed.session(id)
    expect(row.endedAt).toEqual(at(T0, 30))
    expect(row.endReason).toBe('estimate')
  })

  it('BREAK-05 closes a break exactly at its deadline, with break_end, also when settled 2h later', async () => {
    const id = await seed.addSession({ kind: 'break', startedAt: T0, plannedSeconds: 300, deadlineAt: at(T0, 5) })

    await settle(db, seed.userId, at(T0, 125))

    const row = await seed.session(id)
    expect(row.endedAt).toEqual(at(T0, 5))
    expect(row.endReason).toBe('break_end')
  })

  it('FOCUS-10 closes a session whose deadline is exactly now', async () => {
    const taskId = await seed.addTask({ estimate: 30 })
    const id = await seed.addSession({ taskId, startedAt: T0, deadlineAt: at(T0, 30) })

    await settle(db, seed.userId, at(T0, 30))

    expect((await seed.session(id)).endedAt).toEqual(at(T0, 30))
  })

  it('keeps open a session with a deadline in the future', async () => {
    const taskId = await seed.addTask({ estimate: 30 })
    const id = await seed.addSession({ taskId, startedAt: T0, deadlineAt: at(T0, 30) })

    await settle(db, seed.userId, at(T0, 29, 59))

    const row = await seed.session(id)
    expect(row.endedAt).toBeNull()
    expect(row.endReason).toBeNull()
  })

  it('FOCUS-14 keeps open a session without a deadline', async () => {
    const taskId = await seed.addTask({ estimate: null })
    const id = await seed.addSession({ taskId, startedAt: T0 })

    await settle(db, seed.userId, at(T0, 600))

    expect((await seed.session(id)).endedAt).toBeNull()
  })

  it('settles only the given user', async () => {
    const other = await seed.addUser()
    const taskId = await seed.addTask({ estimate: 30 })
    const id = await seed.addSession({ userId: other, taskId, startedAt: T0, deadlineAt: at(T0, 30) })

    await settle(db, seed.userId, at(T0, 60))

    expect((await seed.session(id)).endedAt).toBeNull()
  })

  it('AD-002 forgets the user actions applied more than 24h ago and keeps the newer ones', async () => {
    const other = await seed.addUser()
    const old = randomUUID()
    const recent = randomUUID()
    const othersOld = randomUUID()
    await db.insert(focusActions).values([
      { actionId: old, userId: seed.userId, appliedAt: at(T0, -24 * 60, -1), response: {} },
      { actionId: recent, userId: seed.userId, appliedAt: at(T0, -24 * 60, 1), response: {} },
      { actionId: othersOld, userId: other, appliedAt: at(T0, -24 * 60, -1), response: {} },
    ])

    await settle(db, seed.userId, T0)

    const left = (await db.select({ id: focusActions.actionId }).from(focusActions)).map((row) => row.id).sort()
    expect(left).toEqual([recent, othersOld].sort())
  })
})

describe('spentSeconds', () => {
  it('sums the closed task sessions and the open one up to now, and leaves breaks out', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    const otherTask = await seed.addTask({ estimate: 60 })
    await seed.addSession({ taskId, startedAt: T0, endedAt: at(T0, 10) })
    await seed.addSession({ kind: 'break', startedAt: at(T0, 10), endedAt: at(T0, 15), plannedSeconds: 300, endReason: 'break_end' })
    await seed.addSession({ taskId, startedAt: at(T0, 15), deadlineAt: at(T0, 65) })

    const spent = await spentSeconds(db, [taskId, otherTask], at(T0, 20, 30))

    expect(spent.get(taskId)).toBe(10 * 60 + 5 * 60 + 30)
    expect(spent.has(otherTask)).toBe(false)
  })

  it('FOCUS-11 counts an unsettled open session only up to its deadline', async () => {
    const taskId = await seed.addTask({ estimate: 30 })
    await seed.addSession({ taskId, startedAt: T0, deadlineAt: at(T0, 30) })

    expect((await spentSeconds(db, [taskId], at(T0, 120))).get(taskId)).toBe(30 * 60)
  })

  it('sums the sessions of every user on the task', async () => {
    const other = await seed.addUser()
    const taskId = await seed.addTask({ estimate: 60 })
    await seed.addSession({ taskId, startedAt: T0, endedAt: at(T0, 10) })
    await seed.addSession({ userId: other, taskId, startedAt: T0, endedAt: at(T0, 7) })

    expect((await spentSeconds(db, [taskId], at(T0, 30))).get(taskId)).toBe(17 * 60)
  })

  it('answers an empty map for no tasks', async () => {
    expect((await spentSeconds(db, [], T0)).size).toBe(0)
  })
})
