import { Algorithm, hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'
import bcrypt from 'bcryptjs'

// What pwdlib's Argon2Hasher (argon2-cffi defaults) writes: $argon2id$v=19$m=65536,t=3,p=4$...
const ARGON2 = { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

export function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2)
}

function argon2NeedsRehash(hash: string): boolean {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hash)
  if (!match) return true
  return (
    Number(match[1]) !== ARGON2.memoryCost ||
    Number(match[2]) !== ARGON2.timeCost ||
    Number(match[3]) !== ARGON2.parallelism
  )
}

export interface PasswordCheck {
  valid: boolean
  /** A stronger hash to store in place of the one that was just verified, when there is one. */
  updatedHash: string | null
}

/**
 * Verifies against an argon2 or a bcrypt hash and, like pwdlib's `verify_and_update`, offers a
 * fresh argon2 hash whenever the stored one is bcrypt or uses other argon2 parameters.
 */
export async function verifyAndUpdate(password: string, stored: string): Promise<PasswordCheck> {
  if (stored.startsWith('$argon2')) {
    const valid = await argon2Verify(stored, password).catch(() => false)
    return { valid, updatedHash: valid && argon2NeedsRehash(stored) ? await hashPassword(password) : null }
  }
  if (/^\$2[aby]\$/.test(stored)) {
    const valid = await bcrypt.compare(password, stored).catch(() => false)
    return { valid, updatedHash: valid ? await hashPassword(password) : null }
  }
  return { valid: false, updatedHash: null }
}
