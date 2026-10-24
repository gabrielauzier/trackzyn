import { Redis } from 'ioredis'
import { redisUrl } from './config'

let client: Redis | undefined

export function redis(): Redis {
  client ??= new Redis(redisUrl(), { maxRetriesPerRequest: 2 })
  return client
}

export async function closeRedis(): Promise<void> {
  await client?.quit().catch(() => undefined)
  client = undefined
}

/** Keys a server wrote, ignoring rate-limit bookkeeping. */
export async function appKeys(): Promise<string[]> {
  const keys = await redis().keys('*')
  return keys.filter((k) => !k.startsWith('rate_limit:')).sort()
}
