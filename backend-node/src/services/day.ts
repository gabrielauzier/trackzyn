import { type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import type { Workspace } from '../db/schema.ts'
import { applicationTimezone } from './timezones.ts'

/** The zone that decides "today" and "this week" for a workspace (AD-004): its own, else the application's. */
export async function dayTimezone(db: Database, workspace: Pick<Workspace, 'timezone'>): Promise<string> {
  return workspace.timezone ?? (await applicationTimezone(db))
}

export interface DaySql {
  /** The instant today started in `tz` (timestamptz). */
  todayStart: SQL
  /** The instant the current week started in `tz`, on Monday (timestamptz; PostgreSQL weeks start on Monday). */
  weekStart: SQL
  /** Today's date in `tz`. */
  today: SQL
}

/** SQL fragments for the day and week boundaries of `now` in `tz`. */
export function daySql(tz: string, now: Date = new Date()): DaySql {
  const instant = sql`${now.toISOString()}::timestamptz`
  return {
    todayStart: sql`date_trunc('day', ${instant}, ${tz})`,
    weekStart: sql`date_trunc('week', ${instant}, ${tz})`,
    today: sql`(${instant} AT TIME ZONE ${tz})::date`,
  }
}
