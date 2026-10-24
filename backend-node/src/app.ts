import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { AppContext } from './context.ts'
import { decorateRequest } from './plugins/auth.ts'
import { registerErrorHandling } from './plugins/errors.ts'
import { adminRoutes } from './routes/admin.ts'
import { authRoutes } from './routes/auth.ts'
import { fileRoutes } from './routes/files.ts'
import { healthRoutes } from './routes/health.ts'
import { infoRoutes } from './routes/info.ts'
import { oidcRoutes } from './routes/oidc.ts'
import { passkeyRoutes } from './routes/passkeys.ts'
import { setupRoutes } from './routes/setup.ts'
import { twoFactorRoutes } from './routes/two-factor.ts'
import { userRoutes } from './routes/users.ts'
import { workspaceRoutes } from './routes/workspaces.ts'

/** The one place the application is assembled: `server.ts` and the tests both call it. */
export async function buildApp(
  ctx: AppContext,
  options: FastifyServerOptions = {},
  /** Runs right after Fastify is created, before any plugin: global hooks added here see every request. */
  beforeRoutes?: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
  const app = Fastify({ ...options })
  beforeRoutes?.(app)
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(swagger, {
    openapi: { info: { title: ctx.config.appName, version: '0.1.0' } },
    transform: jsonSchemaTransform,
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

  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger())

  await app.ready()
  return app
}
