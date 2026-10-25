// Tray menu B's rows (Calendar extras options.html §5, Kai's pick): the native menu's rows (12d), drawn
// in our kit. Pure and light — the menu window loads this, not the app. The ids are tray.rs menu_event's.

/** What only the main window knows, handed over by tray.rs (TrayBridge → `tray_menu`). */
export interface TrayMenuState {
  /** The app is signed in and its shell is up (TrayBridge mounted): its actions can run. */
  signedIn: boolean
  /** What's on now or next today: "Next · المغرب · 6:15 PM" (at = the start; while it runs, the end). */
  next?: { now: boolean; title: string; at: string } | null
  /** Notifications are paused until this clock time. */
  pausedUntil?: string | null
}

export const SIGNED_OUT: TrayMenuState = { signedIn: false }

/** The focus round as the menu shows it (from the main window's timer, ./focusMirror). */
export interface MenuFocus {
  /** Under way (running, or paused part-way): the row stops it. */
  on: boolean
  /** "18:42" left, or the round's length "25:00". */
  time: string
}

export type MenuIcon = 'open' | 'pen' | 'focus-ring' | 'stop' | 'bell' | 'settings' | 'signout' | 'clock' | 'moon' | 'back'

export interface MenuRow {
  id: string
  label: string
  icon: MenuIcon
  hint?: string
  danger?: boolean
  /** Opens the Pause submenu. */
  sub?: boolean
}

export type MenuLine = MenuRow | 'sep'

const OPEN: MenuRow = { id: 'open', label: 'Open Kai’s Flow', icon: 'open' }
const QUIT: MenuRow = { id: 'quit', label: 'Quit Kai’s Flow', icon: 'signout' }

/** Signed out, only Open and Quit — the rest run in the signed-in app. */
export function menuRows(s: TrayMenuState, focus: MenuFocus): MenuLine[] {
  if (!s.signedIn) return [OPEN, 'sep', QUIT]
  return [
    OPEN,
    { id: 'capture', label: 'Quick capture…', icon: 'pen' },
    'sep',
    focus.on ? { id: 'focus', label: 'Stop focus', icon: 'stop', hint: focus.time, danger: true } : { id: 'focus', label: 'Start focus', icon: 'focus-ring', hint: focus.time },
    s.pausedUntil ? { id: 'resume', label: 'Resume notifications', icon: 'bell', hint: `until ${s.pausedUntil}` } : { id: 'pause', label: 'Pause notifications', icon: 'bell', sub: true },
    'sep',
    { id: 'settings', label: 'Settings', icon: 'settings' },
    QUIT,
  ]
}

/** Pause ▸ (TrayBridge's `pause:<choice>`, trayState pauseUntil). */
export const PAUSE_ROWS: MenuRow[] = [
  { id: 'pause:30', label: '30 minutes', icon: 'clock' },
  { id: 'pause:60', label: '1 hour', icon: 'clock' },
  { id: 'pause:tomorrow', label: 'Until tomorrow', icon: 'moon' },
]

/** The page's state from tray.rs; anything unreadable is signed out (Open and Quit still work). */
export function parseMenuState(raw: unknown): TrayMenuState {
  try {
    const s = (typeof raw === 'string' ? JSON.parse(raw) : raw) as TrayMenuState | null
    return s && typeof s === 'object' && typeof s.signedIn === 'boolean' ? s : SIGNED_OUT
  } catch {
    return SIGNED_OUT
  }
}

/** The next row for ↑/↓ (wrapping), Home/End; `at` is the current index, -1 for none. */
export function moveFocus(at: number, count: number, key: string): number {
  if (count === 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return at < 0 ? 0 : (at + 1) % count
  if (key === 'ArrowUp') return at < 0 ? count - 1 : (at - 1 + count) % count
  return at
}
