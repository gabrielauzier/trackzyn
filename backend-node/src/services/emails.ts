/**
 * Normalises an address like pydantic's EmailStr (email-validator): the domain is lower-cased,
 * the local part is kept. Lookups are case-insensitive either way.
 */
export function normalizeEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 0) return email
  return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`
}
