import type { FastifyRequest, preValidationAsyncHookHandler } from 'fastify'
import { HttpError } from '../http/http-error.ts'
import type { AppContext } from '../context.ts'

export interface ClientAddress {
  socketAddress: string | undefined
  forwardedFor: string | undefined
}

/**
 * Client IP for rate-limit keys, honouring `trustedProxyHops` trusted reverse proxies.
 *
 * Each trusted proxy appends the peer it saw to the right end of X-Forwarded-For, so the Nth
 * entry from the right is a real observation. A chain shorter than the configured hop count
 * means the trust setting does not match what reached us, so it is not trusted.
 */
export function resolveClientIp(address: ClientAddress, trustedProxyHops: number): string {
  if (trustedProxyHops <= 0) return address.socketAddress ?? 'unknown'

  const hops = address.forwardedFor ? address.forwardedFor.split(',').map((hop) => hop.trim()) : []
  if (hops.length < trustedProxyHops) return 'unknown'
  return hops[hops.length - trustedProxyHops] as string
}

export function clientIpOf(request: FastifyRequest, trustedProxyHops: number): string {
  const forwarded = request.headers['x-forwarded-for']
  return resolveClientIp(
    {
      socketAddress: request.socket.remoteAddress,
      forwardedFor: Array.isArray(forwarded) ? forwarded.join(', ') : forwarded,
    },
    trustedProxyHops,
  )
}

/** A `preValidation` hook: at most `maxRequests` per client IP and path in `windowSeconds`. */
export function rateLimit(ctx: AppContext, maxRequests: number, windowSeconds: number): preValidationAsyncHookHandler {
  return async (request) => {
    const clientIp = clientIpOf(request, ctx.config.trustedProxyHops)
    const path = request.url.split('?')[0]
    const key = `rate_limit:${path}:${clientIp}`

    const count = await ctx.keyValueStore.rateLimitHit(key, Date.now() / 1000, windowSeconds)
    if (count >= maxRequests) {
      throw new HttpError(429, 'Too many requests', { 'Retry-After': String(windowSeconds) })
    }
  }
}

export const LOGIN_LIMIT = { maxRequests: 5, windowSeconds: 60 }
export const REGISTER_LIMIT = { maxRequests: 3, windowSeconds: 3600 }
export const PASSWORD_RESET_LIMIT = { maxRequests: 3, windowSeconds: 3600 }
