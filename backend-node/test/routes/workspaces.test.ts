import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '../../src/db/schema.ts'
import { type TestApp, bearer, createTestApp, freshIp, register, uniqueEmail } from '../support/test-app.ts'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(async () => {
  await t.close()
})

type User = Awaited<ReturnType<typeof register>>

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token: string, payload?: unknown, headers = {}) =>
  t.app.inject({ method, url, headers: { ...bearer(token), ...headers }, payload: payload as object })

async function shared(owner: User, roles: string[] = []) {
  const created = await call('POST', '/api/workspaces', owner.token, { name: 'Shared', self_membership: true })
  const members: User[] = []
  for (const role of roles) {
    const member = await register(t)
    const invited = await call('POST', `/api/workspaces/${created.json().id}/members`, owner.token, { email: member.email, role })
    expect(invited.statusCode).toBe(201)
    members.push(member)
  }
  return { id: created.json().id as string, members }
}

describe('workspace resolution', () => {
  it('answers 400, 404 and the default workspace like the Python backend', async () => {
    const user = await register(t)
    const current = (header?: string) =>
      call('GET', '/api/workspaces/current', user.token, undefined, header === undefined ? {} : { 'x-workspace-id': header })

    expect((await current('nope')).json()).toEqual({ detail: 'Invalid X-Workspace-Id' })
    expect((await current(randomUUID())).json()).toEqual({ detail: 'Workspace not found' })
    const fallback = await current()
    expect(fallback.json()).toMatchObject({ name: 'Personal', role: 'owner' })
  })

  it('treats a manager without a membership row as an owner and hides archived workspaces', async () => {
    const manager = await register(t)
    const created = await call('POST', '/api/workspaces', manager.token, { name: '  Managed  ' })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ name: 'Managed', role: 'manager', managed_by_user_id: manager.id })
    const id = created.json().id as string

    const renamed = await call('PATCH', `/api/workspaces/${id}`, manager.token, { name: 'Renamed', timezone: 'America/Sao_Paulo' })
    expect(renamed.json()).toMatchObject({ name: 'Renamed', timezone: 'America/Sao_Paulo', role: 'manager' })
    const badZone = await call('PATCH', `/api/workspaces/${id}`, manager.token, { timezone: 'Mars/Olympus' })
    expect(badZone.json()).toEqual({ detail: 'Invalid IANA timezone' })
    const cleared = await call('PATCH', `/api/workspaces/${id}`, manager.token, { timezone: null })
    expect(cleared.json().timezone).toBeNull()

    expect((await call('POST', `/api/workspaces/${id}/archive`, manager.token)).json()).toMatchObject({ is_archived: true })
    const gone = await call('GET', '/api/workspaces/current', manager.token, undefined, { 'x-workspace-id': id })
    expect(gone.statusCode).toBe(404)
  })
})

describe('minimum session length (#22)', () => {
  const minOf = async (id: string, token: string) =>
    (await call('GET', '/api/workspaces/current', token, undefined, { 'x-workspace-id': id })).json().min_session_minutes

  it('HIDE-02 reads null by default for the owner, an editor and a viewer, in the list and in current', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])
    for (const user of [owner, ...members]) {
      const current = await call('GET', '/api/workspaces/current', user.token, undefined, { 'x-workspace-id': id })
      expect(current.json()).toHaveProperty('min_session_minutes', null)
      const listed = (await call('GET', '/api/workspaces', user.token)).json() as Array<{ id: string; min_session_minutes: unknown }>
      expect(listed.find((workspace) => workspace.id === id)).toHaveProperty('min_session_minutes', null)
    }
  })

  it('HIDE-03 lets the owner set 5, keeps it on a PATCH without the field, and turns it off with null', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['viewer'])

    const set = await call('PATCH', `/api/workspaces/${id}`, owner.token, { min_session_minutes: 5 })
    expect(set.statusCode).toBe(200)
    expect(set.json().min_session_minutes).toBe(5)
    expect(await minOf(id, members[0]!.token)).toBe(5)

    const renamed = await call('PATCH', `/api/workspaces/${id}`, owner.token, { name: 'Renamed' })
    expect(renamed.json()).toMatchObject({ name: 'Renamed', min_session_minutes: 5 })

    for (const edge of [1, 60]) {
      expect((await call('PATCH', `/api/workspaces/${id}`, owner.token, { min_session_minutes: edge })).json().min_session_minutes).toBe(edge)
    }

    const off = await call('PATCH', `/api/workspaces/${id}`, owner.token, { min_session_minutes: null })
    expect(off.statusCode).toBe(200)
    expect(off.json().min_session_minutes).toBeNull()
    expect(await minOf(id, owner.token)).toBeNull()
  })

  it('HIDE-04 answers 422 to 0, 61, 1.5 and "5", and keeps the stored value', async () => {
    const owner = await register(t)
    const { id } = await shared(owner)
    await call('PATCH', `/api/workspaces/${id}`, owner.token, { min_session_minutes: 10 })

    for (const bad of [0, 61, 1.5, '5']) {
      const refused = await call('PATCH', `/api/workspaces/${id}`, owner.token, { min_session_minutes: bad })
      expect(refused.statusCode).toBe(422)
    }
    expect(await minOf(id, owner.token)).toBe(10)
  })

  it('HIDE-05 answers 403 to an editor and a viewer, keeps the value, and lets a manager set it', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])
    await call('PATCH', `/api/workspaces/${id}`, owner.token, { min_session_minutes: 10 })

    for (const member of members) {
      const refused = await call('PATCH', `/api/workspaces/${id}`, member.token, { min_session_minutes: 3 })
      expect(refused.statusCode).toBe(403)
    }
    expect(await minOf(id, owner.token)).toBe(10)

    const manager = await register(t)
    const managed = (await call('POST', '/api/workspaces', manager.token, { name: 'Managed' })).json().id as string
    const set = await call('PATCH', `/api/workspaces/${managed}`, manager.token, { min_session_minutes: 3 })
    expect(set.json()).toMatchObject({ role: 'manager', min_session_minutes: 3 })
  })
})

