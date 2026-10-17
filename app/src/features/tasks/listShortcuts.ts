import type { Task } from '../../lib/types'
import { openTaskLink } from '../../lib/links'
import type { ListBinding } from '../../components/useListKeys'

export type ListActionKey = 'complete' | 'open' | 'today' | 'tomorrow' | 'nextWeek' | 'top3' | 'project' | 'labels' | 'delete' | 'toggleSelect' | 'link'
  | 'plan' | 'someday' | 'priority' | 'duration' | 'goal' | 'focus' | 'filter' | 'sort' | 'duplicate'

interface ListShortcutMeta {
  keys: string[]
  action: ListActionKey
  label: string
  /** A page key (⇧F, ⇧S): runs with no row focused. */
  page?: true
  /** Held with ⌘/Ctrl (⌘/Ctrl+D); the bare letter stays its own key (D = Plan…). */
  mod?: true
}

/** The single source for Tasks/Today list-nav keys: drives real dispatch (via
 * `buildListBindings`) and the `?` cheatsheet's Lists section — same array, no drift. */
export const LIST_SHORTCUTS: ListShortcutMeta[] = [
  { keys: ['x'], action: 'toggleSelect', label: 'Toggle select' },
  { keys: ['e', ' '], action: 'complete', label: 'Complete' },
  { keys: ['Enter'], action: 'open', label: 'Open detail' }, // F3 punch 29
  { keys: ['1'], action: 'today', label: 'Schedule today' },
  { keys: ['2'], action: 'tomorrow', label: 'Schedule tomorrow' },
  { keys: ['3'], action: 'nextWeek', label: 'Schedule next week' },
  { keys: ['t'], action: 'top3', label: 'Toggle Top 3' },
  { keys: ['p'], action: 'project', label: 'Move to…' },
  { keys: ['l'], action: 'labels', label: 'Labels…' }, // Overlays.dc.html "Label picker · keyboard L"
  { keys: ['#'], action: 'delete', label: 'Delete' },
  { keys: ['o'], action: 'link', label: 'Open link' }, // P7e A19 (Akiflow's O: back to the source)
  // P7e A18: the rest of the row's verbs, on free keys only (B3 — Kai's open call on the letters — keeps
  // p, t, # and 1/2/3 as they are). Akiflow's where it was free: S someday (its ⌘S), ! priority, H goal,
  // F focus, = duration (its ⌘= is the browser's zoom), ⇧F / ⇧S filter / sort; D for the whole Plan list.
  { keys: ['d'], action: 'plan', label: 'Plan…' },
  { keys: ['s'], action: 'someday', label: 'Someday' },
  { keys: ['!'], action: 'priority', label: 'Priority…' },
  { keys: ['='], action: 'duration', label: 'Duration…' },
  { keys: ['h'], action: 'goal', label: 'Make goal of the day' },
  { keys: ['f'], action: 'focus', label: 'Start focus' },
  { keys: ['⇧', 'F'], action: 'filter', label: 'Filter by label', page: true },
  { keys: ['⇧', 'S'], action: 'sort', label: 'Sort', page: true },
  // Kai 2026-10-17: Duplicate — ⌘/Ctrl+D as in Todoist, Notion, Akiflow (bare D is Plan…).
  { keys: ['⌘/Ctrl', 'D'], action: 'duplicate', label: 'Duplicate', mod: true },
]

/** Pages supply only the actions they actually wire up; missing ones are silently skipped — except
 * `o`, which every task list has (a task's link opens the same way everywhere). `bulk`: what a key
 * does to the selected rows, when there's a selection. */
export function buildListBindings(
  actions: Partial<Record<ListActionKey, (task: Task) => void>>,
  bulk: Partial<Record<ListActionKey, (tasks: Task[]) => void>> = {},
): ListBinding<Task>[] {
  const all: typeof actions = { link: openTaskLink, ...actions }
  return LIST_SHORTCUTS.filter((s) => all[s.action]).map((s) => ({ keys: s.keys, label: s.label, run: all[s.action]!, runAll: bulk[s.action], page: s.page, mod: s.mod }))
}

/** The matching key for an action's own context-menu row (right-aligned hint) — one source, no drift. */
export function shortcutHint(action: ListActionKey): string {
  const s = LIST_SHORTCUTS.find((x) => x.action === action)
  if (s?.mod) return `⌃${s.keys.at(-1)}` // the menus' ⌃ glyph (⌃click), as Ctrl on Windows
  const key = s?.keys[0]
  if (!key) return ''
  return key === ' ' ? 'SPACE' : key.toUpperCase()
}
