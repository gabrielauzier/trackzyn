import { addDays, dayOf } from '@/lib/agenda/layout'

/** The page of the plan of tomorrow in the workspace's timezone (PLAN-01, PLAN-D5). */
export const tomorrowPath = (timezone: string, now = new Date()) => `/planejar/${addDays(dayOf(now, timezone), 1)}`
