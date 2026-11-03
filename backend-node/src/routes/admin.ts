import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { HttpError } from '../http/http-error.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireLocalAuth } from '../plugins/policy.ts'
import { createAdminUser, deleteAdminUser, listUsers, toAdminUserRead, updateAdminUser } from '../services/admin.ts'
import {
  DATE_FORMATS,
  NUMBER_FORMATS,
  deleteAppSetting,
  getAppSetting,
  getDateFormat,
  getNumberFormat,
  isRegistrationEnabled,
  setAppSetting,
} from '../services/settings.ts'
import {
  applicationTimezone,
  environmentTimezone,
  isValidTimezone,
  savedTimezoneName,
  timezoneNames,
} from '../services/timezones.ts'
import { UUID_PATTERN, getUserById } from '../services/users.ts'

const ALLOWED_SETTINGS = new Set([
  'registration_enabled',
  'theme_color_light',
  'theme_color_dark',
  'number_format',
  'date_format',
  'timezone',
])

const SETTING_CHOICES: Record<string, string[]> = {
  registration_enabled: ['true', 'false'],
  number_format: NUMBER_FORMATS,
  date_format: DATE_FORMATS,
}

const adminUserRead = z.object({
  id: z.string(),
  email: z.string(),
  is_active: z.boolean(),
  is_superuser: z.boolean(),
  is_verified: z.boolean(),
  preferences: z.record(z.string(), z.unknown()).nullable(),
})

const userParams = z.object({ user_id: z.string().regex(UUID_PATTERN, 'Input should be a valid UUID') })
const settingParams = z.object({ key: z.string() })
const settingRead = z.object({ key: z.string(), value: z.string() })

const adminUserCreateBody = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
  is_superuser: z.boolean().default(false),
  preferences: z.record(z.string(), z.unknown()).nullish(),
})

const adminUserUpdateBody = z.object({
  email: z.email().nullish(),
  password: z.string().min(8).max(72).nullish(),
  is_active: z.boolean().nullish(),
  is_superuser: z.boolean().nullish(),
  preferences: z.record(z.string(), z.unknown()).nullish(),
})

/** A Python `set` literal, which is what the original puts in its message. */
function pythonSet(values: string[]): string {
  return `{${values.map((value) => `'${value}'`).join(', ')}}`
}

