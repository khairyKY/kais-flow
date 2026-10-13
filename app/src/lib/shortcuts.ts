import type { ShortcutEntry } from './pageShortcutsStore'

// F3 (punch 12): the cheatsheet lists ONLY keys that work. Removed as fiction:
// `g` Go-to (D-5: folded into ⌘K), the Navigate section (t/i/u — never bound),
// ~~the Calendar section (no keydown listener exists)~~ (back 2026-10-13, p7e A4: the keys are
// bound now — CALENDAR_SHORTCUTS), Inbox's f/x rows (code binds e/d), and the command bar's `//`
// note syntax (never parsed).
/** Always-on bindings, regardless of page — rendered by the `?` cheatsheet's first section. */
export const GLOBAL_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['⌘/Ctrl', 'K'], label: 'Command bar' },
  { keys: ['⌘/Ctrl', '/'], label: 'Search' },
  { keys: ['⌘/Ctrl', 'J'], label: 'Chat' },
  { keys: ['n'], label: 'New task' },
  { keys: ['?'], label: 'This cheatsheet' },
  { keys: ['Esc'], label: 'Close overlay' },
]

/** Inbox triage keys — static data so the cheatsheet's Inbox section can render even when
 * the page itself isn't mounted. MUST mirror InboxPage's real bindings (e/d/s/↵ + list nav). */
export const INBOX_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['↑/↓', 'j/k'], label: 'Move focus' },
  { keys: ['e'], label: 'File with AI suggestion' },
  { keys: ['d'], label: 'Dismiss' },
  { keys: ['s'], label: 'Snooze' },
  { keys: ['↵'], label: 'Edit title' },
]

/** The `?` cheatsheet's own copy of the Tasks list-nav keys (mirrors `LIST_SHORTCUTS` in
 * features/tasks/listShortcuts.ts) plus the two generic list behaviors (focus move, open
 * detail) that aren't bindable actions of their own — static so the cheatsheet's Task list
 * section always renders, same as Inbox above. */
export const TASK_LIST_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['j', 'k'], label: 'Move focus' },
  { keys: ['e', 'Space'], label: 'Complete' },
  { keys: ['↵'], label: 'Open detail' },
  { keys: ['t'], label: 'Toggle Top 3' },
  { keys: ['1', '2', '3'], label: 'Today · Tmrw · Next wk' },
  { keys: ['p'], label: 'Move to…' },
  { keys: ['x'], label: 'Select (multi)' },
  { keys: ['#'], label: 'Delete' },
]

/** Focus moves on every list (useListKeys), whatever its page binds. */
export const LIST_NAV: ShortcutEntry = { keys: ['j', 'k'], label: 'Move focus' }

/** The task lists' keys that aren't bindings of their own: select all (useSelectAllKey) and Today's
 * Top 3 order (Alt+↑/↓) — shown with whatever a task list page registered. */
export const LIST_EXTRAS: ShortcutEntry[] = [
  { keys: ['⌘/Ctrl', 'A'], label: 'Select all' },
  { keys: ['⌥/Alt', '↑/↓'], label: 'Reorder Top 3 (Today)' },
]

/** Said under the task keys: T, E, 1/2/3 and # act on the whole selection when there is one. */
export const SELECTION_NOTE = 'With a selection, keys act on all selected.'

/** A binding's key as its keycap: the space bar and Enter read as words / the return glyph. */
export const keyCap = (key: string): string => (key === ' ' ? 'Space' : key === 'Enter' ? '↵' : key)

/** The Calendar page's keys (p7e A4) — static so the cheatsheet's Calendar section always renders.
 * MUST mirror CalendarPage's key handler, BlockMenu's ⌫ and CalendarGrid's ⌘/Ctrl-click. Overlays.dc.html
 * and Tour 14k-3 draw the first rows (D W M · ← → · T); Akiflow's 1–7, - =, 0 and the rest join them. */
export const CALENDAR_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['d', 'w', 'm'], label: 'Day · Week · Month' },
  { keys: ['1', '2–6', '7'], label: '1 day · 2–6 days · Week' },
  { keys: ['←/→', '-/='], label: 'Previous · next' },
  { keys: ['t'], label: 'Jump to today' },
  { keys: ['0'], label: 'Fold the planning rail' },
  { keys: ['⌘/Ctrl', 'click'], label: 'New task in that slot' },
  { keys: ['⌫'], label: 'Delete the open event' },
]

/** Command bar's own inline capture syntax — static so the cheatsheet's Command bar section always renders. */
export const COMMAND_BAR_SHORTCUTS: ShortcutEntry[] = [
  // Enter is the one capture path (Kai 2026-10-12 cut ⌘↵ "AI capture" — the AI fills every capture after it lands).
  { keys: ['↵'], label: 'Quick add' },
  { keys: ['!'], label: 'Priority (! !! !!!)' },
  { keys: ['#'], label: 'Project' },
  { keys: ['↓', '↵'], label: 'Jump to typed view' },
]

const MODIFIER_GLYPHS = '⌘⌃⌥⇧'

/** J-17: a compact hint string → one keycap per key. Each leading modifier glyph gets its own
 * cap and the remainder is one cap: `'⌘K'` → `['⌘', 'K']`, `'⌃click'` → `['⌃', 'click']`,
 * `'E'` → `['E']`. A lone glyph (`'⌘'`) stays a single cap. */
export function splitKeyCombo(combo: string): string[] {
  const keys: string[] = []
  let i = 0
  while (i < combo.length - 1 && MODIFIER_GLYPHS.includes(combo[i])) keys.push(combo[i++])
  keys.push(combo.slice(i))
  return keys
}
