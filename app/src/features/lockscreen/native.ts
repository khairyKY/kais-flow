// Kai's Flow on the Android lock screen (lockscreen, 2026-10-26): the shell's `window.KaisFlowLock`
// (native/android/java/.../widgets/LockScreen.java). The Now Bar (an Android 16 Live Update), the Day
// strip notification and the Top 3 lock widget are drawn natively from the widgets' snapshot; the page
// only switches them per device (Settings → Notifications → This phone) and says whether names show.
// Everywhere else (the web, an APK from before this): undefined, and nothing shows.

export interface LockState {
  sdk: number
  nowBarSupported: boolean
  nowBar: boolean
  dayStrip: boolean
  // v161 (Settings → Lock screen status; absent on v1.6.0's shell). LockScreen.LockBridge.state says what each is.
  release?: string
  notifications?: boolean
  /** The Lock screen channel's importance (0 off, 2 silent, 3 default); -1 not made. */
  channel?: number
  /** Live notifications allowed for the app (Android 16+ only). */
  promote?: boolean
  /** The lock screen shows notifications / silent ones; null when the phone won't say. */
  lock?: boolean | null
  lockSilent?: boolean | null
  /** The Top 3 lock widget is placed (LockStar). */
  widget?: boolean
  showing?: boolean
  /** When it next shows today (epoch ms; 0: nothing else today). */
  showFrom?: number
  nowBarPosted?: boolean
  stripPosted?: boolean
  /** The posted Now Bar is a Live Update (Android 16+, while posted; else null). */
  promoted?: boolean | null
}

/** The system screens Lock screen status opens (LockScreen.LockBridge.open). */
export type LockOpen = 'promotion' | 'notifications' | 'channel' | 'lockscreen'

interface LockNative {
  state(): string
  set(nowBar: boolean, dayStrip: boolean): void
  setNames(on: boolean): void
  open?(which: LockOpen): void
}

const lockNative = (): LockNative | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { KaisFlowLock?: LockNative }).KaisFlowLock)

/** The Android shell has the lock screen (an APK from before it doesn't). */
export function lockAvailable(): boolean {
  return !!lockNative()
}

export function readLock(): LockState | null {
  try {
    const raw = lockNative()?.state()
    return raw ? (JSON.parse(raw) as LockState) : null
  } catch {
    return null
  }
}

export function writeLock(nowBar: boolean, dayStrip: boolean): void {
  lockNative()?.set(nowBar, dayStrip)
}

/** "Show task names on the lock screen" (the reminders' switch) applies to the lock screen's own too. */
export function lockNames(on: boolean): void {
  try {
    lockNative()?.setNames(on)
  } catch {
    /* an older shell */
  }
}

/** Opens a system settings screen for a fix (an older shell: nothing). */
export function openLockSettings(which: LockOpen): void {
  try {
    lockNative()?.open?.(which)
  } catch {
    /* an older shell */
  }
}
