import { sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import type { SeriesFreq, TaskKind } from '../db/schema.ts'
import { type RecurrenceRule, nextOccurrence } from './recurrence.ts'
import { applyDueSchedules, workspaceClock } from './schedule.ts'
import type { seriesView } from './series.ts'

type PendingColumn = 'backlog' | 'this_week' | 'today'
// SPEC_DEVIATION: the design types the list color as a string; it is the list's palette index (a number).
// Reason: lists store `color` as a smallint, and the sessions of the Agenda already answer it as a number.
type ListView = { id: string; name: string; color: number }
type RuleView = ReturnType<typeof seriesView>['rule']

/** A pending task scheduled in the period, as the Agenda draws it (US-5, US-14). */
export interface ScheduledTask {
  id: string
  title: string
  list: ListView
  column: PendingColumn
  position: number
  estimate_minutes: number | null
  scheduled_on: string
  scheduled_time: string | null
  /** The live series the task is the open occurrence of. */
  series: { id: string; rule: RuleView } | null
  /** A reminder with a time is drawn as a marker, without a duration (REM-06). */
  kind: TaskKind
}

/** A future occurrence of a series, computed from its rule and never stored (US-11, D14). */
export interface ProjectedOccurrence {
  series_id: string
  /** The open occurrence, which a click on the projection opens. */
  task_id: string
  title: string
  list: ListView
  on: string
  time: string
  estimate_minutes: number | null
  // SPEC_DEVIATION: the design leaves the rule out of a projection; it carries it.
  // Reason: the tooltip of a projection says the rule (`Repete toda sexta`, US-11), and the open occurrence it
  // comes from may sit outside the period, so the Agenda has no other place to read it.
  rule: RuleView
}

export interface Scheduled {
  timed: ScheduledTask[]
  untimed: ScheduledTask[]
  projected: ProjectedOccurrence[]
}

interface Row {
  id: string
  title: string
  list_id: string
  list_name: string
  list_color: number
  column: PendingColumn
  position: number
  estimate_minutes: number | null
  scheduled_on: string
  scheduled_time: string | null
  series_id: string | null
  series_freq: SeriesFreq | null
  series_interval: number | null
  series_weekdays: number[] | null
  series_month_day: number | null
  series_until: string | null
  series_count: number | null
  series_created_count: number | null
  series_time: string | null
  kind: TaskKind
}

const COLUMN_ORDER: Record<PendingColumn, number> = { today: 0, this_week: 1, backlog: 2 }

/**
 * What the Agenda shows of the period `from`..`to` (`YYYY-MM-DD`, both included), for the whole workspace (D9):
 * the pending tasks scheduled in it, `timed` in order of day and time and `untimed` in the order of the board
 * (Today, This week, Backlog, then position), and the future occurrences of each live series that has a time
 * (D14, D27). Projections start after the open occurrence and after today, as the next occurrence would
 * (D17), and stop at `until` or `count`. Done tasks and archived lists are left out. Applies the due schedules
 * first (AD-009).
 */
export async function listScheduled(db: Database, workspaceId: string, from: string, to: string, now: Date = new Date()): Promise<Scheduled> {
  await applyDueSchedules(db, workspaceId, now)
  const found = (
    (await db.execute(sql`
      SELECT t.id, t.title, l.id AS list_id, l.name AS list_name, l.color AS list_color, t."column", t.position,
             t.estimate_minutes, t.scheduled_on::text AS scheduled_on, to_char(t.scheduled_time, 'HH24:MI') AS scheduled_time,
             ts.id AS series_id, ts.freq AS series_freq, ts."interval" AS series_interval, ts.weekdays AS series_weekdays,
             ts.month_day AS series_month_day, ts.until::text AS series_until, ts."count" AS series_count,
             ts.created_count AS series_created_count, to_char(ts."time", 'HH24:MI') AS series_time, t.kind
      FROM tasks t
      JOIN lists l ON l.id = t.list_id
      LEFT JOIN task_series ts ON ts.id = t.series_id AND ts.ended_at IS NULL
      WHERE l.workspace_id = ${workspaceId} AND NOT l.is_archived AND t."column" <> 'done' AND t.scheduled_on IS NOT NULL
        AND (t.scheduled_on BETWEEN ${from}::date AND ${to}::date OR (ts.id IS NOT NULL AND ts."time" IS NOT NULL))
      ORDER BY t.scheduled_on, t.scheduled_time NULLS FIRST, t.position, t.created_at`)) as unknown as { rows: Row[] }
  ).rows

  const list = (row: Row): ListView => ({ id: row.list_id, name: row.list_name, color: row.list_color })
  const rule = (row: Row): RecurrenceRule => ({
    freq: row.series_freq!,
    interval: row.series_interval!,
    weekdays: row.series_weekdays,
    monthDay: row.series_month_day,
    until: row.series_until,
    count: row.series_count,
  })
  const ruleView = (row: Row): RuleView => ({
    freq: row.series_freq!,
    interval: row.series_interval!,
    weekdays: row.series_weekdays,
    month_day: row.series_month_day,
    until: row.series_until,
    count: row.series_count,
  })
  const view = (row: Row): ScheduledTask => ({
    id: row.id,
    title: row.title,
    list: list(row),
    column: row.column,
    position: row.position,
    estimate_minutes: row.estimate_minutes,
    scheduled_on: row.scheduled_on,
    scheduled_time: row.scheduled_time,
    series:
      row.series_id === null ? null : { id: row.series_id, rule: ruleView(row) },
    kind: row.kind,
  })

  const inPeriod = found.filter((row) => row.scheduled_on >= from && row.scheduled_on <= to)
  const timed = inPeriod.filter((row) => row.scheduled_time !== null).map(view)
  const untimed = inPeriod
    .filter((row) => row.scheduled_time === null)
    .sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on) || COLUMN_ORDER[a.column] - COLUMN_ORDER[b.column] || a.position - b.position)
    .map(view)

  const { today } = await workspaceClock(db, workspaceId, now)
  const projected: ProjectedOccurrence[] = []
  for (const row of found) {
    if (row.series_id === null || row.series_time === null) continue
    const seriesRule = rule(row)
    // The open occurrence is the series' created_count-th; each projection would be one more.
    let created = row.series_created_count!
    let day = nextOccurrence(seriesRule, row.scheduled_on, today, created)
    while (day !== null && day <= to) {
      if (day >= from) {
        projected.push({
          series_id: row.series_id,
          task_id: row.id,
          title: row.title,
          list: list(row),
          on: day,
          time: row.series_time,
          estimate_minutes: row.estimate_minutes,
          rule: ruleView(row),
        })
      }
      created += 1
      day = nextOccurrence(seriesRule, day, day, created)
    }
  }
  projected.sort((a, b) => a.on.localeCompare(b.on) || a.time.localeCompare(b.time))
  return { timed, untimed, projected }
}
