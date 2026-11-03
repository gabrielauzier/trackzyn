import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import type { StoredFileRecord } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { FileNotFoundError } from '../ports/local-storage.ts'
import { UUID_PATTERN } from '../services/users.ts'
import { deleteFile, getFile, listFiles, quote, renameFile, uploadFile } from '../services/files.ts'

const fileReadSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  uploaded_by_user_id: z.string().nullable(),
  filename: z.string(),
  content_type: z.string(),
  size: z.number(),
  created_at: z.string(),
})

const fileParams = z.object({ file_id: z.string().regex(UUID_PATTERN, 'Input should be a valid UUID') })

function toFileRead(record: StoredFileRecord) {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    uploaded_by_user_id: record.uploadedByUserId,
    filename: record.filename,
    content_type: record.contentType,
    size: record.size,
    created_at: record.createdAt.toISOString(),
  }
}

export function fileRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]
    const writing = [...reading, requireWrite]

    typed.get(
      '/api/files',
      { schema: { response: { 200: z.array(fileReadSchema) } }, preValidation: reading },
      async (request) => (await listFiles(ctx.db, request.workspace.workspace.id)).map(toFileRead),
    )

    typed.post(
      '/api/files',
      { schema: { response: { 201: fileReadSchema } }, preValidation: writing },
      async (request, reply) => {
        const part = request.isMultipart() ? await request.file() : undefined
        if (!part || part.fieldname !== 'file') {
          throw new HttpError(422, [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required' }])
        }
        const data = await part.toBuffer()
        if (part.file.truncated) {
          throw new HttpError(400, `File too large. Maximum size is ${ctx.config.storageMaxFileSizeMb} MB.`)
        }
        const record = await uploadFile(ctx.db, ctx.storage, ctx.config, {
          workspaceId: request.workspace.workspace.id,
          userId: request.workspace.user.id,
          filename: part.filename || 'unnamed',
          contentType: part.mimetype || 'application/octet-stream',
          data,
        })
        return reply.code(201).send(toFileRead(record))
      },
    )

    typed.get(
      '/api/files/:file_id/download',
      { schema: { params: fileParams }, preValidation: reading },
      async (request, reply) => {
        const record = await getFile(ctx.db, request.params.file_id.toLowerCase(), request.workspace.workspace.id)
        let data: Buffer
        try {
          data = await ctx.storage.download(record.storageKey)
        } catch (error) {
          if (error instanceof FileNotFoundError) throw new HttpError(404, 'File not found')
          throw error
        }
        return reply
          .header('content-disposition', `inline; filename*=UTF-8''${quote(record.filename)}`)
          .type(record.contentType)
          .send(data)
      },
    )

    typed.patch(
      '/api/files/:file_id',
      {
        schema: {
          params: fileParams,
          body: z.object({ filename: z.string().min(1).max(255) }),
          response: { 200: fileReadSchema },
        },
        preValidation: writing,
      },
      async (request) =>
        toFileRead(
          await renameFile(
            ctx.db,
            request.params.file_id.toLowerCase(),
            request.workspace.workspace.id,
            request.body.filename,
          ),
        ),
    )

    typed.delete(
      '/api/files/:file_id',
      { schema: { params: fileParams }, preValidation: writing },
      async (request, reply) => {
        await deleteFile(ctx.db, ctx.storage, request.params.file_id.toLowerCase(), request.workspace.workspace.id)
        return reply.code(204).send()
      },
    )
  }
}
