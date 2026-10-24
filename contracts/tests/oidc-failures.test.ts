import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Api } from './support/http'
import { FakeIdp } from './support/idp'
import { redis } from './support/redis'
import { type RunningStack, startSubject } from './support/stacks'

describe('the provider is unreachable', () => {
  let idp: FakeIdp
  let stack: RunningStack
  let api: Api

  beforeAll(async () => {
    idp = await FakeIdp.start()
    stack = await startSubject(idp.env())
    api = new Api(stack.url)
    await idp.stop()
  })
  afterAll(async () => {
    await stack?.stop()
  })

  it('C23 login answers 500 Internal Server Error as plain text when discovery fails', async () => {
    const reply = await api.get('/api/auth/oidc/login')
    expect(reply.status).toBe(500)
    expect(reply.headers.get('content-type')).toContain('text/plain')
    expect(reply.text).toBe('Internal Server Error')
  })

  it('C24 callback answers 500 Internal Server Error as plain text when discovery fails', async () => {
    await redis().set('oidc_state:provider-down', JSON.stringify({ nonce: 'n', code_verifier: 'v' }), 'EX', 60)
    const reply = await api.get('/api/auth/oidc/callback?code=abc&state=provider-down')
    expect(reply.status).toBe(500)
    expect(reply.text).toBe('Internal Server Error')
    // The state was consumed before the provider was asked.
    expect(await redis().exists('oidc_state:provider-down')).toBe(0)
  })
})
