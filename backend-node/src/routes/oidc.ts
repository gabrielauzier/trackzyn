import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { type JWK, decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { type User, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { writeAccessToken } from '../services/tokens.ts'
import { tokenUrlsafe } from '../services/two-factor.ts'
import { DEFAULT_PREFERENCES, UserAlreadyExists, createUser, getUserByEmail } from '../services/users.ts'
import { isRegistrationEnabled } from '../services/settings.ts'
import { WORKSPACE_ROLES, createPersonalWorkspaceForUser, findPersonalMembership } from '../services/workspaces.ts'
import { workspaceMembers } from '../db/schema.ts'

const OIDC_STATE_TTL_SECONDS = 600
const EXISTING_USER_LINK_MODES = ['disabled', 'verified_email', 'email']
const REQUEST_TIMEOUT_MS = 10_000
const DESKTOP_NONCE_MIN_LENGTH = 32
const DESKTOP_NONCE_MAX_LENGTH = 128
// base64url, what the app generates: keeps Python's len() and JS .length from disagreeing on non-ASCII.
const DESKTOP_NONCE_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${DESKTOP_NONCE_MIN_LENGTH},${DESKTOP_NONCE_MAX_LENGTH}}$`)

type Json = Record<string, unknown>

/** A call to the provider: a network error or a non-2xx status is not caught, and becomes a 500. */
async function providerJson(url: string, init: RequestInit = {}): Promise<Json> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`provider answered ${response.status} for ${url}`)
  return (await response.json()) as Json
}

function claimValues(payload: Json, claimName: string): Set<string> {
  let value: unknown = payload
  for (const part of claimName.split('.')) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) value = (value as Json)[part]
    else return new Set()
  }
  if (value === null || value === undefined) return new Set()
  if (typeof value === 'string') return new Set([value])
  if (Array.isArray(value)) return new Set(value.map(String))
  return new Set([String(value)])
}

function parseWorkspaceRoleMap(raw: string): Record<string, string> {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HttpError(500, 'OIDC_WORKSPACE_ROLE_MAP must be valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(500, 'OIDC_WORKSPACE_ROLE_MAP must be a JSON object')
  }
  const roleMap = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [String(k), String(v).toLowerCase()]))
  const invalid = [...new Set(Object.values(roleMap).filter((role) => !(WORKSPACE_ROLES as readonly string[]).includes(role)))].sort()
  if (invalid.length > 0) {
    throw new HttpError(500, `OIDC_WORKSPACE_ROLE_MAP contains invalid workspace roles: ${invalid.join(', ')}`)
  }
  return roleMap
}

const ROLE_RANK: Record<string, number> = { viewer: 1, editor: 2, owner: 3 }

function desiredWorkspaceRole(providerRoles: Set<string>, roleMap: Record<string, string>): string | null {
  const matches = [...providerRoles].filter((role) => role in roleMap).map((role) => roleMap[role] as string)
  if (matches.length === 0) return null
  return matches.reduce((best, role) => ((ROLE_RANK[role] ?? 0) > (ROLE_RANK[best] ?? 0) ? role : best))
}

/** The `at_hash` of an access token: the left half of its digest, base64url (OIDC Core 3.1.3.6). */
function atHash(accessToken: string, algorithm: string): string {
  const bits = /(\d{3})$/.exec(algorithm)?.[1] ?? '256'
  const digest = createHash(`sha${bits}`).update(accessToken).digest()
  return digest.subarray(0, digest.length / 2).toString('base64url')
}

export function oidcRoutes(ctx: AppContext) {
  const { config } = ctx

  const redirectUri = () => config.oidcRedirectUri || `${config.frontendUrl.replace(/\/+$/, '')}/api/auth/oidc/callback`

  async function discover(): Promise<Json> {
    if (!config.oidcEnabled) throw new HttpError(404, 'OIDC login is not enabled')
    if (!config.oidcDiscoveryUrl) throw new HttpError(500, 'OIDC_DISCOVERY_URL is required')
    return providerJson(config.oidcDiscoveryUrl)
  }

  async function exchangeCode(discovery: Json, code: string, codeVerifier: string): Promise<Json> {
    const tokenEndpoint = discovery.token_endpoint
    if (!tokenEndpoint) throw new HttpError(500, 'OIDC discovery is missing token_endpoint')
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.oidcClientId,
      client_secret: config.oidcClientSecret,
      code,
      redirect_uri: redirectUri(),
      code_verifier: codeVerifier,
    })
    return providerJson(String(tokenEndpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
  }

  async function fetchUserinfo(discovery: Json, accessToken: string): Promise<Json> {
    const endpoint = discovery.userinfo_endpoint
    if (!endpoint) return {}
    return providerJson(String(endpoint), { headers: { authorization: `Bearer ${accessToken}` } })
  }

  async function decodeIdToken(discovery: Json, idToken: string, nonce: string, accessToken: string): Promise<Json> {
    const jwksUri = discovery.jwks_uri
    const issuer = discovery.issuer
    if (!jwksUri || !issuer) throw new HttpError(500, 'OIDC discovery is missing jwks_uri or issuer')
    const jwks = (await providerJson(String(jwksUri))) as { keys?: JWK[] }
    const header = decodeProtectedHeader(idToken)
    const key = (jwks.keys ?? []).find((candidate) => candidate.kid === header.kid)
    if (!key) throw new HttpError(400, 'OIDC signing key not found')

    const algorithm = key.alg ?? 'RS256'
    let claims: Json
    try {
      const verified = await jwtVerify(idToken, await importJWK(key, algorithm), {
        algorithms: [algorithm],
        audience: config.oidcClientId,
        issuer: String(issuer),
      })
      claims = verified.payload as Json
      if ('at_hash' in claims) {
        if (!accessToken || claims.at_hash !== atHash(accessToken, algorithm)) throw new Error('at_hash mismatch')
      }
    } catch {
      throw new HttpError(400, 'Invalid OIDC id_token')
    }
    if (claims.nonce !== nonce) throw new HttpError(400, 'Invalid OIDC nonce')
    return claims
  }

  async function syncRoles(user: User, merged: Json): Promise<void> {
    if (!config.oidcSyncRoles) return
    const providerRoles = claimValues(merged, config.oidcRolesClaim)
    const adminRoles = new Set(
      config.oidcAdminRoles
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    )
    if (adminRoles.size > 0) {
      const isSuperuser = [...providerRoles].some((role) => adminRoles.has(role))
      await ctx.db.update(users).set({ isSuperuser }).where(eq(users.id, user.id))
    }

    const desired = desiredWorkspaceRole(providerRoles, parseWorkspaceRoleMap(config.oidcWorkspaceRoleMap))
    if (desired === null) return

    const personal = await findPersonalMembership(ctx.db, user.id)
    if (!personal || personal.member.role === desired) return
    // Never demote someone inside their own Personal workspace.
    if (personal.member.role === 'owner' && desired !== 'owner') return
    await ctx.db.update(workspaceMembers).set({ role: desired }).where(eq(workspaceMembers.id, personal.member.id))
  }

  async function reload(user: User): Promise<User> {
    const [fresh] = await ctx.db.select().from(users).where(eq(users.id, user.id)).limit(1)
    return fresh ?? user
  }

  async function getOrCreateOidcUser(claims: Json, userinfo: Json, issuer: string): Promise<User> {
    if (userinfo.sub !== undefined && userinfo.sub !== null && userinfo.sub !== claims.sub) {
      throw new HttpError(400, 'OIDC userinfo subject does not match id_token subject')
    }
    // The id_token is the signed, audience-validated source of truth: its claims win over userinfo.
    const merged: Json = { ...userinfo, ...claims }
    if (!merged.sub) throw new HttpError(400, 'OIDC provider did not return a subject claim')
    const subject = String(merged.sub)
    if (!issuer) throw new HttpError(500, 'OIDC discovery is missing issuer')

    const linkMode = config.oidcExistingUserLinkMode
    if (!EXISTING_USER_LINK_MODES.includes(linkMode)) {
      throw new HttpError(500, 'OIDC_EXISTING_USER_LINK_MODE must be disabled, verified_email, or email')
    }

    const [linked] = await ctx.db
      .select()
      .from(users)
      .where(sql`${users.oidcIssuer} = ${issuer} and ${users.oidcSubject} = ${subject}`)
      .limit(1)
    if (linked) {
      await syncRoles(linked, merged)
      return reload(linked)
    }

    if (!merged.email) throw new HttpError(400, 'OIDC provider did not return an email claim')
    const email = z.email().parse(String(merged.email)).toLowerCase()
    const verified = merged.email_verified === true || merged.email_verified === 'true'

    const existing = await getUserByEmail(ctx.db, email)
    if (existing) {
      if (existing.oidcIssuer || existing.oidcSubject) {
        throw new HttpError(403, 'OIDC identity is linked to a different account')
      }
      if (linkMode === 'disabled') throw new HttpError(403, 'Existing account is not linked to this OIDC identity')
      if (linkMode === 'verified_email' && !verified) throw new HttpError(400, 'OIDC email is not verified')
      await ctx.db.update(users).set({ oidcIssuer: issuer, oidcSubject: subject }).where(eq(users.id, existing.id))
      await syncRoles(existing, merged)
      return reload(existing)
    }

    if (config.oidcRequireVerifiedEmail && !verified) throw new HttpError(400, 'OIDC email is not verified')
    if (!(await isRegistrationEnabled(ctx.db, config))) throw new HttpError(403, 'Registration is disabled')
    if (!config.oidcAutoRegister) throw new HttpError(403, 'No local account is linked to this OIDC identity')

    const displayName =
      (merged.name as string | undefined) || (merged.preferred_username as string | undefined) || email.split('@')[0]
    const preferences = {
      language: 'en',
      date_format: DEFAULT_PREFERENCES.date_format,
      timezone: 'UTC',
      display_name: displayName,
      auth_provider: config.oidcProviderName,
    }

    let created: User
    try {
      // `create(..., safe=True)`: the privilege flags of the request are ignored; roles sync below.
      created = await createUser(ctx.db, { email, password: tokenUrlsafe(32) })
    } catch (error) {
      if (!(error instanceof UserAlreadyExists)) throw error
      created = (await getUserByEmail(ctx.db, email)) as User
    }
    await ctx.db
      .update(users)
      .set({ preferences, oidcIssuer: issuer, oidcSubject: subject })
      .where(eq(users.id, created.id))
    const fresh = await reload(created)
    await createPersonalWorkspaceForUser(ctx.db, fresh)
    await syncRoles(fresh, merged)
    return reload(fresh)
  }

  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    typed.get(
      '/api/auth/oidc/config',
      {
        schema: {
          response: {
            200: z.object({ enabled: z.boolean(), provider_name: z.string(), local_auth_enabled: z.boolean() }),
          },
        },
      },
      async () => ({
        enabled: config.oidcLoginAvailable,
        provider_name: config.oidcProviderName || 'OIDC',
        local_auth_enabled: config.localAuthEnabled,
      }),
    )

    const loginQuery = z.object({ redirect_target: z.string().optional(), desktop_nonce: z.union([z.string(), z.array(z.string())]).optional() })
    typed.get('/api/auth/oidc/login', { schema: { querystring: loginQuery } }, async (request, reply) => {
      if (!config.oidcClientId) throw new HttpError(500, 'OIDC_CLIENT_ID is required')
      const discovery = await discover()
      const authorizationEndpoint = discovery.authorization_endpoint
      if (!authorizationEndpoint) throw new HttpError(500, 'OIDC discovery is missing authorization_endpoint')
      // The desktop app asks for its own deep link; only exact allowlisted URLs are honoured.
      const { redirect_target: redirectTarget, desktop_nonce: desktopNonce } = request.query
      if (redirectTarget !== undefined) {
        if (!config.oidcDesktopRedirects.includes(redirectTarget)) throw new HttpError(400, 'Invalid redirect_target')
        // The app proves the deep link answers a sign-in it started with a nonce of its own.
        // Given twice it is a list: ambiguous, refused (as on the Python backend).
        if (typeof desktopNonce !== 'string' || !DESKTOP_NONCE_PATTERN.test(desktopNonce)) {
          throw new HttpError(400, 'Invalid desktop_nonce')
        }
      }

      const state = tokenUrlsafe(32)
      const nonce = tokenUrlsafe(32)
      const codeVerifier = tokenUrlsafe(64)
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      const statePayload: Record<string, string> = { nonce, code_verifier: codeVerifier }
      if (redirectTarget !== undefined) {
        statePayload.redirect_target = redirectTarget
        statePayload.desktop_nonce = desktopNonce as string
      }
      await ctx.keyValueStore.set(`oidc_state:${state}`, JSON.stringify(statePayload), {
        ttlSeconds: OIDC_STATE_TTL_SECONDS,
      })

      const params = new URLSearchParams({
        client_id: config.oidcClientId,
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: config.oidcScopes,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      return reply.redirect(`${String(authorizationEndpoint)}?${params.toString()}`, 307)
    })

    typed.get(
      '/api/auth/oidc/callback',
      { schema: { querystring: z.object({ code: z.string(), state: z.string() }) } },
      async (request, reply) => {
        const { code, state } = request.query
        const raw = await ctx.keyValueStore.getdel(`oidc_state:${state}`)
        if (raw === null) throw new HttpError(400, 'Invalid or expired OIDC state')
        const stateData = JSON.parse(raw) as { nonce: string; code_verifier?: string; redirect_target?: string; desktop_nonce?: string }

        const discovery = await discover()
        const tokens = await exchangeCode(discovery, code, stateData.code_verifier ?? '')
        const idToken = tokens.id_token
        if (!idToken) throw new HttpError(400, 'OIDC provider did not return an id_token')
        const accessToken = String(tokens.access_token ?? '')
        const claims = await decodeIdToken(discovery, String(idToken), stateData.nonce, accessToken)
        const userinfo = await fetchUserinfo(discovery, accessToken)
        const user = await getOrCreateOidcUser(claims, userinfo, String(discovery.issuer ?? ''))
        if (!user.isActive) throw new HttpError(403, 'User is inactive')

        const token = await writeAccessToken(config, user.id)
        if (stateData.redirect_target) {
          const nonce = encodeURIComponent(stateData.desktop_nonce ?? '')
          return reply.redirect(
            `${stateData.redirect_target}#access_token=${token}&token_type=bearer&desktop_nonce=${nonce}`,
            307,
          )
        }
        const frontend = config.frontendUrl.replace(/\/+$/, '')
        return reply.redirect(`${frontend}/auth/oidc/callback#access_token=${token}&token_type=bearer`, 307)
      },
    )
  }
}

