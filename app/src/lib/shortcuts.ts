import type { ShortcutEntry } from './pageShortcutsStore'

// F3 (punch 12): the cheatsheet lists ONLY keys that work. Removed as fiction:
// `g` Go-to (D-5: folded into ⌘K), the Navigate section (t/i/u — never bound),
// the Calendar section (no keydown listener exists), Inbox's f/x rows (code binds
// e/d), and the command bar's `//` note syntax (never parsed).
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
  { keys: ['e'], label: 'Complete' },
  { keys: ['↵'], label: 'Open detail' },
  { keys: ['s'], label: 'Snooze menu' },
  { keys: ['t'], label: 'Toggle Top 3' },
  { keys: ['1', '2', '3'], label: 'Today · Tmrw · Next wk' },
  { keys: ['p'], label: 'Move to project' },
  { keys: ['x'], label: 'Select (multi)' },
  { keys: ['#'], label: 'Delete' },
]

/** Command bar's own inline capture syntax — static so the cheatsheet's Command bar section always renders. */
export const COMMAND_BAR_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['↵'], label: 'Quick add' },
  { keys: ['⌘/Ctrl', '↵'], label: 'AI capture' },
  { keys: ['!'], label: 'Priority (! !! !!!)' },
  { keys: ['#'], label: 'Project' },
  { keys: ['↓', '↵'], label: 'Jump to typed view' },
]
