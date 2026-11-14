import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { INBOX_SOURCES } from '../db/schema.ts'
import { authGuards } from '../plugins/auth.ts'
import { type WorkspaceContext, canWrite, workspaceContext } from '../plugins/workspace.ts'
import { dayTimezone } from '../services/day.ts'
import { decisionSchema } from '../services/decision.ts'
import {
  type InboxItemView,
  type InboxOwner,
  type SendResult,
  captureItem,
  commitDrafts,
  countCurrent,
  discardItem,
  listItems,
  restoreItem,
  sendItem,
  updateItem,
} from '../services/inbox.ts'
import { UUID_PATTERN } from '../services/users.ts'
import { groupReadSchema, toGroupRead } from './groups.ts'
import { withoutNul } from './schemas.ts'
import { taskReadSchema, toTaskRead } from './tasks.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')
const itemParams = z.object({ item_id: uuid })

export const inboxItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.enum(INBOX_SOURCES),
  created_via: z.string().nullable(),
  list_id: z.string().nullable(),
  estimate_minutes: z.number().nullable(),
  draft: z.record(z.string(), z.unknown()).nullable(),
  discarded_at: z.string().nullable(),
  created_at: z.string(),
})

export function toInboxItemRead(item: InboxItemView) {
  return {
    id: item.id,
    text: item.text,
    source: item.source,
    created_via: item.createdVia,
    list_id: item.listId,
    estimate_minutes: item.estimateMinutes,
    draft: item.draft,
    discarded_at: item.discardedAt?.toISOString() ?? null,
    created_at: item.createdAt.toISOString(),
  }
}

/** What a sent item became: the tasks created, and the group when it became one. */
const sendResultSchema = z.object({ tasks: z.array(taskReadSchema), group: groupReadSchema.nullable() })

function toSendResultRead(result: SendResult) {
  return { tasks: result.tasks.map(toTaskRead), group: result.group && toGroupRead(result.group) }
}

/** The inbox of the caller in the workspace of the request (EDGE-07). */
export const ownerOf = (context: WorkspaceContext): InboxOwner => ({ workspaceId: context.workspace.id, userId: context.user.id })

export function inboxRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    // Every member has an inbox, a viewer too; sending checks the writing on the list (Assumptions).
    const reading = [requireUser, workspaceContext(ctx)]

    typed.post(
      '/api/inbox',
      {
        schema: {
          // The length is checked after trimming, in the service (CAP-02, CAP-03).
          body: z.object({ text: withoutNul(z.string()), source: z.enum(['app', 'desktop']).default('app') }),
          response: { 201: inboxItemSchema },
        },
        // The only inbox route open to tokens (CAP-09, AD-007): they capture, they do not read nor process.
        config: { tokenScope: 'inbox:create' },
        preValidation: reading,
      },
      async (request, reply) => {
        const principal = request.tokenPrincipal
        // A token's item comes from the API, whatever the body says.
        const origin = principal ? { source: 'api' as const, tokenId: principal.tokenId } : { source: request.body.source }
        const item = await captureItem(ctx.db, ownerOf(request.workspace), { text: request.body.text, ...origin })
        return reply.code(201).send(toInboxItemRead(item))
      },
    )

    typed.get(
      '/api/inbox',
      {
        schema: {
          querystring: z.object({ tab: z.enum(['current', 'trash']).default('current') }),
          response: { 200: z.object({ timezone: z.string(), items: z.array(inboxItemSchema) }) },
        },
        preValidation: reading,
      },
      async (request) => ({
        // The age of each item is told in the workspace's timezone (INBOX-02, AD-004).
        timezone: await dayTimezone(ctx.db, request.workspace.workspace),
        items: (await listItems(ctx.db, ownerOf(request.workspace), request.query.tab)).map(toInboxItemRead),
      }),
    )

    typed.get(
      '/api/inbox/count',
      { schema: { response: { 200: z.object({ count: z.number() }) } }, preValidation: reading },
      async (request) => ({ count: await countCurrent(ctx.db, ownerOf(request.workspace)) }),
    )

    typed.patch(
      '/api/inbox/:item_id',
      {
        schema: {
          params: itemParams,
          body: z.object({
            list_id: uuid.nullable().optional(),
            // A row estimate is HH:MM from 00:01 to 24:00 (QUICK-05).
            estimate_minutes: z.number().int().min(1).max(1440).nullable().optional(),
            draft: decisionSchema.nullable().optional(),
          }),
          response: { 200: inboxItemSchema },
        },
        preValidation: reading,
      },
      async (request) => {
        const { list_id, estimate_minutes, draft } = request.body
        const item = await updateItem(ctx.db, ownerOf(request.workspace), request.params.item_id.toLowerCase(), {
          listId: list_id?.toLowerCase() ?? list_id,
          estimateMinutes: estimate_minutes,
          draft,
        })
        return toInboxItemRead(item)
      },
    )

    typed.post(
      '/api/inbox/:item_id/discard',
      { schema: { params: itemParams, response: { 200: inboxItemSchema } }, preValidation: reading },
      async (request) => toInboxItemRead(await discardItem(ctx.db, ownerOf(request.workspace), request.params.item_id.toLowerCase())),
    )

    typed.post(
      '/api/inbox/:item_id/restore',
      { schema: { params: itemParams, response: { 200: inboxItemSchema } }, preValidation: reading },
      async (request) => toInboxItemRead(await restoreItem(ctx.db, ownerOf(request.workspace), request.params.item_id.toLowerCase())),
    )
    typed.post(
      '/api/inbox/:item_id/send',
      {
        schema: {
          params: itemParams,
          body: z.object({ decision: decisionSchema }),
          response: { 200: sendResultSchema },
        },
        preValidation: reading,
      },
      async (request) => {
        const sender = { ...ownerOf(request.workspace), canWrite: canWrite(request.workspace.member.role) }
        return toSendResultRead(await sendItem(ctx.db, sender, request.params.item_id.toLowerCase(), request.body.decision))
      },
    )
    typed.post(
      '/api/inbox/commit',
      {
        schema: {
          // The items the review shows; left out, or with no body, every draft is sent.
          body: z.object({ item_ids: z.array(uuid).max(1000).optional() }).nullish(),
          response: {
            200: z.object({ tasks: z.array(taskReadSchema), groups: z.array(groupReadSchema), discarded: z.array(z.string()) }),
          },
        },
        preValidation: reading,
      },
      async (request) => {
        const sender = { ...ownerOf(request.workspace), canWrite: canWrite(request.workspace.member.role) }
        const result = await commitDrafts(ctx.db, sender, request.body?.item_ids?.map((id) => id.toLowerCase()))
        return { tasks: result.tasks.map(toTaskRead), groups: result.groups.map(toGroupRead), discarded: result.discarded }
      },
    )
  }
}
