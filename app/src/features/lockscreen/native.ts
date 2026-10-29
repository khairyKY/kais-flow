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
}

interface LockNative {
  state(): string
  set(nowBar: boolean, dayStrip: boolean): void
  setNames(on: boolean): void
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
