import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

export const LOCAL_TOKEN_HEADER = 'x-launchkit-local-token'

function matches(given: unknown, expected: Buffer): boolean {
  if (typeof given !== 'string') return false
  const candidate = Buffer.from(given)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

/**
 * Every request must carry the session token only the desktop main process knows:
 * another program on the machine can reach the port but cannot use the API.
 */
export function requireLocalToken(sessionToken: string) {
  const expected = Buffer.from(sessionToken)
  return (app: FastifyInstance): void => {
    app.addHook('onRequest', async (request, reply) => {
      if (matches(request.headers[LOCAL_TOKEN_HEADER], expected)) return
      return reply.code(401).send({ detail: 'Unauthorized' })
    })
  }
}
