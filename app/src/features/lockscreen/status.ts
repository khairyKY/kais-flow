// v161 (Kai on v1.6.0: "the Samsung lock screen widgets are not working", no device to look at): Settings →
// Notifications → This phone → Lock screen status. For each of the three, in plain words, whether it's on the
// lock screen now and, if not, the first thing in the way, with the system screen that fixes it. Pure: the
// shell's facts in (./native LockState, LockScreen.LockBridge.state), lines out.
import type { LockOpen, LockState } from './native'

export interface LockLine {
  id: 'top3' | 'nowbar' | 'strip'
  name: string
  ok: boolean
  text: string
  open?: LockOpen
}

const WAIT = 'Nothing to show until 2h before your next block'

/** What stops any notification reaching the lock screen (the Now Bar and the Day strip alike). */
function blocked(st: LockState): Pick<LockLine, 'text' | 'open'> | null {
  if (st.notifications === false) return { text: 'Notifications are turned off for Kai’s Flow', open: 'notifications' }
  if (st.channel === 0) return { text: 'The “Lock screen” notifications are turned off for Kai’s Flow', open: 'channel' }
  if (st.lock === false) return { text: 'This phone shows no notifications on the lock screen', open: 'lockscreen' }
  return null
}

/** Not showing yet: when it will (`time` formats an epoch ms on the user's clock). */
function waiting(st: LockState, time: (ms: number) => string): string | null {
  if (st.showing !== false) return null
  return st.showFrom ? `${WAIT} (from ${time(st.showFrom)})` : `${WAIT} — none left today`
}

export function lockStatus(st: LockState, time: (ms: number) => string): LockLine[] {
  const top3: LockLine = st.widget
    ? { id: 'top3', name: 'Top 3 widget', ok: true, text: 'On your lock screen' }
    : { id: 'top3', name: 'Top 3 widget', ok: false, text: 'Not added in LockStar yet (the steps are above)' }

  const nowbar = ((): LockLine => {
    const line = (ok: boolean, text: string, open?: LockOpen): LockLine => ({ id: 'nowbar', name: 'Now Bar', ok, text, open })
    if (!st.nowBarSupported) return line(false, `Android 16 needed (this phone: ${st.release || st.sdk})`)
    if (!st.nowBar) return line(false, 'Off: turn on “Lock screen: Now Bar” above')
    const b = blocked(st)
    if (b) return line(false, b.text, b.open)
    if (st.promote === false) return line(false, 'Live notifications are turned off for Kai’s Flow', 'promotion')
    const w = waiting(st, time)
    if (w) return line(false, w)
    if (st.promoted === false) {
      return line(false, 'Showing in the notifications, but not as a Live notification. On a Galaxy, also turn on Developer options › Live notifications for all apps', 'promotion')
    }
    return line(true, 'In the Now Bar now')
  })()

  const strip = ((): LockLine => {
    const line = (ok: boolean, text: string, open?: LockOpen): LockLine => ({ id: 'strip', name: 'Day strip', ok, text, open })
    if (!st.dayStrip) return line(false, 'Off: turn on “Lock screen: Day strip notification” above')
    const b = blocked(st)
    if (b) return line(false, b.text, b.open)
    // The channel is silent only if someone lowered it (v161 made it default importance, never sounding).
    if (st.channel != null && st.channel > 0 && st.channel < 3 && st.lockSilent === false) return line(false, 'Lock screen hides silent notifications', 'lockscreen')
    const w = waiting(st, time)
    if (w) return line(false, w)
    return line(true, 'On the lock screen now. Only an icon there? Set Lock screen notifications to Cards', 'lockscreen')
  })()

  return [top3, nowbar, strip]
}

/** The shell can say (v161 and later); v1.6.0's says only the switches. */
export function hasStatus(st: LockState | null): st is LockState {
  return !!st && typeof st.notifications === 'boolean'
}
