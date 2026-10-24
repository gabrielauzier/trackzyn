import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { Api, registerUser, subject } from './support/http'
import { type RunningStack, startSubject } from './support/stacks'

const SOME_TOKEN = 'a'.repeat(32)

// Every operation behind a rate limit, with a request that would pass its other guards.
const OPERATIONS: Array<{ name: string; call: (api: Api, token: string) => ReturnType<Api['request']> }> = [
  { name: 'POST /api/auth/login', call: (a) => a.post('/api/auth/login', { form: { username: 'someone@example.com', password: 'whatever-123' } }) },
  { name: 'POST /api/auth/logout', call: (a, token) => a.post('/api/auth/logout', { token }) },
  { name: 'POST /api/auth/register', call: (a) => a.post('/api/auth/register', { json: { email: 'down@example.com', password: 'contract-pass-123' } }) },
  { name: 'POST /api/auth/forgot-password', call: (a) => a.post('/api/auth/forgot-password', { json: { email: 'down@example.com' } }) },
  { name: 'POST /api/auth/reset-password', call: (a) => a.post('/api/auth/reset-password', { json: { token: SOME_TOKEN, password: 'contract-pass-123' } }) },
  { name: 'POST /api/auth/2fa/verify', call: (a) => a.post('/api/auth/2fa/verify', { json: { temp_token: SOME_TOKEN, code: '123456' } }) },
  {
    name: 'POST /api/auth/passkeys/authenticate/options',
    call: (a) => a.post('/api/auth/passkeys/authenticate/options', { json: {} }),
  },
  {
    name: 'POST /api/auth/passkeys/authenticate/verify',
    call: (a) => a.post('/api/auth/passkeys/authenticate/verify', { json: { challenge_id: 'x', credential: {} } }),
  },
  { name: 'POST /api/auth/passkeys/2fa/options', call: (a) => a.post('/api/auth/passkeys/2fa/options', { json: { temp_token: SOME_TOKEN } }) },
  {
    name: 'POST /api/auth/passkeys/2fa/verify',
    call: (a) => a.post('/api/auth/passkeys/2fa/verify', { json: { temp_token: SOME_TOKEN, challenge_id: 'x', credential: {} } }),
  },
]

describe('Redis is down', () => {
  let down: RunningStack
  let token: string

  beforeAll(async () => {
    await resetData()
    token = (await registerUser(subject())).token
    down = await startSubject({ REDIS_URL: 'redis://127.0.0.1:1' })
  })
  afterAll(async () => {
    await down?.stop()
  })

  it.each(OPERATIONS)('C42 $name is 500 when redis is down', async ({ call }) => {
    const reply = await call(new Api(down.url), token)
    expect(reply.status).toBe(500)
    expect(reply.text).toBe('Internal Server Error')
  })

  it('C42 the rate-limited operations are exactly 10', () => {
    expect(OPERATIONS).toHaveLength(10)
  })
})