export function adminRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser, requireSuperuser } = authGuards(ctx)

    // `get_user` of the Python router: a plain 404 once the administrator is known.
    const targetUser = async (id: string) => {
      const user = await getUserById(ctx.db, id.toLowerCase())
      if (!user) throw new HttpError(404, 'User not found')
      return user
    }

    typed.get(
      '/api/admin/users',
      {
        schema: {
          querystring: z.object({
            search: z.string().optional(),
            page: z.coerce.number().int().min(1).default(1),
            limit: z.coerce.number().int().min(1).max(100).default(50),
          }),
          response: { 200: z.object({ items: z.array(adminUserRead), total: z.number() }) },
        },
        preValidation: [requireSuperuser],
      },
      async (request) => {
        const { items, total } = await listUsers(ctx.db, request.query.search, request.query.page, request.query.limit)
        return { items: items.map(toAdminUserRead), total }
      },
    )

    typed.post(
      '/api/admin/users',
      {
        schema: { body: adminUserCreateBody, response: { 201: adminUserRead } },
        preValidation: [requireLocalAuth(ctx), requireSuperuser],
      },
      async (request, reply) => {
        const body = request.body
        const user = await createAdminUser(ctx.db, {
          email: body.email,
          password: body.password,
          isSuperuser: body.is_superuser,
          preferences: body.preferences,
        })
        return reply.code(201).send(toAdminUserRead(user))
      },
    )

    typed.get(
      '/api/admin/users/:user_id',
      { schema: { params: userParams, response: { 200: adminUserRead } }, preValidation: [requireSuperuser] },
      async (request) => toAdminUserRead(await targetUser(request.params.user_id)),
    )

    // `require_local_auth_enabled` runs inside the handler, once the body is valid, like the original.
    typed.patch(
      '/api/admin/users/:user_id',
      {
        schema: { params: userParams, body: adminUserUpdateBody, response: { 200: adminUserRead } },
        preValidation: [requireSuperuser],
      },
      async (request) => {
        const body = request.body
        if (body.password != null && !ctx.config.localAuthEnabled) throw new HttpError(403, 'LOCAL_AUTH_DISABLED')
        const user = await targetUser(request.params.user_id)
        const updated = await updateAdminUser(
          ctx.db,
          user,
          {
            email: body.email,
            password: body.password,
            isActive: body.is_active,
            isSuperuser: body.is_superuser,
            preferences: body.preferences,
          },
          request.user.id,
        )
        return toAdminUserRead(updated)
      },
    )

    typed.delete(
      '/api/admin/users/:user_id',
      { schema: { params: userParams }, preValidation: [requireSuperuser] },
      async (request, reply) => {
        const user = await targetUser(request.params.user_id)
        await deleteAdminUser(ctx.db, user, request.user.id)
        return reply.code(204).send()
      },
    )

    typed.get(
      '/api/admin/settings/:key',
      { schema: { params: settingParams, response: { 200: settingRead } }, preValidation: [requireSuperuser] },
      async (request) => {
        const value = await getAppSetting(ctx.db, request.params.key)
        if (value === null) throw new HttpError(404, 'Setting not found')
        return { key: request.params.key, value }
      },
    )

    typed.patch(
      '/api/admin/settings/:key',
      {
        schema: { params: settingParams, body: z.object({ value: z.string() }), response: { 200: settingRead } },
        preValidation: [requireSuperuser],
      },
      async (request) => {
        const { key } = request.params
        const { value } = request.body
        if (!ALLOWED_SETTINGS.has(key)) throw new HttpError(400, `Setting '${key}' is not configurable`)
        if (key === 'timezone' && !isValidTimezone(value)) throw new HttpError(400, 'Invalid IANA timezone')
        const choices = SETTING_CHOICES[key]
        if (choices && !choices.includes(value)) {
          throw new HttpError(400, `Invalid value for '${key}'. Allowed: ${pythonSet(choices)}`)
        }
        if ((key === 'theme_color_light' || key === 'theme_color_dark') && !/^#[0-9A-Fa-f]{6}$/.test(value)) {
          throw new HttpError(400, `Invalid hex color code for '${key}'. Expected format: #RRGGBB`)
        }
        return setAppSetting(ctx.db, key, value)
      },
    )

    typed.delete(
      '/api/admin/settings/:key',
      { schema: { params: settingParams }, preValidation: [requireSuperuser] },
      async (request, reply) => {
        const { key } = request.params
        if (!ALLOWED_SETTINGS.has(key)) throw new HttpError(400, `Setting '${key}' is not configurable`)
        await deleteAppSetting(ctx.db, key)
        return reply.code(204).send()
      },
    )

    typed.get(
      '/api/admin/timezone',
      {
        schema: {
          response: {
            200: z.object({
              timezone: z.string(),
              saved: z.string().nullable(),
              fallback: z.string(),
              available: z.array(z.string()),
            }),
          },
        },
        preValidation: [requireSuperuser],
      },
      async () => ({
        timezone: await applicationTimezone(ctx.db),
        saved: await savedTimezoneName(ctx.db),
        fallback: environmentTimezone(),
        available: timezoneNames(),
      }),
    )

    typed.get(
      '/api/admin/registration-status',
      { schema: { response: { 200: z.object({ enabled: z.boolean() }) } } },
      async () => ({ enabled: await isRegistrationEnabled(ctx.db, ctx.config) }),
    )

    typed.get(
      '/api/admin/default-colors',
      { schema: { response: { 200: z.object({ light: z.string().nullable(), dark: z.string().nullable() }) } } },
      async () => ({
        light: await getAppSetting(ctx.db, 'theme_color_light'),
        dark: await getAppSetting(ctx.db, 'theme_color_dark'),
      }),
    )

    typed.get(
      '/api/admin/number-format',
      { schema: { response: { 200: z.object({ format: z.string() }) } }, preValidation: [requireUser] },
      async () => ({ format: await getNumberFormat(ctx.db) }),
    )

    typed.get(
      '/api/admin/date-format',
      { schema: { response: { 200: z.object({ format: z.string() }) } }, preValidation: [requireUser] },
      async () => ({ format: await getDateFormat(ctx.db) }),
    )
  }
}
