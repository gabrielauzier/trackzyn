import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { allowedExtensions } from '../services/files.ts'
import { applicationTimezone, timezoneNames } from '../services/timezones.ts'

export function infoRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)

    typed.get(
      '/api/info',
      {
        schema: {
          response: {
            200: z.object({
              app_name: z.string(),
              features: z.record(z.string(), z.unknown()),
              update_check_repo: z.string().nullable(),
            }),
          },
        },
      },
      async () => ({
        app_name: ctx.config.appName,
        features: {},
        update_check_repo: ctx.config.updateCheckRepo || null,
      }),
    )

    typed.get(
      '/api/timezones',
      { schema: { response: { 200: z.object({ default: z.string(), available: z.array(z.string()) }) } }, preValidation: [requireUser] },
      async () => ({ default: await applicationTimezone(ctx.db), available: timezoneNames() }),
    )

    typed.get(
      '/api/settings/files',
      {
        schema: {
          response: { 200: z.object({ allowed_extensions: z.array(z.string()), max_file_size_mb: z.number() }) },
        },
      },
      async () => ({
        allowed_extensions: allowedExtensions(ctx.config),
        max_file_size_mb: ctx.config.storageMaxFileSizeMb,
      }),
    )
  }
}
