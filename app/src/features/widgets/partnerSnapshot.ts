import { occurrences } from '../sharing/sharedBlocks'
import type { SharedDay } from '../sharing/api'
import type { Connection, Level } from '../sharing/model'

// The Her day widget's slice of the snapshot (Partner sharing P2, flow 6; widgets/HerDay.java reads these exact keys): one
// connected person's day as the server's masked answer (`shared_day`) lets this phone see it, at the LOWER of your two levels.
// Pure, so it is tested. Nothing here can show more than the server sent: a block with no title is a Busy block, and the goal
// only exists at Details. The widget also works the clock itself between pushes (Now / Next from `blocks`), and after
// PARTNER_STALE_MS without a fresh read it greys out and hides titles (HerDay.java does that at draw time, since the app may be closed).

/** A day old: the widget stops showing titles and greys out. Same rule as her calendar lane (Kai 2026-11-17). */
export const PARTNER_STALE_MS = 24 * 3_600_000
/** Timed blocks kept for the widget to pick Now and Next from. */
const KEPT = 8

export interface WidgetPartnerBlock {
  /** null = a Busy block (the server left the title out, or this phone hides titles). */
  title: string | null
  start: number
  end: number
}

export interface WidgetPartner {
  name: string
  level: Level
  /** When this was last read from the server (ms): the widget's freshness. */
  at: number
  /** Her pause: no blocks, the widget says "paused" and when it ends (ms; 0 = until she turns it back on). */
  paused: boolean
  pausedUntil: number
  blocks: WidgetPartnerBlock[]
  /** Details only. */
  goal: { title: string | null; done: boolean } | null
  /** Details only: her Top 3, done of total. */
  top: { done: number; total: number } | null
}

/** Whose day the widget shows: a Partner first, else the first person whose day you show. */
export function pickPartner(people: readonly Connection[]): Connection | null {
  return people.find((c) => c.relation === 'partner') ?? people.find((c) => c.show_lane) ?? null
}

export interface PartnerInput {
  conn: Connection | null
  day: SharedDay | undefined
  /** When `day` was read (React Query's dataUpdatedAt). */
  readAt: number
  now: Date
  hideTitles: boolean
}

/** null: nobody connected, or the connection is gone (the widget says so and keeps nothing). */
export function buildPartner(i: PartnerInput): WidgetPartner | null {
  const c = i.conn
  if (!c) return null
  const base = { name: c.partner_name, level: c.level, at: i.readAt, blocks: [], goal: null, top: null }
  if (c.paused_until) {
    const until = c.paused_until === 'infinity' ? 0 : Date.parse(c.paused_until)
    return { ...base, paused: true, pausedUntil: Number.isFinite(until) ? until : 0 }
  }
  const d = i.day
  if (!d?.level) return null
  const t = i.now.getTime()
  const occ = occurrences(d, new Date(t - 12 * 3_600_000), new Date(t + 36 * 3_600_000)).filter((o) => !o.allDay && o.end > t)
  const blocks = occ.slice(0, KEPT).map((o) => ({ title: i.hideTitles ? null : o.title, start: o.start, end: o.end }))
  const top = d.level === 'details' ? (d.top3 ?? []) : []
  const goal = top.find((x) => x.goal) ?? null
  return {
    ...base,
    level: d.level,
    paused: false,
    pausedUntil: 0,
    blocks,
    goal: goal ? { title: i.hideTitles ? null : goal.title, done: !!goal.done } : null,
    top: d.level === 'details' ? { done: top.filter((x) => x.done).length, total: top.length } : null,
  }
}

/** The widget's face from its age: fresh, or out of date (greyed, no titles). The Java side (HerDay.stale) is the same rule. */
export const partnerStale = (p: Pick<WidgetPartner, 'at'>, clock: number): boolean => clock - p.at > PARTNER_STALE_MS