describe('join gap (#23)', () => {
  const gapOf = async (id: string, token: string) =>
    (await call('GET', '/api/workspaces/current', token, undefined, { 'x-workspace-id': id })).json().merge_gap_minutes

  it('MERGE-02 reads null by default for the owner, an editor and a viewer, in the list and in current', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])
    for (const user of [owner, ...members]) {
      const current = await call('GET', '/api/workspaces/current', user.token, undefined, { 'x-workspace-id': id })
      expect(current.json()).toHaveProperty('merge_gap_minutes', null)
      const listed = (await call('GET', '/api/workspaces', user.token)).json() as Array<{ id: string; merge_gap_minutes: unknown }>
      expect(listed.find((workspace) => workspace.id === id)).toHaveProperty('merge_gap_minutes', null)
    }
  })

  it('MERGE-03 lets the owner set 5, keeps it on a PATCH without the field, and turns it off with null', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['viewer'])

    const set = await call('PATCH', `/api/workspaces/${id}`, owner.token, { merge_gap_minutes: 5 })
    expect(set.statusCode).toBe(200)
    expect(set.json().merge_gap_minutes).toBe(5)
    expect(await gapOf(id, members[0]!.token)).toBe(5)

    const renamed = await call('PATCH', `/api/workspaces/${id}`, owner.token, { name: 'Renamed' })
    expect(renamed.json()).toMatchObject({ name: 'Renamed', merge_gap_minutes: 5 })

    for (const edge of [1, 60]) {
      expect((await call('PATCH', `/api/workspaces/${id}`, owner.token, { merge_gap_minutes: edge })).json().merge_gap_minutes).toBe(edge)
    }

    const off = await call('PATCH', `/api/workspaces/${id}`, owner.token, { merge_gap_minutes: null })
    expect(off.statusCode).toBe(200)
    expect(off.json().merge_gap_minutes).toBeNull()
    expect(await gapOf(id, owner.token)).toBeNull()
  })

  it('MERGE-04 answers 422 to 0, 61, 1.5 and "5", and keeps the stored value', async () => {
    const owner = await register(t)
    const { id } = await shared(owner)
    await call('PATCH', `/api/workspaces/${id}`, owner.token, { merge_gap_minutes: 10 })

    for (const bad of [0, 61, 1.5, '5']) {
      const refused = await call('PATCH', `/api/workspaces/${id}`, owner.token, { merge_gap_minutes: bad })
      expect(refused.statusCode).toBe(422)
    }
    expect(await gapOf(id, owner.token)).toBe(10)
  })

  it('MERGE-05 answers 403 to an editor and a viewer, keeps the value, and lets a manager set it', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])
    await call('PATCH', `/api/workspaces/${id}`, owner.token, { merge_gap_minutes: 10 })

    for (const member of members) {
      const refused = await call('PATCH', `/api/workspaces/${id}`, member.token, { merge_gap_minutes: 3 })
      expect(refused.statusCode).toBe(403)
    }
    expect(await gapOf(id, owner.token)).toBe(10)

    const manager = await register(t)
    const managed = (await call('POST', '/api/workspaces', manager.token, { name: 'Managed' })).json().id as string
    const set = await call('PATCH', `/api/workspaces/${managed}`, manager.token, { merge_gap_minutes: 3 })
    expect(set.json()).toMatchObject({ role: 'manager', merge_gap_minutes: 3 })
  })
})

