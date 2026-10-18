// Smart lists (migration 0081): a saved filter over the tasks — "work tasks under 30 min this week" —
// opened from the sidebar's Plan group. One file for the filter's shape, its reader and its rules,
// shared by the app (app/src/features/smart-lists) and the MCP (list_tasks `smart_list`, the
// `smart_lists` tool). Pure — no Deno APIs, no npm: imports — so the app's vitest runs it
// (app/src/features/smart-lists/filter.test.ts), the _shared/today.ts pattern. That rule is also why the
// filter's schema is `readFilter` below and not a Zod schema: tools.ts may not import npm packages.
//
// Every condition is optional and they combine with AND; inside one (places, labels, when) any of the
// picks will do. Open tasks only unless `show_done`; a paused series never (grouping.ts filterByList);
// a Someday task only when `when` picks Someday (it's parked everywhere else, as on every fixed list).
// Days are the user's own (`zone`); a task's day is its due date, else its calendar block.
import { addDays, dateKey } from './zone.ts'

export const WHENS = ['overdue', 'today', 'week', 'next7', 'none', 'someday'] as const
export type SmartWhen = (typeof WHENS)[number]
/** ≤ this many minutes, or `none` = no length set. */
export const LENGTHS = [15, 30, 60, 'none'] as const
export type SmartLength = (typeof LENGTHS)[number]

export interface SmartFilter {
  /** Project, area or domain ids — a task in any of them (a domain: the task's own, or its container's). */
  places?: string[]
  /** Any of these labels. */
  labels?: string[]
  /** At least this priority: 3 = !, 2 = !!, 1 = !!! (1 is the most urgent, as tasks.priority). */
  priority?: 1 | 2 | 3
  when?: SmartWhen[]
  length?: SmartLength
  /** On the calendar (a block) or not. */
  planned?: boolean
  /** In the title or notes, any case. */
  text?: string
  /** Finished tasks too. */
  show_done?: boolean
}

/** The columns the rules read (the app's Task and the MCP's TaskRow both fit). */
export interface SmartTask {
  status: string
  someday?: boolean | null
  paused?: boolean | null
  deleted_at?: string | null
  due_at: string | null
  scheduled_start?: string | null
  project_id?: string | null
  area_id?: string | null
  domain_id?: string | null
  labels?: readonly string[] | null
  priority?: number | null
  duration_min?: number | null
  title: string
  notes?: string | null
}

export interface SmartContext {
  now: Date
  zone: string
  /** The task's domain, its container's when it has none of its own; default `task.domain_id`. */
  domainOf?: (t: SmartTask) => string | null
}

const strings = (v: unknown, max: number): string[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const out = [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x && x.length <= max))].slice(0, 200)
  return out.length ? out : undefined
}

/** The stored jsonb as a filter: anything malformed is dropped, never thrown (an old or hand-edited row
 * still opens). The one schema, for the app's writes and the MCP's reads alike. */
export function readFilter(raw: unknown): SmartFilter {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const f: SmartFilter = {}
  const places = strings(o.places, 64)
  if (places) f.places = places
  const labels = strings(o.labels, 60)
  if (labels) f.labels = labels
  if (o.priority === 1 || o.priority === 2 || o.priority === 3) f.priority = o.priority
  const when = strings(o.when, 16)?.filter((w): w is SmartWhen => (WHENS as readonly string[]).includes(w))
  if (when?.length) f.when = when
  if ((LENGTHS as readonly unknown[]).includes(o.length)) f.length = o.length as SmartLength
  if (typeof o.planned === 'boolean') f.planned = o.planned
  if (typeof o.text === 'string' && o.text.trim()) f.text = o.text.trim().slice(0, 200)
  if (o.show_done === true) f.show_done = true
  return f
}

const dayOf = (iso: string | null | undefined, zone: string): string | null => (iso ? dateKey(new Date(iso), zone) : null)

/** Monday of the week `day` is in (the app's weeks start Monday: lib/dateShortcuts daysUntilNextMonday). */
function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return addDays(day, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7))
}

function whenHolds(w: SmartWhen, t: SmartTask, today: string, zone: string): boolean {
  if (w === 'someday') return !!t.someday
  const day = dayOf(t.due_at ?? t.scheduled_start, zone)
  switch (w) {
    case 'overdue':
      return !!day && day < today
    case 'today':
      return day === today || dayOf(t.scheduled_start, zone) === today
    case 'week': {
      const mon = mondayOf(today)
      return !!day && day >= mon && day <= addDays(mon, 6)
    }
    case 'next7':
      return !!day && day >= today && day <= addDays(today, 6)
    case 'none':
      return !day && !t.someday
  }
}

/** Does this task belong in the list? */
export function smartMatch(t: SmartTask, f: SmartFilter, ctx: SmartContext): boolean {
  if (t.deleted_at || t.paused) return false
  if (t.status !== 'todo' && !(f.show_done && t.status === 'done')) return false
  if (t.someday && !f.when?.includes('someday')) return false
  if (f.places?.length) {
    const domain = (ctx.domainOf ?? ((x: SmartTask) => x.domain_id ?? null))(t)
    if (![t.project_id, t.area_id, domain].some((id) => !!id && f.places!.includes(id))) return false
  }
  if (f.labels?.length && !t.labels?.some((l) => f.labels!.includes(l))) return false
  if (f.priority && !(t.priority != null && t.priority >= 1 && t.priority <= f.priority)) return false
  if (f.when?.length) {
    const today = dateKey(ctx.now, ctx.zone)
    if (!f.when.some((w) => whenHolds(w, t, today, ctx.zone))) return false
  }
  if (f.length !== undefined) {
    const min = t.duration_min ?? 0
    if (f.length === 'none' ? min > 0 : !(min > 0 && min <= f.length)) return false
  }
  if (f.planned !== undefined && !!t.scheduled_start !== f.planned) return false
  if (f.text) {
    const q = f.text.toLowerCase()
    if (!`${t.title}\n${t.notes ?? ''}`.toLowerCase().includes(q)) return false
  }
  return true
}

export function smartFilter<T extends SmartTask>(tasks: readonly T[], f: SmartFilter, ctx: SmartContext): T[] {
  return tasks.filter((t) => smartMatch(t, f, ctx))
}

/** The When chips' words — the editor's chips and the list's caption say the same thing. */
export const WHEN_LABELS: Record<SmartWhen, string> = { overdue: 'Overdue', today: 'Today', week: 'This week', next7: 'Next 7 days', none: 'No date', someday: 'Someday' }

/** The list's conditions in plain words, for the Tasks page's caption and the MCP's smart_lists: "Career · ≤ 30 min · This week". */
export function describeFilter(f: SmartFilter, nameOf: (id: string) => string | undefined): string {
  const parts = [
    f.places && (f.places.map(nameOf).filter(Boolean).join(' or ') || 'a place that is gone'),
    f.labels?.join(' or '),
    f.when?.map((w) => WHEN_LABELS[w]).join(' or '),
    f.priority && `${'!'.repeat(4 - f.priority)} or more`,
    f.length !== undefined && (f.length === 'none' ? 'No length' : `≤ ${f.length} min`),
    f.planned !== undefined && (f.planned ? 'On the calendar' : 'Not on the calendar'),
    f.text && `“${f.text}”`,
    f.show_done && 'done ones too',
  ]
  return parts.filter(Boolean).join(' · ') || 'Every open task'
}
