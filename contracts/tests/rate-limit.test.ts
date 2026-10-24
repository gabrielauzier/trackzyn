import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { Api, PASSWORD, freshIp, subject, uniqueEmail } from './support/http'
import { redis } from './support/redis'
import { type RunningStack, startSubject } from './support/stacks'

describe('rate limits', () => {
  beforeAll(resetData)

  it('C12 sixth login in 60 s is 429 with Retry-After 60', async () => {
    const api = subject()
    const ip = freshIp()
    for (let attempt = 1; attempt <= 5; attempt++) {
      const reply = await api.post('/api/auth/login', { ip, form: { username: 'nobody@example.com', password: 'x' } })
      expect(reply.status, `attempt ${attempt}`).toBe(400)
    }
    const sixth = await api.post('/api/auth/login', { ip, form: { username: 'nobody@example.com', password: 'x' } })
    expect(sixth.status).toBe(429)
    expect(sixth.json).toEqual({ detail: 'Too many requests' })
    expect(sixth.headers.get('retry-after')).toBe('60')
  })

  it('C12 fourth register in 3600 s is 429 with Retry-After 3600', async () => {
    const api = subject()
    const ip = freshIp()
    for (let attempt = 1; attempt <= 3; attempt++) {
      const reply = await api.post('/api/auth/register', {
        ip,
        json: { email: uniqueEmail('rl'), password: PASSWORD },
      })
      expect(reply.status, `attempt ${attempt}`).toBe(201)
    }
    const fourth = await api.post('/api/auth/register', {
      ip,
      json: { email: uniqueEmail('rl'), password: PASSWORD },
    })
    expect(fourth.status).toBe(429)
    expect(fourth.json).toEqual({ detail: 'Too many requests' })
    expect(fourth.headers.get('retry-after')).toBe('3600')
  })

  it('C13 hops=1 keys on the last X-Forwarded-For entry', async () => {
    const first = `198.51.100.${(Date.now() % 200) + 1}`
    const last = `203.0.113.${(Date.now() % 200) + 1}`
    const reply = await subject().post('/api/auth/login', {
      headers: { 'x-forwarded-for': `${first}, ${last}` },
      form: { username: 'nobody@example.com', password: 'x' },
    })
    expect(reply.status).toBe(400)
    expect(await redis().zcard(`rate_limit:/api/auth/login:${last}`)).toBe(1)
    expect(await redis().exists(`rate_limit:/api/auth/login:${first}`)).toBe(0)
  })

  describe('two trusted hops', () => {
    let twoHops: RunningStack
    beforeAll(async () => {
      twoHops = await startSubject({ TRUSTED_PROXY_HOPS: '2' })
    })
    afterAll(async () => {
      await twoHops?.stop()
    })

    it('C13 hops=2 with a single entry keys on unknown', async () => {
      const key = 'rate_limit:/api/auth/login:unknown'
      await redis().del(key)
      const reply = await new Api(twoHops.url).post('/api/auth/login', {
        headers: { 'x-forwarded-for': '192.0.2.5' },
        form: { username: 'nobody@example.com', password: 'x' },
      })
      expect(reply.status).toBe(400)
      expect(await redis().zcard(key)).toBe(1)
      expect(await redis().exists('rate_limit:/api/auth/login:192.0.2.5')).toBe(0)
      await redis().del(key)
    })
  })
})