describe('hours count mode (#42)', () => {
  const modeOf = async (id: string, token: string) =>
    (await call('GET', '/api/workspaces/current', token, undefined, { 'x-workspace-id': id })).json().hours_count_mode

  it('HOURS-02 reads gross by default in the list, in current and for every role', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])
    for (const user of [owner, ...members]) {
      const current = await call('GET', '/api/workspaces/current', user.token, undefined, { 'x-workspace-id': id })
      expect(current.json()).toHaveProperty('hours_count_mode', 'gross')
      const listed = (await call('GET', '/api/workspaces', user.token)).json() as Array<{ id: string; hours_count_mode: unknown }>
      expect(listed.find((workspace) => workspace.id === id)).toHaveProperty('hours_count_mode', 'gross')
    }
  })

  it('HOURS-03 lets the owner set net and back to gross, and keeps it on a PATCH without the field', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['viewer'])

    const set = await call('PATCH', `/api/workspaces/${id}`, owner.token, { hours_count_mode: 'net' })
    expect(set.statusCode).toBe(200)
    expect(set.json().hours_count_mode).toBe('net')
    expect(await modeOf(id, members[0]!.token)).toBe('net')

    const renamed = await call('PATCH', `/api/workspaces/${id}`, owner.token, { name: 'Renamed' })
    expect(renamed.json()).toMatchObject({ name: 'Renamed', hours_count_mode: 'net' })

    const back = await call('PATCH', `/api/workspaces/${id}`, owner.token, { hours_count_mode: 'gross' })
    expect(back.json().hours_count_mode).toBe('gross')
    expect(await modeOf(id, owner.token)).toBe('gross')
  })

  it('HOURS-04 answers 422 to null, "liquid", "NET" and 1, and keeps the stored value', async () => {
    const owner = await register(t)
    const { id } = await shared(owner)
    await call('PATCH', `/api/workspaces/${id}`, owner.token, { hours_count_mode: 'net' })

    for (const bad of [null, 'liquid', 'NET', 1]) {
      const refused = await call('PATCH', `/api/workspaces/${id}`, owner.token, { hours_count_mode: bad })
      expect(refused.statusCode).toBe(422)
    }
    expect(await modeOf(id, owner.token)).toBe('net')
  })

  it('HOURS-05 answers 403 to an editor and a viewer, keeps the value, and lets a manager set it', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])

    for (const member of members) {
      const refused = await call('PATCH', `/api/workspaces/${id}`, member.token, { hours_count_mode: 'net' })
      expect(refused.statusCode).toBe(403)
    }
    expect(await modeOf(id, owner.token)).toBe('gross')

    const manager = await register(t)
    const managed = (await call('POST', '/api/workspaces', manager.token, { name: 'Managed' })).json().id as string
    const set = await call('PATCH', `/api/workspaces/${managed}`, manager.token, { hours_count_mode: 'net' })
    expect(set.json()).toMatchObject({ role: 'manager', hours_count_mode: 'net' })
  })
})

describe('plan adherence cards', () => {
  const flagOf = async (id: string, token: string) =>
    (await call('GET', '/api/workspaces/current', token, undefined, { 'x-workspace-id': id })).json().plan_adherence_enabled

  it('reads false by default for the owner, an editor and a viewer, in the list and in current', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])
    for (const user of [owner, ...members]) {
      expect(await flagOf(id, user.token)).toBe(false)
      const listed = (await call('GET', '/api/workspaces', user.token)).json() as Array<{ id: string; plan_adherence_enabled: unknown }>
      expect(listed.find((workspace) => workspace.id === id)).toHaveProperty('plan_adherence_enabled', false)
    }
  })

  it('lets the owner turn it on, keeps it on a PATCH without the field, and turns it off', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['viewer'])

    const on = await call('PATCH', `/api/workspaces/${id}`, owner.token, { plan_adherence_enabled: true })
    expect(on.statusCode).toBe(200)
    expect(on.json().plan_adherence_enabled).toBe(true)
    expect(await flagOf(id, members[0]!.token)).toBe(true)

    const renamed = await call('PATCH', `/api/workspaces/${id}`, owner.token, { name: 'Renamed' })
    expect(renamed.json()).toMatchObject({ name: 'Renamed', plan_adherence_enabled: true })

    const off = await call('PATCH', `/api/workspaces/${id}`, owner.token, { plan_adherence_enabled: false })
    expect(off.json().plan_adherence_enabled).toBe(false)
    expect(await flagOf(id, owner.token)).toBe(false)
  })

  it('answers 422 to a value that is not a boolean, and 403 to an editor and a viewer, keeping the stored value', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor', 'viewer'])
    await call('PATCH', `/api/workspaces/${id}`, owner.token, { plan_adherence_enabled: true })

    for (const bad of ['true', 1, null]) {
      expect((await call('PATCH', `/api/workspaces/${id}`, owner.token, { plan_adherence_enabled: bad })).statusCode).toBe(422)
    }
    for (const member of members) {
      expect((await call('PATCH', `/api/workspaces/${id}`, member.token, { plan_adherence_enabled: false })).statusCode).toBe(403)
    }
    expect(await flagOf(id, owner.token)).toBe(true)
  })
})

