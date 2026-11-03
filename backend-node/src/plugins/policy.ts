import type { preValidationAsyncHookHandler } from 'fastify'
import type { AppContext } from '../context.ts'
import { HttpError } from '../http/http-error.ts'
import { isRegistrationEnabled } from '../services/settings.ts'

/** `require_local_auth_enabled`: 403 LOCAL_AUTH_DISABLED while only OIDC logins are accepted. */
export function requireLocalAuth(ctx: AppContext): preValidationAsyncHookHandler {
  return async () => {
    if (!ctx.config.localAuthEnabled) throw new HttpError(403, 'LOCAL_AUTH_DISABLED')
  }
}

/** `check_registration_enabled`: the saved `registration_enabled` setting, else the environment. */
export function requireRegistrationEnabled(ctx: AppContext): preValidationAsyncHookHandler {
  return async () => {
    if (!(await isRegistrationEnabled(ctx.db, ctx.config))) {
      throw new HttpError(403, 'Registration is currently disabled')
    }
  }
}
