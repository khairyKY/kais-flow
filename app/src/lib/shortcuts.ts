import type { ShortcutEntry } from './pageShortcutsStore'

/** Always-on bindings, regardless of page — rendered by the `?` cheatsheet's first section. */
export const GLOBAL_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['⌘/Ctrl', 'K'], label: 'Command bar' },
  { keys: ['⌘/Ctrl', '/'], label: 'Search' },
  { keys: ['⌘/Ctrl', 'J'], label: 'Chat' },
  { keys: ['n'], label: 'New task' },
  { keys: ['g'], label: 'Go to…' },
  { keys: ['?'], label: 'This cheatsheet' },
  { keys: ['Esc'], label: 'Close overlay' },
]

/** Route keys — static data so the cheatsheet's Navigate section always renders, same as Inbox below. */
export const NAVIGATE_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['t'], label: 'Today' },
  { keys: ['i'], label: 'Inbox' },
  { keys: ['u'], label: 'Upcoming' },
]

/** Inbox triage keys — static data so the cheatsheet's Inbox section can render even when
 * the page itself isn't mounted (unlike the list-nav sections, which come from whatever
 * page is currently registered in `pageShortcutsStore`). */
export const INBOX_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['↑/↓', 'j/k'], label: 'Move focus' },
  { keys: ['f'], label: 'File with AI suggestion' },
  { keys: ['d'], label: 'Pick domain/project, then file' },
  { keys: ['x'], label: 'Dismiss' },
  { keys: ['s'], label: 'Snooze to tomorrow' },
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
  { keys: ['1', '2', '3'], label: 'Today · Tmrw · Next wk' },
  { keys: ['p'], label: 'Move to project' },
  { keys: ['x'], label: 'Select (multi)' },
  { keys: ['#'], label: 'Delete' },
]

/** Calendar view keys — static so the cheatsheet's Calendar section always renders. */
export const CALENDAR_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['d', 'w', 'm'], label: 'Day · Week · Month' },
  { keys: ['←', '→'], label: 'Prev · next period' },
  { keys: ['t'], label: 'Jump to today' },
]

/** Command bar's own inline capture syntax — static so the cheatsheet's Command bar section always renders. */
export const COMMAND_BAR_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['↵'], label: 'Quick add' },
  { keys: ['⌘/Ctrl', '↵'], label: 'AI capture' },
  { keys: ['!'], label: 'Priority (! !! !!!)' },
  { keys: ['#'], label: 'Project' },
  { keys: ['//'], label: 'Add a note' },
]
