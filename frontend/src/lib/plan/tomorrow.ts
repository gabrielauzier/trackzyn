import { addDays, dayOf } from '@/lib/agenda/layout'

/** The page of the plan of tomorrow in the workspace's timezone: `Planejar amanhã` (PLAN-01). */
export const tomorrowPath = (timezone: string, now = new Date()) => `/planejar/${addDays(dayOf(now, timezone), 1)}`

/** The page of the plan of today in the workspace's timezone: where `/planejar` opens (PLAN-30, PLAN-D5). */
export const todayPath = (timezone: string, now = new Date()) => `/planejar/${dayOf(now, timezone)}`
