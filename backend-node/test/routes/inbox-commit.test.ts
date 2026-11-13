import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, createTestApp } from '../support/test-app.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

async function setup() {
  const roles = await ownerViewerStranger(t)
  const { owner, workspaceId } = roles
  const newList = async (name: string) => (await call('POST', '/api/lists', owner.token, workspaceId, { name, color: 1 })).json().id as string
  const listId = await newList('Work')
  /** An item of the inbox, with `draft` saved as Processar tudo saves it. */
  const capture = async (text: string, draft?: object, token = owner.token) => {
    const id = (await call('POST', '/api/inbox', token, workspaceId, { text })).json().id as string
    if (draft) expect((await call('PATCH', `/api/inbox/${id}`, token, workspaceId, { draft })).statusCode).toBe(200)
    return id
  }
  const commit = (body?: object, token = owner.token) => call('POST', '/api/inbox/commit', token, workspaceId, body)
  const inbox = async (tab = 'current', token = owner.token) =>
    (await call('GET', `/api/inbox?tab=${tab}`, token, workspaceId)).json().items as Array<Record<string, unknown>>
  const backlog = async (list = listId) =>
    ((await call('GET', `/api/lists/${list}/board`, owner.token, workspaceId)).json().columns.backlog.tasks as Array<{ title: string }>).map(
      (card) => card.title,
    )
  return { ...roles, newList, listId, capture, commit, inbox, backlog }
}

describe('ALL-06 Confirmar e enviar', () => {
  it('a task, a discard and an item without draft: one task created, one item in the trash, one in Atuais', async () => {
    const { listId, capture, commit, inbox, backlog } = await setup()
    const task = await capture('DEV-1701', { type: 'task', list_id: listId, name: 'DEV-1701 deploy', estimate_minutes: 30 })
    const discarded = await capture('Ideia velha', { type: 'discard' })
    const skipped = await capture('Pulado')

    const reply = await commit({ item_ids: [task, discarded] })

    expect(reply.statusCode).toBe(200)
    expect(reply.json().tasks).toEqual([expect.objectContaining({ title: 'DEV-1701 deploy', estimate_minutes: 30, column: 'backlog' })])
    expect(reply.json().discarded).toEqual([discarded])
    expect(await backlog()).toEqual(['DEV-1701 deploy'])
    expect(await inbox('trash')).toEqual([expect.objectContaining({ id: discarded, draft: null })])
    expect((await inbox()).map((item) => item.id)).toEqual([skipped])
  })

  it('without a body, sends every draft, a group among them', async () => {
    const { listId, capture, commit, inbox } = await setup()
    await capture('Pipeline', { type: 'group', list_id: listId, tasks: [{ title: 'Mapear' }, { title: 'Testar' }] })
    await capture('Pagar o DAS', { type: 'reminder', list_id: listId })
    const reply = await commit()
    expect(reply.statusCode).toBe(200)
    expect(reply.json().groups).toEqual([expect.objectContaining({ name: 'Pipeline', list_id: listId })])
    expect(reply.json().tasks.map((task: { title: string; kind: string }) => [task.title, task.kind])).toEqual([
      ['Mapear', 'task'],
      ['Testar', 'task'],
      ['Pagar o DAS', 'reminder'],
    ])
    expect(await inbox()).toEqual([])
  })
})

describe('ALL-07, EDGE-02 an item that cannot be sent', () => {
  it('a draft with an archived list answers 409 with [{item_id, reason: "list_archived"}] and creates nothing', async () => {
    const { owner, workspaceId, newList, listId, capture, commit, inbox, backlog } = await setup()
    const archivedList = await newList('Arquivada')
    const fine = await capture('DEV-1701', { type: 'task', list_id: listId })
    const blocked = await capture('Antigo', { type: 'task', list_id: archivedList })
    const trashed = await capture('Ideia', { type: 'discard' })
    await call('PATCH', `/api/lists/${archivedList}`, owner.token, workspaceId, { is_archived: true })

    const reply = await commit({ item_ids: [fine, blocked, trashed] })

    expect(reply.statusCode).toBe(409)
    expect(reply.json().items).toEqual([{ item_id: blocked, reason: 'list_archived' }])
    expect(await backlog()).toEqual([])
    expect((await inbox()).map((item) => item.id)).toEqual([fine, blocked, trashed])
    expect(await inbox('trash')).toEqual([])
  })

  it('an item of the review already processed in another window answers 409 already_processed and sends nothing', async () => {
    const { owner, workspaceId, listId, capture, commit, inbox, backlog } = await setup()
    const fine = await capture('DEV-1701', { type: 'task', list_id: listId })
    const gone = await capture('Já enviado', { type: 'task', list_id: listId })
    const elsewhere = await call('POST', `/api/inbox/${gone}/send`, owner.token, workspaceId, { decision: { type: 'task', list_id: listId } })
    expect(elsewhere.statusCode).toBe(200)

    const reply = await commit({ item_ids: [fine, gone] })

    expect(reply.statusCode).toBe(409)
    expect(reply.json().items).toEqual([{ item_id: gone, reason: 'already_processed' }])
    expect(await backlog()).toEqual(['Já enviado'])
    expect((await inbox()).map((item) => item.id)).toEqual([fine])
  })

  it("a viewer's draft answers 409 list_read_only", async () => {
    const { viewer, listId, capture, commit } = await setup()
    const id = await capture('Ideia', { type: 'task', list_id: listId }, viewer.token)
    const reply = await commit({}, viewer.token)
    expect(reply.statusCode).toBe(409)
    expect(reply.json().items).toEqual([{ item_id: id, reason: 'list_read_only' }])
  })
})

describe('ALL-09 sending a drafted item on its own', () => {
  it('drops its draft: the next commit creates nothing more for it', async () => {
    const { owner, workspaceId, listId, capture, commit, backlog } = await setup()
    const id = await capture('DEV-1701', { type: 'task', list_id: listId, name: 'Do rascunho' })
    const sent = await call('POST', `/api/inbox/${id}/send`, owner.token, workspaceId, { decision: { type: 'task', list_id: listId, name: 'Avulso' } })
    expect(sent.statusCode).toBe(200)
    const reply = await commit()
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ tasks: [], groups: [], discarded: [] })
    expect(await backlog()).toEqual(['Avulso'])
  })
})
