import { useMemo } from 'react'
import { useMinuteClock } from '../../lib/minuteClock'

/** The current time, refreshed every minute — enough for "Now" to arrive and leave on time, and
 * for the Day card to turn at 12:00 / 17:00 / 18:00 without a reload. Owned by the small parts
 * that read the clock (Up next, the Day card), so the whole page doesn't re-render each minute.
 * Ticks on the minute, from the app's one minute clock (lib/minuteClock). */
export function useMinuteNow(): Date {
  const now = useMinuteClock((s) => s.now)
  return useMemo(() => new Date(now), [now])
}
