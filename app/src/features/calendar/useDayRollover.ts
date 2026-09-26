import { useEffect, useRef, useState } from 'react'
import { dayStamp, msUntilNextDay } from './gridClock'

/** Polish F2b (conductor decision 2026-09-26: "roll 'today' over at Cairo midnight automatically").
 *
 * Returns the current day stamp (gridClock.dayStamp), which changes when a new day starts, and
 * calls `onRollover(previous)` right then, with the moment of the check before it (a time on the
 * day that just ended). Two ways in:
 *   · a timer set for the next Cairo midnight (gridClock.msUntilNextDay), re-armed every day;
 *   · `visibilitychange` back to visible — a background tab's timers are throttled or frozen, and
 *     a laptop that slept through midnight never ran one at all.
 */
export function useDayRollover(onRollover?: (previous: Date) => void): string {
  const [stamp, setStamp] = useState(() => dayStamp(new Date()))
  const callback = useRef(onRollover)
  useEffect(() => {
    callback.current = onRollover
  })

  useEffect(() => {
    let last = new Date()
    let timer = 0
    const check = () => {
      const now = new Date()
      const previous = last
      last = now
      if (dayStamp(now) === dayStamp(previous)) return
      setStamp(dayStamp(now))
      callback.current?.(previous)
    }
    const arm = () => {
      window.clearTimeout(timer)
      // +1s so the new day has certainly begun; if a timer still fires early, check() finds the
      // same day and arm() waits out the remainder.
      timer = window.setTimeout(() => {
        check()
        arm()
      }, msUntilNextDay(new Date()) + 1000)
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      check()
      arm()
    }
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return stamp
}
