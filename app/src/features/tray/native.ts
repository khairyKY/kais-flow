// The Windows app's own commands (src-tauri/src/tray.rs), through the bridge Tauri injects — the
// lib/appUpdate.ts pattern, no @tauri-apps/api. Everywhere else these are no-ops.

type Bridge = { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> }

function bridge(): Bridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { __TAURI_INTERNALS__?: Bridge }).__TAURI_INTERNALS__
}

/** True inside the Windows app (Tauri). */
export function isTauri(): boolean {
  return !!bridge()
}

/** Runs a tray.rs command; resolves undefined outside the Windows app or if it fails. */
export async function native<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try {
    return (await bridge()?.invoke(cmd, args)) as T | undefined
  } catch {
    return undefined
  }
}

const TRAY_KEY = 'kf_tray_shown'

/** Settings → Show in the system tray — this device only (on unless turned off). */
export function readTrayShown(): boolean {
  try {
    return localStorage.getItem(TRAY_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeTrayShown(shown: boolean): void {
  try {
    localStorage.setItem(TRAY_KEY, shown ? '1' : '0')
  } catch {
    /* this session only */
  }
  void native('tray_shown', { shown })
}
