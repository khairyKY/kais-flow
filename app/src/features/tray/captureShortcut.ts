import { native } from './native'

// Settings → Quick capture shortcut — this device only (src-tauri/src/capture.rs registers it). The default
// is Ctrl+Shift+K (⌘⇧K): a GLOBAL Ctrl+K would take Ctrl+K from every browser, Slack and editor. Ctrl+K is
// still a choice, for anyone who wants it everywhere.

export type CaptureShortcut = 'ctrl-shift-k' | 'ctrl-alt-k' | 'ctrl-k' | 'off'
export const DEFAULT_SHORTCUT: CaptureShortcut = 'ctrl-shift-k'
const KEY = 'kf_capture_shortcut'

const ACCEL: Record<CaptureShortcut, string> = {
  'ctrl-shift-k': 'CommandOrControl+Shift+K',
  'ctrl-alt-k': 'CommandOrControl+Alt+K',
  'ctrl-k': 'CommandOrControl+K',
  off: '',
}

/** How a choice reads on this computer: Ctrl+Shift+K, or ⌘⇧K on a Mac. */
export function shortcutLabel(s: CaptureShortcut, mac: boolean): string {
  if (s === 'off') return 'Off'
  const keys = s === 'ctrl-shift-k' ? ['Shift'] : s === 'ctrl-alt-k' ? ['Alt'] : []
  if (!mac) return ['Ctrl', ...keys, 'K'].join('+')
  return '⌘' + keys.map((k) => (k === 'Shift' ? '⇧' : '⌥')).join('') + 'K'
}

export function readCaptureShortcut(): CaptureShortcut {
  try {
    const v = localStorage.getItem(KEY)
    return v && v in ACCEL ? (v as CaptureShortcut) : DEFAULT_SHORTCUT
  } catch {
    return DEFAULT_SHORTCUT
  }
}

/** Tells the app to register `s` (writing it down first). False when another app already has that
 * shortcut (the previous one stays) — and outside the desktop app, where there is nothing to register. */
export async function writeCaptureShortcut(s: CaptureShortcut): Promise<boolean> {
  const ok = await native<boolean>('capture_shortcut', { accel: ACCEL[s] })
  if (ok === undefined) return false
  if (ok) {
    try {
      localStorage.setItem(KEY, s)
    } catch {
      /* this session only */
    }
  }
  return ok
}

/** On start: what this device chose (Rust begins on the default). */
export function applyCaptureShortcut(): void {
  void native('capture_shortcut', { accel: ACCEL[readCaptureShortcut()] })
}
