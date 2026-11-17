import { useEffect } from 'react'
import { useAppSettings } from '../../lib/settings'
import { QUIET_FROM, QUIET_TO } from '../../../../supabase/functions/notify/copy.ts'
import { lockNames, lockQuiet } from './native'

/** Tells the Android shell whether the lock screen may show names (Settings → Notifications → Show task
 * names on the lock screen, synced) and the quiet hours. Mounted once in the Android app; draws nothing. */
export function LockScreenSync(): null {
  const { data: s } = useAppSettings()
  const on = s?.lock_screen_names === true
  const known = !!s
  useEffect(() => {
    if (known) lockNames(on)
  }, [known, on])
  // Now / Next is off in the app's quiet hours (the same window the reminders use).
  const quietOn = s?.quiet_hours_on !== false
  const from = (s?.quiet_from ?? QUIET_FROM).slice(0, 5)
  const to = (s?.quiet_to ?? QUIET_TO).slice(0, 5)
  useEffect(() => {
    if (known) lockQuiet(quietOn, from, to)
  }, [known, quietOn, from, to])
  return null
}
