import { localDateKey } from '../routines/streaks'
import type { Area, Domain, Project, Task } from '../../lib/types'

/** `30` -> "30M", `60` -> "1H", `90` -> "1H30M". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}M`
  if (m === 0) return `${h}H`
  return `${h}H${m}M`
}

/** Calendar-day difference (local time), not raw ms/24 -- a task due 23:00 yesterday is 1 day overdue, not 0. */
export function daysOverdue(dueAt: string, now = new Date()): number {
  const [dy, dm, dd] = localDateKey(new Date(dueAt)).split('-').map(Number)
  const [ny, nm, nd] = localDateKey(now).split('-').map(Number)
  return Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(dy, dm - 1, dd)) / 86400000)
}

/** Priority 1 (most urgent) -> "!!!", matching the command-bar `!`/`!!`/`!!!` input syntax. */
export function priorityFlag(priority: number | null): string | null {
  if (priority !== 1 && priority !== 2 && priority !== 3) return null
  return '!'.repeat(4 - priority)
}

/** Priority 1 (`!!!`, most urgent) -> red, 2 (`!!`) -> yellow/gold, 3 (`!`) -> blue. Semantic
 * tokens only — same mapping direction as `priorityFlag`, applied everywhere the flag renders. */
export function priorityColor(priority: number | null): string | null {
  if (priority === 1) return 'var(--sig-overdue)'
  if (priority === 2) return 'var(--acc-gold)'
  if (priority === 3) return 'var(--acc-hydrangea-deep)'
  return null
}

export interface TaskTag {
  label: string
  color: string | null
}

/** One tag chip per row: area > project > domain, whichever is set first. */
export function resolveTag(task: Task, domains: Domain[], projects: Project[], areas: Area[]): TaskTag | null {
  if (task.area_id) {
    const area = areas.find((a) => a.id === task.area_id)
    if (area) return { label: area.name, color: area.color }
  }
  if (task.project_id) {
    const project = projects.find((p) => p.id === task.project_id)
    if (project) {
      const domain = domains.find((d) => d.id === project.domain_id)
      return { label: project.name, color: domain?.color ?? null }
    }
  }
  if (task.domain_id) {
    const domain = domains.find((d) => d.id === task.domain_id)
    if (domain) return { label: domain.name, color: domain.color }
  }
  return null
}

/** A row's labels (Kai 2026-10-03): the first `max` as chips in its meta, the rest as "+N". */
export function rowLabels(labels: readonly string[] | null | undefined, max = 2): { shown: string[]; more: number } {
  const all = labels ?? []
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) }
}

/** Every label in use, once, A–Z ignoring case — Tasks' Label filter options. */
export function labelOptions(tasks: readonly Pick<Task, 'labels'>[]): string[] {
  return [...new Set(tasks.flatMap((t) => t.labels ?? []))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
