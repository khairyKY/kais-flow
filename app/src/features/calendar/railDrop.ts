import type { Area, CalendarEvent, Project } from '../../lib/types'
import type { RailScope } from '../tasks/grouping'
import { NO_PLACE, type MoveTarget } from '../tasks/move'

// ── Kai 2026-10-12: "I wanted to drag an event from the calendar into the left side — Overdue /
// Inbox / Today. It didn't accept any of them and wiggled." A block dropped on the planning rail
// now does what the section it lands on means. Pure — the writes are inbox/api's eventToRail. ──

export type RailSection = 'overdue' | 'today' | 'inbox' | 'lists'

export type RailDropAction =
  /** The §7 soft-no: the ghost shakes, nothing changes. */
  | 'soft-no'
  /** A task's block comes off the calendar; the task stays a task. */
  | 'unschedule'
  /** …and the task is due today, no time (it waits in the rail's Today). */
  | 'unschedule-today'
  /** A plain event / empty block becomes an inbox capture and is trashed. */
  | 'to-inbox'
  /** …becomes a task due today, no time. */
  | 'to-today'
  /** …becomes a task in the Lists section's scope. */
  | 'to-list'

const SECTIONS: readonly string[] = ['overdue', 'today', 'inbox', 'lists']

/** Section × kind → what the drop does. Overdue is a computed bucket (nothing can be put there), so
 * it always says no; rail chrome outside any section unschedules a task block as it always did. */
export function railDropAction(section: string | null | undefined, taskBlock: boolean): RailDropAction {
  const s = section && SECTIONS.includes(section) ? (section as RailSection) : null
  if (s === 'overdue') return 'soft-no'
  if (taskBlock) return s === 'today' ? 'unschedule-today' : 'unschedule'
  if (s === 'inbox') return 'to-inbox'
  if (s === 'today') return 'to-today'
  if (s === 'lists') return 'to-list'
  return 'soft-no'
}

/** Where a task made in the Lists section goes so it shows in that list: the scope's project, area
 * or domain (move.ts's rules — a project or area brings its domain). A smart list has no place. */
export function scopeTarget(scope: RailScope, projects: readonly Project[], areas: readonly Area[]): MoveTarget {
  if (scope.kind === 'project') {
    const p = projects.find((x) => x.id === scope.id)
    return p ? { kind: 'project', id: p.id, domainId: p.domain_id ?? null, name: p.name } : NO_PLACE
  }
  if (scope.kind === 'area') {
    const a = areas.find((x) => x.id === scope.id)
    return a ? { kind: 'area', id: a.id, domainId: a.domain_id ?? null, name: a.name } : NO_PLACE
  }
  if (scope.kind === 'domain' && scope.id) return { kind: 'domain', id: scope.id, name: '' }
  return NO_PLACE
}

/** A converted event's estimate: its length in minutes (an all-day one has none). */
export function eventMinutes(e: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>): number | null {
  if (e.all_day) return null
  const min = Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000)
  return min > 0 ? min : null
}