describe('members', () => {
  it('lists, changes roles and removes members with the sole-owner protections', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['viewer'])
    const [guest] = members as [User]

    const listed = await call('GET', `/api/workspaces/${id}/members`, guest.token)
    expect(listed.json().map((m: { role: string }) => m.role)).toEqual(['owner', 'viewer'])

    const promoted = await call('PATCH', `/api/workspaces/${id}/members/${guest.id}`, owner.token, { role: 'editor' })
    expect(promoted.json()).toMatchObject({ user_id: guest.id, role: 'editor' })
    expect((await call('PATCH', `/api/workspaces/${id}/members/${guest.id}`, owner.token, { role: 'emperor' })).json()).toEqual({
      detail: 'Invalid role: emperor',
    })
    expect((await call('PATCH', `/api/workspaces/${id}/members/${owner.id}`, owner.token, { role: 'viewer' })).json()).toEqual({
      detail: 'Cannot demote the sole owner',
    })
    expect((await call('PATCH', `/api/workspaces/${id}/members/${randomUUID()}`, owner.token, { role: 'viewer' })).json()).toEqual({
      detail: 'Member not found',
    })

    expect((await call('DELETE', `/api/workspaces/${id}/members/${owner.id}`, guest.token)).json()).toEqual({
      detail: 'Only the owner can remove other members',
    })
    expect((await call('DELETE', `/api/workspaces/${id}/members/${owner.id}`, owner.token)).json()).toEqual({
      detail: 'Cannot remove the sole owner',
    })
    expect((await call('DELETE', `/api/workspaces/${id}/members/${guest.id}`, guest.token)).statusCode).toBe(204)
    expect((await call('DELETE', `/api/workspaces/${id}/members/${guest.id}`, owner.token)).json()).toEqual({
      detail: 'Member not found',
    })
  })

  it('invites existing and brand-new users, refuses unknown ones and duplicates', async () => {
    const owner = await register(t)
    const { id } = await shared(owner)
    const existing = await register(t)

    const added = await call('POST', `/api/workspaces/${id}/members`, owner.token, { email: existing.email })
    expect(added.json()).toMatchObject({ user_id: existing.id, role: 'editor' })
    const duplicate = await call('POST', `/api/workspaces/${id}/members`, owner.token, { email: existing.email })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toEqual({ detail: 'User is already a member' })

    const fresh = await call('POST', `/api/workspaces/${id}/members`, owner.token, {
      email: uniqueEmail(),
      password: 'a-long-enough-pass',
    })
    expect(fresh.statusCode).toBe(201)
    const unknown = await call('POST', `/api/workspaces/${id}/members`, owner.token, { email: uniqueEmail() })
    expect(unknown.json()).toEqual({ detail: 'User not found. Provide a password to create them.' })
    const badRole = await call('POST', `/api/workspaces/${id}/members`, owner.token, { email: existing.email, role: 'x' })
    expect(badRole.statusCode).toBe(400)
  })

  it('answers 403 Insufficient role to an editor on owner-only routes and counts in stats', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['editor'])
    const [editor] = members as [User]
    for (const reply of [
      await call('PATCH', `/api/workspaces/${id}`, editor.token, { name: 'x' }),
      await call('POST', `/api/workspaces/${id}/archive`, editor.token),
      await call('POST', `/api/workspaces/${id}/members`, editor.token, { email: owner.email }),
    ]) {
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ detail: 'Insufficient role' })
    }
    expect((await call('GET', `/api/workspaces/${id}/stats`, editor.token)).json()).toEqual({ members: 2, files: 0 })
  })

  it('refuses to archive the last workspace and finds users by e-mail', async () => {
    const user = await register(t)
    const [personal] = (await call('GET', '/api/workspaces', user.token)).json()
    const last = await call('POST', `/api/workspaces/${personal.id}/archive`, user.token)
    expect(last.json()).toEqual({ detail: 'Cannot archive your last workspace' })

    const other = await register(t)
    const found = await call('GET', `/api/users/lookup?email=${encodeURIComponent(other.email.toUpperCase())}`, user.token)
    expect(found.json()).toEqual({ id: other.id, email: other.email })
    expect((await call('GET', '/api/users/lookup?email=nobody@example.com', user.token)).statusCode).toBe(404)
    const directory = await call('GET', '/api/users/directory', user.token)
    expect(directory.json().map((u: { id: string }) => u.id)).toContain(other.id)
  })

  it('keeps a single row when two invites race for the same user', async () => {
    const owner = await register(t)
    const { id } = await shared(owner)
    const target = await register(t)
    const replies = await Promise.all(
      [1, 2].map(() => call('POST', `/api/workspaces/${id}/members`, owner.token, { email: target.email })),
    )
    expect(replies.map((r) => r.statusCode).sort()).toEqual([201, 409])
  })
})

