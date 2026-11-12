import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { AppContext } from './context.ts'
import { decorateRequest } from './plugins/auth.ts'
import { registerErrorHandling } from './plugins/errors.ts'
import { registerTokenAuth } from './plugins/token-auth.ts'
import { accessTokenRoutes } from './routes/access-tokens.ts'
import { adminRoutes } from './routes/admin.ts'
import { authRoutes } from './routes/auth.ts'
import { boardRoutes } from './routes/board.ts'
import { fileRoutes } from './routes/files.ts'
import { focusRoutes } from './routes/focus.ts'
import { healthRoutes } from './routes/health.ts'
import { infoRoutes } from './routes/info.ts'
import { listRoutes } from './routes/lists.ts'
import { mcpRoutes } from './routes/mcp.ts'
import { oidcRoutes } from './routes/oidc.ts'
import { passkeyRoutes } from './routes/passkeys.ts'
import { planRoutes } from './routes/plans.ts'
import { reportRoutes } from './routes/reports.ts'
import { scheduledRoutes } from './routes/scheduled.ts'
import { sessionRoutes } from './routes/sessions.ts'
import { setupRoutes } from './routes/setup.ts'
import { taskRoutes } from './routes/tasks.ts'
import { todayRoutes } from './routes/today.ts'
import { twoFactorRoutes } from './routes/two-factor.ts'
import { userRoutes } from './routes/users.ts'
import { workspaceRoutes } from './routes/workspaces.ts'

/** The one place the application is assembled: `server.ts` and the tests both call it. */
export async function buildApp(
  ctx: AppContext,
  options: FastifyServerOptions = {},
  /** Runs right after Fastify is created, before any plugin: global hooks added here see every request. */
  beforeRoutes?: (app: FastifyInstance) => void,
  /** Runs after every route: a route added here gets the same hooks and error handling as the others. */
  afterRoutes?: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
  const app = Fastify({ ...options })
  beforeRoutes?.(app)
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(swagger, {
    openapi: {
      info: { title: ctx.config.appName, version: '0.1.0' },
      components: { securitySchemes: { personalAccessToken: { type: 'http', scheme: 'bearer', bearerFormat: 'tkz_...' } } },
    },
    transform: (input) => {
      const transformed = jsonSchemaTransform(input)
      const scope = input.route.config?.tokenScope
      if (!scope) return transformed
      return {
        ...transformed,
        schema: { ...transformed.schema, security: [{ personalAccessToken: [] }], description: `Requires the token scope \`${scope}\`.` },
      }
    },
  })
  await app.register(formbody)
  // One byte over the limit marks the file as truncated, which the upload route reports as too large.
  await app.register(multipart, { limits: { fileSize: (ctx.config.storageMaxFileSizeMb + 1) * 1024 * 1024, files: 1 } })
  await app.register(cors, {
    origin: [ctx.config.frontendUrl],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  })

  decorateRequest(app)
  registerErrorHandling(app)
  if (ctx.config.personalTokensEnabled) registerTokenAuth(app, ctx)

  await app.register(healthRoutes)
  await app.register(adminRoutes(ctx))
  await app.register(authRoutes(ctx))
  await app.register(infoRoutes(ctx))
  await app.register(twoFactorRoutes(ctx))
  await app.register(passkeyRoutes(ctx))
  await app.register(oidcRoutes(ctx))
  await app.register(fileRoutes(ctx))
  await app.register(userRoutes(ctx))
  await app.register(setupRoutes(ctx))
  await app.register(workspaceRoutes(ctx))
  await app.register(listRoutes(ctx))
  await app.register(taskRoutes(ctx))
  await app.register(boardRoutes(ctx))
  await app.register(focusRoutes(ctx))
  await app.register(reportRoutes(ctx))
  await app.register(sessionRoutes(ctx))
  await app.register(scheduledRoutes(ctx))
  await app.register(planRoutes(ctx))
  await app.register(todayRoutes(ctx))
  if (ctx.config.personalTokensEnabled) await app.register(accessTokenRoutes(ctx))
  if (ctx.config.personalTokensEnabled) await app.register(mcpRoutes(ctx))

  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger())
  afterRoutes?.(app)

  await app.ready()
  return app
}
