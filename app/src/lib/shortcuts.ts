import type { ShortcutEntry } from './pageShortcutsStore'

// F3 (punch 12): the cheatsheet lists ONLY keys that work. Removed as fiction:
// `g` Go-to (D-5: folded into ⌘K), the Navigate section (t/i/u — never bound),
// the Calendar section (no keydown listener exists), Inbox's f/x rows (code binds
// e/d), and the command bar's `//` note syntax (never parsed — real since P7e A6, 2026-10-13).
// P7e A7 (2026-10-13): i and u are bound now, in the shell (AppLayout); t stays Top 3.
/** Always-on bindings, regardless of page — rendered by the `?` cheatsheet's first section. */
export const GLOBAL_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['⌘/Ctrl', 'K'], label: 'Command bar' },
  { keys: ['/'], label: 'Search' },
  { keys: ['⌘/Ctrl', '/'], label: 'Search, even mid-typing' },
  { keys: ['⌘/Ctrl', 'J'], label: 'Chat' },
  { keys: ['⌘/Ctrl', 'Z'], label: 'Undo the last action' },
  { keys: ['⌘/Ctrl', ','], label: 'Settings' },
  { keys: ['i'], label: 'Go to Inbox' },
  { keys: ['u'], label: 'Go to Upcoming' },
  { keys: ['n'], label: 'New task' },
  { keys: ['?'], label: 'This cheatsheet' },
  { keys: ['Esc'], label: 'Close overlay' },
]

/** A binding's key as its keycap: the space bar and Enter read as words / the return glyph. */
export const keyCap = (key: string): string => (key === ' ' ? 'Space' : key === 'Enter' ? '↵' : key)

/** Inbox triage keys: InboxPage dispatches on these (one entry per action) and the cheatsheet lists
 * the same table, so the two can't drift (A31). Space and p are P7e A8; letters may move with B3. */
export const INBOX_KEYS = {
  file: { keys: ['e'], label: 'File with AI suggestion' },
  done: { keys: [' '], label: 'Done now' },
  plan: { keys: ['p'], label: 'Plan: pick a date' },
  dismiss: { keys: ['d'], label: 'Dismiss' },
  snooze: { keys: ['s'], label: 'Snooze' },
  open: { keys: ['Enter'], label: 'Edit title · a GitHub issue opens' },
  restore: { keys: ['r'], label: 'Restore (Dismissed, Snoozed)' },
} satisfies Record<string, ShortcutEntry>

/** The cheatsheet's Inbox section: list nav, the triage table above, select all (useListKeys). */
export const INBOX_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['↑/↓', 'j/k'], label: 'Move focus' },
  ...Object.values(INBOX_KEYS).map(({ keys, label }) => ({ keys: keys.map(keyCap), label })),
  { keys: ['⌘/Ctrl', 'A'], label: 'Select all' },
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

/** Command bar's own inline capture syntax — static so the cheatsheet's Command bar section always renders. */
export const COMMAND_BAR_SHORTCUTS: ShortcutEntry[] = [
  // Enter is the one capture path (Kai 2026-10-12 cut ⌘↵ "AI capture" — the AI fills every capture after it lands).
  { keys: ['↵'], label: 'Quick add' },
  { keys: ['⌘/Ctrl', '2'], label: 'Make it an event (⌘/Ctrl 1: a task)' },
  { keys: ['!'], label: 'Priority (! !! !!!)' },
  { keys: ['#'], label: 'Project' },
  { keys: ['*'], label: 'Label (*calls)' },
  { keys: ['30m', '1h'], label: 'Duration' },
  { keys: ['every …'], label: 'Repeat (every week, every mon, fri)' },
  { keys: ['//'], label: 'Notes — the rest of the line' },
  { keys: ['<'], label: 'Date (<friday)' },
  { keys: ['Esc'], label: 'Last token back to words (no token left: close)' },
  { keys: ['↓', '↵'], label: 'Jump to a view, project, area or label' },
]

/** The cheatsheet's third column, top to bottom — a new section (Calendar, A4) is one line here. */
export const SHEET_SECTIONS: { title: string; entries: ShortcutEntry[] }[] = [
  { title: 'Inbox triage', entries: INBOX_SHORTCUTS },
  { title: 'Command bar', entries: COMMAND_BAR_SHORTCUTS },
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
