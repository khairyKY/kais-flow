import { toastUndo } from '../../lib/undo'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { moveTasksWithUndo, rescheduleDue, somedayTasksWithUndo } from './api'
import { placeKey, targetKey, type MoveTarget } from './move'
import { todayFor } from './planMath'
import type { Project, Task } from '../../lib/types'

// ── Motion 2d, the filing drag: what a dropped task, capture or project does where it lands, and
// when the place says no (Effects 2j). Every drop is an action the row's ⋯ menu already has —
// Today, Someday, Move to… a project or area, Domain… — through the same api helper, with Undo. ──

/** The places a filing drag can land: the sidebar's Today / Due Today and Someday rows, the Organize
 * rail's areas and projects (Tasks), a Projects board column. */
export type FileSpot =
  | { kind: 'today'; label: string }
  | { kind: 'someday'; label: string }
  | { kind: 'place'; label: string; to: MoveTarget }
  | { kind: 'domain'; label: string; id: string }

const dueToday = (t: Task, today: string) => !t.someday && !!t.due_at && cairoDateKey(new Date(t.due_at)) === today

/** Tasks over `spot`: true = it moves them, false = the soft no (every one is already there — the
 * drop would change nothing), null = not a place for tasks. Pure. */
export function taskVerdict(tasks: readonly Task[], spot: FileSpot, now = new Date()): boolean | null {
  if (!tasks.length) return null
  if (spot.kind === 'today') return !tasks.every((t) => dueToday(t, cairoDateKey(now)))
  if (spot.kind === 'someday') return !tasks.every((t) => t.someday)
  if (spot.kind === 'place') return !tasks.every((t) => placeKey(t) === targetKey(spot.to))
  return null
}

/** Inbox captures file to Today from the sidebar (as a task due today, the card's own title and
 * place); nothing else in reach takes a capture. Pure. */
export function inboxVerdict(spot: FileSpot): boolean | null {
  return spot.kind === 'today' ? true : null
}

/** A project card over a board column: its own column is the soft no. Pure. */
export function projectVerdict(project: Pick<Project, 'domain_id'>, spot: FileSpot): boolean | null {
  return spot.kind === 'domain' ? project.domain_id !== spot.id : null
}

/** Tasks dropped on `spot`: the menu's own action, one toast, one Undo. */
export function dropTasks(tasks: readonly Task[], spot: FileSpot, now = new Date()): void {
  const list = [...tasks]
  if (spot.kind === 'place') moveTasksWithUndo(list, spot.to)
  else if (spot.kind === 'someday') somedayTasksWithUndo(list)
  else if (spot.kind === 'today') {
    // The Plan menu's Today for each: today, at the task's own time.
    const undos = list.map((t) => rescheduleDue(t, todayFor(t, now)))
    toastUndo(list.length === 1 ? 'Moved to today' : `${list.length} tasks moved to today`, () => undos.forEach((undo) => undo()))
  }
}
