import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { CARD_FIELDS } from '../db/schema.ts'
import { authGuards } from '../plugins/auth.ts'
import { workspaceContext } from '../plugins/workspace.ts'
import { getCardFields, setCardFields } from '../services/card-fields.ts'
import { getList } from '../services/lists.ts'
import { listParams } from './lists.ts'

/** The card fields hidden on a list for the reader; an empty list means every field is on (FIELDS-03). */
const cardFieldsSchema = z.object({ hidden: z.array(z.enum(CARD_FIELDS)) })

export function cardFieldRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    // Any member chooses what their own cards show, a viewer too. Closed to tokens (AD-007).
    const reading = [requireUser, workspaceContext(ctx)]

    typed.get(
      '/api/lists/:list_id/card-fields',
      { schema: { params: listParams, response: { 200: cardFieldsSchema } }, preValidation: reading },
      async (request) => {
        const list = await getList(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace.id)
        return { hidden: await getCardFields(ctx.db, request.workspace.user.id, list.id) }
      },
    )

    typed.put(
      '/api/lists/:list_id/card-fields',
      { schema: { params: listParams, body: cardFieldsSchema, response: { 200: cardFieldsSchema } }, preValidation: reading },
      async (request) => {
        const list = await getList(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace.id)
        return { hidden: await setCardFields(ctx.db, request.workspace.user.id, list.id, request.body.hidden) }
      },
    )
  }
}
