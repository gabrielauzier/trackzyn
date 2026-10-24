import { eq } from 'drizzle-orm'
import type { Config } from '../config.ts'
import type { Database } from '../db/client.ts'
import { appSettings } from '../db/schema.ts'

export async function getAppSetting(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  return row?.value ?? null
}

export async function isRegistrationEnabled(db: Database, config: Config): Promise<boolean> {
  const saved = await getAppSetting(db, 'registration_enabled')
  if (saved !== null) return saved.toLowerCase() === 'true'
  return config.registrationEnabled
}

export async function setAppSetting(db: Database, key: string, value: string): Promise<{ key: string; value: string }> {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
  return { key, value }
}

export async function deleteAppSetting(db: Database, key: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key))
}

async function choice(db: Database, key: string, allowed: string[]): Promise<string> {
  const saved = await getAppSetting(db, key)
  return saved !== null && allowed.includes(saved) ? saved : 'auto'
}

export const NUMBER_FORMATS = ['auto', 'comma_dot', 'dot_comma', 'space_comma']
export const DATE_FORMATS = ['auto', 'dmy', 'mdy', 'ymd']

export const getNumberFormat = (db: Database) => choice(db, 'number_format', NUMBER_FORMATS)
export const getDateFormat = (db: Database) => choice(db, 'date_format', DATE_FORMATS)
