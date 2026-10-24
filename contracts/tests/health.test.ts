import { describe, expect, it } from 'vitest'
import { subject } from './support/http'

describe('health', () => {
  it('C3 GET /api/health returns 200 {"status":"healthy"}', async () => {
    const reply = await subject().get('/api/health')
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({ status: 'healthy' })
  })
})
