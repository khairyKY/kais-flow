import { useState, type ReactNode } from 'react'
import { tomorrowHint } from '../../lib/dateShortcuts'
import { rowAnchor } from '../../lib/rowAnchor'
import type { Task } from '../../lib/types'
import { useStartFocus } from '../today/startFocus'
import { duplicateTasksWithUndo, makeGoalWithUndo, prioritizeWithUndo, somedayTasksWithUndo } from './api'
import { LabelPicker } from './LabelPicker'
import type { ListActionKey } from './listShortcuts'
import { TaskMenu, type BulkActions, type MenuSub } from './TaskMenu'
import { taskActions } from './useRowGrammar'

type Point = { x: number; y: number }
type Verbs = Partial<Record<ListActionKey, (task: Task) => void>>

/** P7e A18 — the list verbs every task list shares: D Plan…, ! Priority, = Duration, L Labels, S Someday,
 * H Make goal, F Start focus, ⌘/Ctrl+D Duplicate. A page spreads `actions` and `bulk` into buildListBindings, pauses its keys
 * while `picking`, renders `node`, and hands `open` to the bulk bar's Priority and Labels. The pickers
 * are the row menu's own (TaskMenu, LabelPicker), under the focused row or — 2+ selected — for all of
 * them, with the page's bulk handlers (`bulk`, as a selected row's ⋯ menu gets them). */
export function useListVerbs(bulk: BulkActions | undefined) {
  const startFocus = useStartFocus()
  const [pick, setPick] = useState<{ tasks: Task[]; sub: MenuSub; at: Point } | null>(null)
  const open = (tasks: Task[], sub: MenuSub, at?: Point) => {
    if (tasks.length === 0) return
    setPick({ tasks, sub, at: at ?? rowAnchor('task-', tasks[0].id) })
    // ponytail: a key opened it, so the keyboard goes in — the picker's first choice takes focus (Tab, ↵).
    // LabelPicker focuses its own search.
    if (sub !== 'labels') requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"], .kf-pk-pop .kf-as-row')?.focus())
  }
  const one = (sub: MenuSub) => (t: Task) => open([t], sub)
  const all = (sub: MenuSub) => (ts: Task[]) => open(ts, sub)
  const close = () => setPick(null)

  let node: ReactNode = null
  if (pick?.sub === 'labels') node = <LabelPicker taskIds={pick.tasks.map((t) => t.id)} position={pick.at} onClose={close} />
  else if (pick) {
    const [first] = pick.tasks
    const many = pick.tasks.length > 1
    const actions = {
      ...taskActions(first),
      ...(many ? { priority: (p: number | null) => prioritizeWithUndo(pick.tasks, p) } : null),
      ...(many && bulk ? { tomorrow: bulk.onTomorrow, schedule: bulk.onSchedule, someday: bulk.onSomeday } : null),
    }
    node = <TaskMenu task={first} anchor={{ at: pick.at, sub: pick.sub }} onClose={close} actions={actions} ctx={{ tomorrowHint: tomorrowHint(), bulkCount: many ? pick.tasks.length : undefined }} />
  }

  const actions: Verbs = {
    plan: one('date'),
    priority: one('priority'),
    duration: one('duration'),
    labels: one('labels'),
    someday: (t) => somedayTasksWithUndo([t]),
    goal: makeGoalWithUndo,
    focus: startFocus,
    duplicate: (t) => duplicateTasksWithUndo([t]),
  }
  // Duration, goal and focus are one task's (the ⋯ menu's rule); someday with a selection is the page's own.
  const bulkVerbs: Partial<Record<ListActionKey, (tasks: Task[]) => void>> = {
    plan: all('date'),
    priority: all('priority'),
    labels: all('labels'),
    // ⌘/Ctrl+D with rows selected: the page's bulk Duplicate (it clears the selection), or the one row.
    duplicate: (ts) => (bulk ? bulk.onDuplicate() : duplicateTasksWithUndo(ts)),
  }
  return { actions, bulk: bulkVerbs, open, picking: !!pick, node }
}
