// Punch 28 — recurring-import dedupe. The Akiflow import materialized every occurrence of
// a recurring task as its own row (the 76× "Shower + breakfast" case); this finds those
// clusters and proposes collapsing each to ONE task with a recurrence_rule.
// ponytail: no AI call — the median day-gap between due dates is enough to tell daily
// from weekly for import dupes. Anything murkier is shown as "no clear rhythm" and merges
// without attaching a rule.
import type { Task } from '../../lib/types'

/** Clusters need at least this many open same-title tasks to be worth proposing. */
export const MIN_CLUSTER = 5

export type Cadence = 'daily' | 'weekly' | null

export interface DupeCluster {
  /** Display title (the keeper's own trim). */
  title: string
  /** Every open task in the cluster, due-date ascending, undated last. */
  tasks: Task[]
  /** Proposed keeper: next upcoming occurrence, else the latest dated one, else the first. */
  keep: Task
  cadence: Cadence
  /** The rrule the guess maps to — null when the spacing is unclear. */
  rule: string | null
}

/** Median whole-day gap between consecutive due dates → daily/weekly, or null if unclear. */
export function guessCadence(dueDates: Date[]): Cadence {
  if (dueDates.length < 3) return null
  const days = dueDates.map((d) => Math.floor(d.getTime() / 86400000)).sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < days.length; i++) {
    const g = days[i] - days[i - 1]
    if (g > 0) gaps.push(g) // same-day duplicates carry no spacing signal
  }
  if (gaps.length === 0) return null
  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]
  if (median <= 1) return 'daily'
  if (median >= 6 && median <= 8) return 'weekly'
  return null
}

const RULE_OF: Record<'daily' | 'weekly', string> = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY' }

/** Groups OPEN tasks by normalized title (trim/lowercase) and proposes a merge per cluster
 * of MIN_CLUSTER+. Pure — nothing is written here; the caller confirms per cluster. */
export function findDuplicateClusters(tasks: Task[], now: Date = new Date()): DupeCluster[] {
  const byTitle = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.status !== 'todo') continue
    const key = t.title.trim().toLowerCase()
    if (!key) continue
    const arr = byTitle.get(key) ?? []
    arr.push(t)
    byTitle.set(key, arr)
  }

  const clusters: DupeCluster[] = []
  for (const group of byTitle.values()) {
    if (group.length < MIN_CLUSTER) continue
    const sorted = [...group].sort((a, b) => {
      if (!a.due_at) return b.due_at ? 1 : 0
      if (!b.due_at) return -1
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
    })
    const dated = sorted.filter((t) => t.due_at)
    const cadence = guessCadence(dated.map((t) => new Date(t.due_at!)))
    const keep =
      dated.find((t) => new Date(t.due_at!).getTime() >= now.getTime()) ??
      dated[dated.length - 1] ??
      sorted[0]
    clusters.push({
      title: keep.title.trim(),
      tasks: sorted,
      keep,
      cadence,
      rule: cadence ? RULE_OF[cadence] : null,
    })
  }
  return clusters.sort((a, b) => b.tasks.length - a.tasks.length)
}
