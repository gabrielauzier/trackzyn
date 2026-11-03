import { Secret, TOTP } from 'otpauth'

/** 20 random bytes in unpadded base32: 32 characters, what `pyotp.random_base32()` stores. */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}

function totpFor(secret: string): TOTP {
  return new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 })
}

/** Accepts the current 30 s window and the one on each side, like `valid_window=1`. */
export function verifyTotp(secret: string, code: string): boolean {
  try {
    return totpFor(secret).validate({ token: code, window: 1 }) !== null
  } catch {
    return false
  }
}

export function provisioningUri(secret: string, email: string, issuer: string): string {
  const totp = new TOTP({
    issuer,
    label: email,
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  return totp.toString()
}
