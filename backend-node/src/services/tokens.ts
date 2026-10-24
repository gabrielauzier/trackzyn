import { SignJWT, jwtVerify } from 'jose'
import type { Config } from '../config.ts'

const ACCESS_AUDIENCE = 'fastapi-users:auth'
const ALGORITHM = 'HS256'

const keyOf = (config: Config) => new TextEncoder().encode(config.secretKey)

/** The access token fastapi-users issues: HS256, `sub` = user id, `aud` = ["fastapi-users:auth"], `exp`. */
export async function writeAccessToken(config: Config, userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + config.accessTokenExpireMinutes * 60
  return new SignJWT({ aud: [ACCESS_AUDIENCE] })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(userId)
    .setExpirationTime(exp)
    .sign(keyOf(config))
}

/** The user id inside a valid access token, or null for anything else. */
export async function readAccessToken(config: Config, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, keyOf(config), {
      algorithms: [ALGORITHM],
      audience: ACCESS_AUDIENCE,
    })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

const RESET_AUDIENCE = 'fastapi-users:reset'

export interface ResetTokenClaims {
  sub: string
  passwordFingerprint: string
}

/** Reads a password-reset token. No endpoint issues one (the Python backend sends none either). */
export async function readResetToken(config: Config, token: string): Promise<ResetTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyOf(config), { algorithms: [ALGORITHM], audience: RESET_AUDIENCE })
    const fingerprint = payload.password_fgpt
    if (typeof payload.sub !== 'string' || typeof fingerprint !== 'string') return null
    return { sub: payload.sub, passwordFingerprint: fingerprint }
  } catch {
    return null
  }
}
