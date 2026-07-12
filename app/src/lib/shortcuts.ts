import type { ShortcutEntry } from './pageShortcutsStore'

/** Always-on bindings, regardless of page — rendered by the `?` cheatsheet's first section. */
export const GLOBAL_SHORTCUTS: ShortcutEntry[] = [
  { keys: ['⌘/Ctrl', 'K'], label: 'Command bar' },
  { keys: ['⌘/Ctrl', '/'], label: 'Search' },
  { keys: ['n'], label: 'New task' },
  { keys: ['?'], label: 'Shortcut cheatsheet' },
  { keys: ['Esc'], label: 'Close topmost overlay' },
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
