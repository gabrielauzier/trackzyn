import type { FastifyInstance, FastifyRequest, preValidationAsyncHookHandler } from 'fastify'
import type { AppContext } from '../context.ts'
import type { User } from '../db/schema.ts'
import { forbidden, unauthorized } from '../http/http-error.ts'
import type { TokenPrincipal } from '../services/access-tokens.ts'
import { readAccessToken } from '../services/tokens.ts'
import { UUID_PATTERN, getUserById } from '../services/users.ts'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `requireUser` and `requireSuperuser` guards. */
    user: User
    /** Set by the token hook when the request carries a valid `tkz_` token. */
    tokenPrincipal: TokenPrincipal | null
  }
}

export function decorateRequest(app: FastifyInstance): void {
  app.decorateRequest('user', undefined as never)
  app.decorateRequest('tokenPrincipal', null)
}

export function authGuards(ctx: AppContext) {
  async function activeUserFrom(request: FastifyRequest): Promise<User | null> {
    const header = request.headers.authorization
    if (!header) return null
    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null

    const id = await readAccessToken(ctx.config, token)
    if (!id || !UUID_PATTERN.test(id)) return null
    const user = await getUserById(ctx.db, id)
    return user && user.isActive ? user : null
  }

  /** `current_active_user`: 401 without a valid token for an active user. */
  const requireUser: preValidationAsyncHookHandler = async (request) => {
    if (request.tokenPrincipal) {
      request.user = request.tokenPrincipal.user
      return
    }
    const user = await activeUserFrom(request)
    if (!user) throw unauthorized()
    request.user = user
  }

  /** `current_superuser`: 401 as above, 403 for a user who is not a superuser. */
  const requireSuperuser: preValidationAsyncHookHandler = async (request) => {
    // No admin route declares a scope, so the token hook stops them first; this is the second line of defence.
    if (request.tokenPrincipal) throw forbidden()
    const user = await activeUserFrom(request)
    if (!user) throw unauthorized()
    if (!user.isSuperuser) throw forbidden()
    request.user = user
  }

  return { requireUser, requireSuperuser }
}
