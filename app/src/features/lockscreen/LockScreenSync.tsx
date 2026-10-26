import { useEffect } from 'react'
import { useAppSettings } from '../../lib/settings'
import { lockNames } from './native'

/** Tells the Android shell whether the lock screen may show names (Settings → Notifications → Show task
 * names on the lock screen, synced). Mounted once in the Android app; draws nothing. */
export function LockScreenSync(): null {
  const { data: s } = useAppSettings()
  const on = s?.lock_screen_names === true
  const known = !!s
  useEffect(() => {
    if (known) lockNames(on)
  }, [known, on])
  return null
}
