import timezoneData from '../data/timezones.json' with { type: 'json' }

import type { Database } from '../db/client.ts'
import { getAppSetting } from './settings.ts'

const NAMES = new Set<string>(timezoneData.names)

/**
 * `is_valid_timezone`: exactly one of the names the Python backend lists, case included.
 * The list is generated from the pinned tzdata package (`backend/scripts/export_timezones.py`).
 */
export function isValidTimezone(name: string): boolean {
  return NAMES.has(name)
}

/** `timezone_names`: every zone a person can pick, sorted. */
export function timezoneNames(): string[] {
  return [...timezoneData.names]
}

/** `environment_timezone`: `TZ`, else the host zone, else UTC. */
export function environmentTimezone(): string {
  for (const name of [process.env.TZ, Intl.DateTimeFormat().resolvedOptions().timeZone]) {
    if (name && isValidTimezone(name)) return name
  }
  return 'UTC'
}

/** The raw saved application timezone, valid or not, or null when nothing is saved. */
export async function savedTimezoneName(db: Database): Promise<string | null> {
  return (await getAppSetting(db, 'timezone')) || null
}

/** `get_timezone`: the saved zone when it loads, else the environment's. */
export async function applicationTimezone(db: Database): Promise<string> {
  const saved = await savedTimezoneName(db)
  return saved && isValidTimezone(saved) ? saved : environmentTimezone()
}
