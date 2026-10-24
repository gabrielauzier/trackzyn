import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'

const DISCOVERY = 'https://id.example.com/.well-known/openid-configuration'
const NO_FILES = { envFiles: [], secretsDirs: [] }

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'trackzyn-config-'))
}

describe('loadConfig', () => {
  it('C8 loadConfig throws the same message for all 7 combinations', () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{}, 'OIDC_ENABLED=true, OIDC_CLIENT_ID, OIDC_DISCOVERY_URL'],
      [{ OIDC_ENABLED: 'true' }, 'OIDC_CLIENT_ID, OIDC_DISCOVERY_URL'],
      [{ OIDC_CLIENT_ID: 'x' }, 'OIDC_ENABLED=true, OIDC_DISCOVERY_URL'],
      [{ OIDC_DISCOVERY_URL: DISCOVERY }, 'OIDC_ENABLED=true, OIDC_CLIENT_ID'],
      [{ OIDC_ENABLED: 'true', OIDC_CLIENT_ID: 'x' }, 'OIDC_DISCOVERY_URL'],
      [{ OIDC_ENABLED: 'true', OIDC_DISCOVERY_URL: DISCOVERY }, 'OIDC_CLIENT_ID'],
      [{ OIDC_CLIENT_ID: 'x', OIDC_DISCOVERY_URL: DISCOVERY }, 'OIDC_ENABLED=true'],
    ]
    expect(cases).toHaveLength(7)
    for (const [env, missing] of cases) {
      expect(() => loadConfig({ LOCAL_AUTH_ENABLED: 'false', ...env }, NO_FILES)).toThrowError(
        `LOCAL_AUTH_ENABLED=false requires a complete OIDC configuration; missing: ${missing}`,
      )
    }
  })

  it('local auth can be disabled when OIDC is complete, and defaults to enabled', () => {
    expect(loadConfig({}, NO_FILES).localAuthEnabled).toBe(true)
    const config = loadConfig(
      {
        LOCAL_AUTH_ENABLED: 'false',
        OIDC_ENABLED: 'true',
        OIDC_CLIENT_ID: 'trackzyn',
        OIDC_DISCOVERY_URL: DISCOVERY,
      },
      NO_FILES,
    )
    expect(config.localAuthEnabled).toBe(false)
    expect(config.oidcLoginAvailable).toBe(true)
  })

  it('uses the Python defaults for everything not set', () => {
    const config = loadConfig({}, NO_FILES)
    expect(config).toMatchObject({
      appName: 'trackzyn',
      secretKey: 'change-me-in-production',
      accessTokenExpireMinutes: 1440,
      frontendUrl: 'http://localhost:5173',
      redisUrl: 'redis://localhost:6379/0',
      trustedProxyHops: 0,
      registrationEnabled: true,
      webauthnRpName: 'trackzyn',
      webauthnRpId: '',
      webauthnOrigin: '',
      webauthnChallengeTtlSeconds: 300,
      storageProvider: 'local',
      storageMaxFileSizeMb: 10,
      storageAllowedExtensions: 'jpg,jpeg,png,webp,gif,heic,pdf',
      oidcEnabled: false,
      oidcScopes: 'openid email profile',
      oidcAutoRegister: true,
      oidcExistingUserLinkMode: 'disabled',
      oidcRequireVerifiedEmail: true,
      oidcSyncRoles: false,
      oidcRolesClaim: 'groups',
    })
  })

  it('reads booleans and integers the way pydantic-settings does', () => {
    const config = loadConfig(
      { REGISTRATION_ENABLED: 'No', DEBUG: '1', TRUSTED_PROXY_HOPS: '2', ACCESS_TOKEN_EXPIRE_MINUTES: '-1' },
      NO_FILES,
    )
    expect(config.registrationEnabled).toBe(false)
    expect(config.debug).toBe(true)
    expect(config.trustedProxyHops).toBe(2)
    expect(config.accessTokenExpireMinutes).toBe(-1)
    expect(() => loadConfig({ TRUSTED_PROXY_HOPS: 'many' }, NO_FILES)).toThrowError(/TRUSTED_PROXY_HOPS/)
  })

  it('accepts the SQLAlchemy form of DATABASE_URL and hands pg a plain postgresql URL', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql+asyncpg://u:p@db:5432/app' }, NO_FILES)
    expect(config.databaseUrl).toBe('postgresql+asyncpg://u:p@db:5432/app')
    expect(config.pgConnectionString).toBe('postgresql://u:p@db:5432/app')
  })

  it('an env file fills what the environment leaves out, and unknown keys are ignored', () => {
    const dir = tmp()
    const envFile = join(dir, '.env')
    writeFileSync(
      envFile,
      'SECRET_KEY=from-env-file\nAPP_NAME=from-file\nMY_FEATURE_ENABLED=true\nCOMPOSE_PROFILES=dev\nFRONTEND_PORT=3132\n',
    )
    const config = loadConfig({ APP_NAME: 'from-env' }, { envFiles: [envFile], secretsDirs: [] })
    expect(config.secretKey).toBe('from-env-file')
    expect(config.appName).toBe('from-env')
  })

  it('reads secrets from files, stripped, below the environment and the env file', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'oidc_client_secret'), '  stripped-value  \n\n')
    writeFileSync(join(dir, 'oidc_provider_name'), 'from-secret')
    expect(loadConfig({}, { envFiles: [], secretsDirs: [dir] }).oidcClientSecret).toBe('stripped-value')
    expect(loadConfig({ OIDC_CLIENT_SECRET: 'inline' }, { envFiles: [], secretsDirs: [dir] }).oidcClientSecret).toBe(
      'inline',
    )
    const envFile = join(dir, '.env')
    writeFileSync(envFile, 'OIDC_PROVIDER_NAME=from-env-file\n')
    expect(loadConfig({}, { envFiles: [envFile], secretsDirs: [dir] }).oidcProviderName).toBe('from-env-file')
  })

  it('merges several secrets directories, later ones winning', () => {
    const root = tmp()
    const d1 = join(root, 'd1')
    const d2 = join(root, 'd2')
    mkdirSync(d1)
    mkdirSync(d2)
    writeFileSync(join(d1, 'oidc_client_secret'), 'from-d1')
    writeFileSync(join(d1, 'oidc_provider_name'), 'Provider D1')
    writeFileSync(join(d2, 'oidc_client_secret'), 'from-d2')
    writeFileSync(join(d2, 'oidc_client_id'), 'from-d2')
    const config = loadConfig({}, { envFiles: [], secretsDirs: [d1, d2] })
    expect(config.oidcClientSecret).toBe('from-d2')
    expect(config.oidcProviderName).toBe('Provider D1')
    expect(config.oidcClientId).toBe('from-d2')
  })

  it('takes the secrets directories from CREDENTIALS_DIRECTORY, colon separated', () => {
    const root = tmp()
    const d1 = join(root, 'a')
    const d2 = join(root, 'b')
    mkdirSync(d1)
    mkdirSync(d2)
    writeFileSync(join(d1, 'oidc_client_id'), 'a')
    writeFileSync(join(d2, 'oidc_client_id'), 'b')
    const config = loadConfig({ CREDENTIALS_DIRECTORY: `${d1}:${d2}` }, { envFiles: [] })
    expect(config.oidcClientId).toBe('b')
  })
})
