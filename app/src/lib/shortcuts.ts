import type { ShortcutEntry } from './pageShortcutsStore'

// F3 (punch 12): the cheatsheet lists ONLY keys that work. Removed as fiction:
// `g` Go-to (D-5: folded into ⌘K), the Navigate section (t/i/u — never bound),
// the Calendar section (no keydown listener exists), Inbox's f/x rows (code binds
// e/d), and the command bar's `//` note syntax (never parsed — real since P7e A6, 2026-10-13).
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
  { keys: ['o'], label: 'Open link' },
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

/** Command bar's own inline capture syntax — static so the cheatsheet's Command bar section always renders. */
export const COMMAND_BAR_SHORTCUTS: ShortcutEntry[] = [
  // Enter is the one capture path (Kai 2026-10-12 cut ⌘↵ "AI capture" — the AI fills every capture after it lands).
  { keys: ['↵'], label: 'Quick add' },
  { keys: ['⌘/Ctrl', '2'], label: 'Make it an event (⌘/Ctrl 1: a task)' },
  { keys: ['!'], label: 'Priority (! !! !!!)' },
  { keys: ['#'], label: 'Project' },
  { keys: ['every …'], label: 'Repeat (every week, every mon, fri)' },
  { keys: ['//'], label: 'Notes — the rest of the line' },
  { keys: ['<'], label: 'Date (<friday)' },
  { keys: ['Esc'], label: 'Last token back to words (no token left: close)' },
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