describe('files', () => {
  // `/api/files` is for superusers only (#32); these tests promote the users they call it with.
  const promote = (...people: User[]) =>
    Promise.all(people.map((person) => t.ctx.db.update(users).set({ isSuperuser: true }).where(eq(users.id, person.id))))

  const upload = (token: string, workspaceId: string, name = 'notes.pdf', content = '%PDF-1.4') => {
    const boundary = `----t${freshIp()}`
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
      `Content-Type: application/pdf\r\n\r\n${content}\r\n--${boundary}--\r\n`
    return t.app.inject({
      method: 'POST',
      url: '/api/files',
      headers: { ...bearer(token), 'x-workspace-id': workspaceId, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
  }

  it('stores, lists, downloads, renames and deletes within the workspace and honours the write gate', async () => {
    const owner = await register(t)
    const { id, members } = await shared(owner, ['viewer'])
    const [viewer] = members as [User]
    await promote(owner, viewer)
    const headers = { 'x-workspace-id': id }

    const refused = await upload(viewer.token, id)
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ detail: 'Read-only role' })

    const created = await upload(owner.token, id, 'My Report (final).PDF')
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ filename: 'My_Report_final.pdf', content_type: 'application/pdf', size: 8, workspace_id: id })
    const fileId = created.json().id as string

    expect((await call('GET', '/api/files', viewer.token, undefined, headers)).json()).toHaveLength(1)
    const download = await call('GET', `/api/files/${fileId}/download`, viewer.token, undefined, headers)
    expect(download.statusCode).toBe(200)
    expect(download.headers['content-type']).toBe('application/pdf')
    expect(download.headers['content-disposition']).toBe("inline; filename*=UTF-8''My_Report_final.pdf")
    expect(download.body).toBe('%PDF-1.4')

    expect((await call('PATCH', `/api/files/${fileId}`, viewer.token, { filename: 'x.pdf' }, headers)).statusCode).toBe(403)
    const renamed = await call('PATCH', `/api/files/${fileId}`, owner.token, { filename: 'new name.txt' }, headers)
    expect(renamed.json().filename).toBe('new_name.pdf')
    expect((await call('GET', `/api/workspaces/${id}/stats`, owner.token)).json().files).toBe(1)

    expect((await call('DELETE', `/api/files/${fileId}`, owner.token, undefined, headers)).statusCode).toBe(204)
    const gone = await call('GET', `/api/files/${fileId}/download`, owner.token, undefined, headers)
    expect(gone.statusCode).toBe(404)
    expect(gone.json()).toEqual({ detail: 'File not found' })
  })

  it('validates the extension, the size and the multipart body', async () => {
    const owner = await register(t)
    await promote(owner)
    const { id } = await shared(owner)
    const badType = await upload(owner.token, id, 'run.exe')
    expect(badType.statusCode).toBe(400)
    expect(badType.json().detail).toMatch(/^File type '\.exe' is not allowed\. Allowed: /)

    const tooBig = await upload(owner.token, id, 'big.pdf', 'x'.repeat(11 * 1024 * 1024))
    expect(tooBig.statusCode).toBe(400)
    expect(tooBig.json()).toEqual({ detail: 'File too large. Maximum size is 10 MB.' })

    const notMultipart = await t.app.inject({
      method: 'POST',
      url: '/api/files',
      headers: { ...bearer(owner.token), 'x-workspace-id': id },
      payload: {},
    })
    expect(notMultipart.statusCode).toBe(422)
    expect(notMultipart.json().detail[0].loc).toEqual(['body', 'file'])
  })
})
