import { useEffect, useState } from 'react'

/** The current time, refreshed every minute — enough for "Now" to arrive and leave on time, and
 * for the Day card to turn at 12:00 / 17:00 / 18:00 without a reload. Owned by the small parts
 * that read the clock (Up next, the Day card), so the whole page doesn't re-render each minute. */
export function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
