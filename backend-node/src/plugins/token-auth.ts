import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify'
import type { AppContext } from '../context.ts'
import { HttpError, forbidden } from '../http/http-error.ts'
import { type TokenPrincipal, type TokenScope, authenticate, recordTokenUse } from '../services/access-tokens.ts'

declare module 'fastify' {
  interface FastifyContextConfig {
    /** What a token needs to call this route; a route without it answers 403 to every token. */
    tokenScope?: TokenScope | 'any'
  }
}

const RATE_LIMIT = { maxRequests: 60, windowSeconds: 60 }

function tokenFrom(header: string | undefined): string | null {
  const [scheme, value] = (header ?? '').split(' ')
  return scheme?.toLowerCase() === 'bearer' && value?.startsWith('tkz_') ? value : null
}

function deniedBy(principal: TokenPrincipal, method: string, scope: TokenScope | 'any' | undefined): string | null {
  // Fastify copies a GET route's config to the HEAD route it generates, and HEAD is not in the scope table.
  if (method === 'HEAD' || !scope) return 'Route not available for tokens'
  if (scope !== 'any' && !principal.scopes.includes(scope)) return `Missing scope: ${scope}`
  return null
}

/** A route only a token may call: the session JWT skips the hook below, so it stops here (MCP-08). */
export const requireToken: onRequestAsyncHookHandler = async (request) => {
  if (!request.tokenPrincipal) throw new HttpError(401, 'Unauthorized', { 'WWW-Authenticate': 'Bearer' })
  request.user = request.tokenPrincipal.user
}

/**
 * Every request with `Authorization: Bearer tkz_...`: authenticates it, applies the per-token limit
 * and denies any route that does not declare `config.tokenScope` (AD-007). Any other request passes
 * untouched, so the session JWT takes none of these steps (SCOPE-10).
 */
export function registerTokenAuth(app: FastifyInstance, ctx: AppContext): void {
  app.addHook('onRequest', async (request, reply) => {
    const token = tokenFrom(request.headers.authorization)
    if (!token) return

    const now = new Date()
    const principal = await authenticate(ctx.db, token, now)
    if (!principal) throw new HttpError(401, 'Unauthorized', { 'WWW-Authenticate': 'Bearer' })

    // `reply.log` writes the "request completed" line.
    request.log = request.log.child({ token_id: principal.tokenId, user_id: principal.user.id })
    reply.log = request.log

    const count = await ctx.keyValueStore.rateLimitHit(`rate_limit:token:${principal.tokenId}`, now.getTime() / 1000, RATE_LIMIT.windowSeconds)
    if (count >= RATE_LIMIT.maxRequests) {
      throw new HttpError(429, 'Too many requests', { 'Retry-After': String(RATE_LIMIT.windowSeconds) })
    }

    await recordTokenUse(ctx.db, principal, now)
    request.tokenPrincipal = principal

    if (request.is404) return
    const denied = deniedBy(principal, request.method, request.routeOptions.config.tokenScope)
    if (denied) throw forbidden(denied)
  })
}
