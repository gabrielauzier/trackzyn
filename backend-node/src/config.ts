import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'

/** Same settings, same variable names and same precedence as backend/app/core/config.py. */
export interface Config {
  appName: string
  debug: boolean
  databaseUrl: string
  /** `databaseUrl` without the SQLAlchemy driver suffix, which is what `pg` expects. */
  pgConnectionString: string
  secretKey: string
  localAuthEnabled: boolean
  algorithm: string
  accessTokenExpireMinutes: number
  frontendUrl: string
  webauthnRpName: string
  webauthnRpId: string
  webauthnOrigin: string
  webauthnChallengeTtlSeconds: number
  storageProvider: string
  storageLocalPath: string
  storageMaxFileSizeMb: number
  storageAllowedExtensions: string
  registrationEnabled: boolean
  oidcEnabled: boolean
  oidcProviderName: string
  oidcDiscoveryUrl: string
  oidcClientId: string
  oidcClientSecret: string
  oidcRedirectUri: string
  oidcScopes: string
  oidcAutoRegister: boolean
  oidcExistingUserLinkMode: string
  oidcRequireVerifiedEmail: boolean
  oidcSyncRoles: boolean
  oidcRolesClaim: string
  oidcAdminRoles: string
  oidcWorkspaceRoleMap: string
  /** Exact URLs the desktop app may ask the OIDC callback to return to. */
  oidcDesktopRedirects: string[]
  redisUrl: string | null
  trustedProxyHops: number
  updateCheckRepo: string
  /** True when OIDC is enabled with a client id and a discovery URL. */
  oidcLoginAvailable: boolean
  /** Node-only: where the HTTP server listens. */
  host: string
  port: number
}

export interface LoadConfigOptions {
  /** `.env` files, lowest priority first among themselves is not used: the first file wins, like pydantic-settings. */
  envFiles?: string[]
  /** Directories of one-file-per-secret, a later directory overriding an earlier one. */
  secretsDirs?: string[]
}

type Source = Record<string, string | undefined>

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

const TRUE = new Set(['1', 'true', 't', 'yes', 'y', 'on'])
const FALSE = new Set(['0', 'false', 'f', 'no', 'n', 'off'])

function parseBool(name: string, raw: string): boolean {
  const value = raw.trim().toLowerCase()
  if (TRUE.has(value)) return true
  if (FALSE.has(value)) return false
  throw new Error(`${name}: "${raw}" is not a valid boolean`)
}

function parseInteger(name: string, raw: string): number {
  const value = raw.trim()
  if (!/^[+-]?\d+$/.test(value)) throw new Error(`${name}: "${raw}" is not a valid integer`)
  return Number.parseInt(value, 10)
}

function readEnvFiles(files: string[]): Source {
  // pydantic-settings reads every file, an earlier one overriding a later one.
  const merged: Source = {}
  for (const file of [...files].reverse()) {
    if (!existsSync(file) || !statSync(file).isFile()) continue
    Object.assign(merged, parseEnv(readFileSync(file, 'utf8')))
  }
  return merged
}

function readSecretsDirs(dirs: string[]): Source {
  const merged: Source = {}
  for (const dir of dirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir)) {
      const file = join(dir, name)
      if (statSync(file).isFile()) merged[name.toUpperCase()] = readFileSync(file, 'utf8').trim()
    }
  }
  return merged
}

export function secretsDirsFrom(env: Source): string[] {
  return (env.CREDENTIALS_DIRECTORY ?? '/run/secrets').split(':').filter(Boolean)
}

