import { isIP } from 'node:net'
import type { FastifyRequest } from 'fastify'
import type { Config } from '../config.ts'
import { HttpError } from '../http/http-error.ts'

/**
 * Relying-party resolution for WebAuthn, a transcription of backend/app/core/webauthn.py:
 * the RP ID and the expected origin come from the origin the browser used, unless
 * `WEBAUTHN_RP_ID` pins the RP ID (an origin outside that domain is then refused).
 */
export interface WebAuthnContext {
  rpId: string
  origin: string
}

const invalid = () => error('passkey_origin_invalid', 'The request origin could not be understood.')

function error(code: string, message: string): HttpError {
  return new HttpError(400, { code, message })
}

function isIpLiteral(hostname: string): boolean {
  return isIP(hostname.replace(/^[[\]]+|[[\]]+$/g, '')) !== 0
}

function isSecureOrigin(scheme: string, hostname: string): boolean {
  if (scheme === 'https') return true
  return scheme === 'http' && (hostname === 'localhost' || hostname.endsWith('.localhost'))
}

function isRegistrableSuffix(hostname: string, rpId: string): boolean {
  return hostname === rpId || hostname.endsWith(`.${rpId}`)
}

function splitOrigin(origin: string): { scheme: string; hostname: string } {
  const separator = origin.indexOf('://')
  if (separator === -1) throw invalid()
  const scheme = origin.slice(0, separator)
  const remainder = origin.slice(separator + 3)
  if (!remainder) throw invalid()

  const host = remainder.split('/', 1)[0] as string
  let hostname: string
  let portPart: string
  if (host.startsWith('[')) {
    const closing = host.indexOf(']')
    if (closing === -1) throw invalid()
    hostname = host.slice(0, closing + 1)
    portPart = host.slice(closing + 1).replace(/^:+/, '')
  } else {
    const colon = host.indexOf(':')
    hostname = colon === -1 ? host : host.slice(0, colon)
    portPart = colon === -1 ? '' : host.slice(colon + 1)
  }
  if (!hostname) throw invalid()
  if (portPart && !/^[+-]?\d+$/.test(portPart.trim())) throw invalid()
  return { scheme: scheme.toLowerCase(), hostname: hostname.toLowerCase() }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function requestOrigin(request: FastifyRequest): string {
  const origin = header(request, 'origin')
  if (origin && origin !== 'null') return origin

  const host = header(request, 'x-forwarded-host') || header(request, 'host')
  if (!host) {
    throw error(
      'passkey_origin_missing',
      'The request did not include an origin, so the passkey domain could not be determined.',
    )
  }
  const forwardedProto = (header(request, 'x-forwarded-proto') ?? '').split(',')[0]?.trim()
  const socket = request.raw.socket as { encrypted?: boolean }
  const scheme = forwardedProto || (socket.encrypted ? 'https' : 'http')
  return `${scheme}://${host}`
}

export function resolveWebAuthnContext(request: FastifyRequest, config: Config): WebAuthnContext {
  const origin = requestOrigin(request)
  const { scheme, hostname } = splitOrigin(origin)

  if (isIpLiteral(hostname)) {
    throw error(
      'passkey_origin_ip',
      'Passkeys cannot be used on an IP address. Open the app on a domain name over HTTPS, or on http://localhost.',
    )
  }
  if (!isSecureOrigin(scheme, hostname)) {
    throw error(
      'passkey_origin_insecure',
      'Passkeys require a secure connection. Open the app over HTTPS, or on http://localhost.',
    )
  }

  const configuredRpId = config.webauthnRpId.trim().toLowerCase()
  let rpId = hostname
  if (configuredRpId) {
    if (!isRegistrableSuffix(hostname, configuredRpId)) {
      throw error(
        'passkey_origin_mismatch',
        `This app is reached at '${hostname}', which is outside the configured passkey domain ` +
          `'${configuredRpId}'. Update WEBAUTHN_RP_ID or open the app on that domain.`,
      )
    }
    rpId = configuredRpId
  }
  return { rpId, origin: config.webauthnOrigin.trim() || origin }
}
