import { describe, expect, it } from 'vitest'
import { runSubjectUntilExit } from './support/stacks'

const DISCOVERY = 'http://127.0.0.1:1/.well-known/openid-configuration'

// Which of the three settings are present, and what `missing:` must then list.
const cases: Array<{ name: string; env: Record<string, string>; missing: string }> = [
  { name: 'nothing set', env: {}, missing: 'OIDC_ENABLED=true, OIDC_CLIENT_ID, OIDC_DISCOVERY_URL' },
  { name: 'only enabled', env: { OIDC_ENABLED: 'true' }, missing: 'OIDC_CLIENT_ID, OIDC_DISCOVERY_URL' },
  { name: 'only client id', env: { OIDC_CLIENT_ID: 'x' }, missing: 'OIDC_ENABLED=true, OIDC_DISCOVERY_URL' },
  { name: 'only discovery url', env: { OIDC_DISCOVERY_URL: DISCOVERY }, missing: 'OIDC_ENABLED=true, OIDC_CLIENT_ID' },
  {
    name: 'enabled and client id',
    env: { OIDC_ENABLED: 'true', OIDC_CLIENT_ID: 'x' },
    missing: 'OIDC_DISCOVERY_URL',
  },
  {
    name: 'enabled and discovery url',
    env: { OIDC_ENABLED: 'true', OIDC_DISCOVERY_URL: DISCOVERY },
    missing: 'OIDC_CLIENT_ID',
  },
  {
    name: 'client id and discovery url',
    env: { OIDC_CLIENT_ID: 'x', OIDC_DISCOVERY_URL: DISCOVERY },
    missing: 'OIDC_ENABLED=true',
  },
]

describe('startup configuration', () => {
  it.each(cases)('C8 server exits non-zero and names what is missing: $name', async ({ env, missing }) => {
    const exit = await runSubjectUntilExit({
      LOCAL_AUTH_ENABLED: 'false',
      OIDC_ENABLED: 'false',
      OIDC_CLIENT_ID: '',
      OIDC_DISCOVERY_URL: '',
      ...env,
    })
    expect(exit.code).not.toBeNull()
    expect(exit.code).not.toBe(0)
    expect(exit.output).toContain(`LOCAL_AUTH_ENABLED=false requires a complete OIDC configuration; missing: ${missing}`)
  })
})