export function loadConfig(env: Source = process.env, options: LoadConfigOptions = {}): Config {
  const envFiles = options.envFiles ?? [join(process.cwd(), '.env'), join(PACKAGE_ROOT, '.env')]
  const secretsDirs = options.secretsDirs ?? secretsDirsFrom(env)

  // Environment first, then the .env files, then the secrets directories, then the defaults.
  const sources: Source[] = [env, readEnvFiles(envFiles), readSecretsDirs(secretsDirs)]
  const raw = (name: string): string | undefined => {
    for (const source of sources) {
      const value = source[name]
      if (value !== undefined) return value
    }
    return undefined
  }
  const text = (name: string, fallback: string) => raw(name) ?? fallback
  const bool = (name: string, fallback: boolean) => {
    const value = raw(name)
    return value === undefined ? fallback : parseBool(name, value)
  }
  const int = (name: string, fallback: number) => {
    const value = raw(name)
    return value === undefined ? fallback : parseInteger(name, value)
  }

  const databaseUrl = text('DATABASE_URL', 'postgresql+asyncpg://postgres:postgres@localhost:5432/launchkit')
  const oidcEnabled = bool('OIDC_ENABLED', false)
  const oidcClientId = text('OIDC_CLIENT_ID', '')
  const oidcDiscoveryUrl = text('OIDC_DISCOVERY_URL', '')
  const localAuthEnabled = bool('LOCAL_AUTH_ENABLED', true)
  const oidcLoginAvailable = Boolean(oidcEnabled && oidcClientId && oidcDiscoveryUrl)

  if (!localAuthEnabled && !oidcLoginAvailable) {
    const missing: string[] = []
    if (!oidcEnabled) missing.push('OIDC_ENABLED=true')
    if (!oidcClientId) missing.push('OIDC_CLIENT_ID')
    if (!oidcDiscoveryUrl) missing.push('OIDC_DISCOVERY_URL')
    throw new Error(
      `LOCAL_AUTH_ENABLED=false requires a complete OIDC configuration; missing: ${missing.join(', ')}`,
    )
  }

  const redisUrl = raw('REDIS_URL')

  return {
    appName: text('APP_NAME', 'launchkit'),
    debug: bool('DEBUG', false),
    databaseUrl,
    pgConnectionString: databaseUrl.replace(/^(postgres(?:ql)?)\+[a-z0-9_]+:\/\//i, '$1://'),
    secretKey: text('SECRET_KEY', 'change-me-in-production'),
    localAuthEnabled,
    algorithm: text('ALGORITHM', 'HS256'),
    accessTokenExpireMinutes: int('ACCESS_TOKEN_EXPIRE_MINUTES', 60 * 24),
    frontendUrl: text('FRONTEND_URL', 'http://localhost:5173'),
    webauthnRpName: text('WEBAUTHN_RP_NAME', 'launchkit'),
    webauthnRpId: text('WEBAUTHN_RP_ID', ''),
    webauthnOrigin: text('WEBAUTHN_ORIGIN', ''),
    webauthnChallengeTtlSeconds: int('WEBAUTHN_CHALLENGE_TTL_SECONDS', 300),
    storageProvider: text('STORAGE_PROVIDER', 'local'),
    storageLocalPath: text('STORAGE_LOCAL_PATH', './data/files'),
    storageMaxFileSizeMb: int('STORAGE_MAX_FILE_SIZE_MB', 10),
    storageAllowedExtensions: text('STORAGE_ALLOWED_EXTENSIONS', 'jpg,jpeg,png,webp,gif,heic,pdf'),
    registrationEnabled: bool('REGISTRATION_ENABLED', true),
    oidcEnabled,
    oidcProviderName: text('OIDC_PROVIDER_NAME', 'OIDC'),
    oidcDiscoveryUrl,
    oidcClientId,
    oidcClientSecret: text('OIDC_CLIENT_SECRET', ''),
    oidcRedirectUri: text('OIDC_REDIRECT_URI', ''),
    oidcScopes: text('OIDC_SCOPES', 'openid email profile'),
    oidcAutoRegister: bool('OIDC_AUTO_REGISTER', true),
    oidcExistingUserLinkMode: text('OIDC_EXISTING_USER_LINK_MODE', 'disabled'),
    oidcRequireVerifiedEmail: bool('OIDC_REQUIRE_VERIFIED_EMAIL', true),
    oidcSyncRoles: bool('OIDC_SYNC_ROLES', false),
    oidcRolesClaim: text('OIDC_ROLES_CLAIM', 'groups'),
    oidcAdminRoles: text('OIDC_ADMIN_ROLES', ''),
    oidcWorkspaceRoleMap: text('OIDC_WORKSPACE_ROLE_MAP', ''),
    oidcDesktopRedirects: text('OIDC_DESKTOP_REDIRECT', '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    // The Python default points at localhost; the Node backend can run without Redis at all.
    redisUrl: redisUrl === undefined ? 'redis://localhost:6379/0' : redisUrl || null,
    trustedProxyHops: int('TRUSTED_PROXY_HOPS', 0),
    updateCheckRepo: text('UPDATE_CHECK_REPO', ''),
    oidcLoginAvailable,
    host: text('HOST', '0.0.0.0'),
    port: int('PORT', 8000),
  }
}
