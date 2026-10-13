import type { Task } from '../../lib/types'
import { openTaskLink } from '../../lib/links'
import type { ListBinding } from '../../components/useListKeys'

export type ListActionKey = 'complete' | 'open' | 'today' | 'tomorrow' | 'nextWeek' | 'top3' | 'project' | 'labels' | 'delete' | 'toggleSelect' | 'link'

interface ListShortcutMeta {
  keys: string[]
  action: ListActionKey
  label: string
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
]

/** Pages supply only the actions they actually wire up; missing ones are silently skipped — except
 * `o`, which every task list has (a task's link opens the same way everywhere). `bulk`: what a key
 * does to the selected rows, when there's a selection. */
export function buildListBindings(
  actions: Partial<Record<ListActionKey, (task: Task) => void>>,
  bulk: Partial<Record<ListActionKey, (tasks: Task[]) => void>> = {},
): ListBinding<Task>[] {
  const all: typeof actions = { link: openTaskLink, ...actions }
  return LIST_SHORTCUTS.filter((s) => all[s.action]).map((s) => ({ keys: s.keys, label: s.label, run: all[s.action]!, runAll: bulk[s.action] }))
}

/** The matching key for an action's own context-menu row (right-aligned hint) — one source, no drift. */
export function shortcutHint(action: ListActionKey): string {
  const key = LIST_SHORTCUTS.find((s) => s.action === action)?.keys[0]
  if (!key) return ''
  return key === ' ' ? 'SPACE' : key.toUpperCase()
}
