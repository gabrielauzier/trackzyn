import { useEffect, useRef, useState } from 'react'

import { serverNow } from '@/lib/focus/clock'

/** The minute of the day (0..1439) and the day (`YYYY-MM-DD`) of an instant on the wall clock of `timeZone`. */
export interface NowMinute {
  minute: number
  day: string
}

/** Where `at` falls on the wall clock of `timeZone`. */
export function nowMinuteIn(timeZone: string, at: number): NowMinute {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(at))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '0'
  return {
    minute: (Number(part('hour')) % 24) * 60 + Number(part('minute')),
    day: `${part('year')}-${part('month')}-${part('day')}`,
  }
}

/**
 * The current minute in the workspace timezone, by the server's clock (HOJE-04). It renders again only when the
 * minute turns, and calls `onDayChange` with the new day when the day turns (HOJE-70), so the page reads it again.
 */
export function useNowMinute(timeZone: string, onDayChange?: (day: string) => void): NowMinute {
  const [now, setNow] = useState(() => nowMinuteIn(timeZone, serverNow()))
  const onDayChangeRef = useRef(onDayChange)
  useEffect(() => {
    onDayChangeRef.current = onDayChange
  })

  useEffect(() => {
    let day = nowMinuteIn(timeZone, serverNow()).day
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const next = nowMinuteIn(timeZone, serverNow())
      setNow((current) => (current.minute === next.minute && current.day === next.day ? current : next))
      if (next.day !== day) {
        day = next.day
        onDayChangeRef.current?.(next.day)
      }
      // Every timezone in use turns its minutes with UTC's, so the next turn is at the next whole minute.
      timer = setTimeout(tick, 60_000 - (serverNow() % 60_000))
    }
    tick()
    return () => clearTimeout(timer)
  }, [timeZone])

  return now
}
