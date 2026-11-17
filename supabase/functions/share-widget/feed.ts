// Her-day widget feed (Rainmeter skin, ./index.ts; migration 0104): one connected person's day, shaped for a small skin.
// Pure - no Deno APIs - so the app's vitest runs it (app/src/features/sharing/herFeed.test.ts). The database
// (share_widget_read -> share_day_data, 0100) already masked it to the level both people allow; this only expands repeats,
// picks now and next, and counts the Top 3. It adds nothing the server did not send: a block with no `title` stays without
// one, and Top 3 / tasks only exist at Details.
//
// Times are the VIEWER's clock (`zone`): epoch seconds for the skin to work out now and next between fetches, and "HH:MM".
// The colour is always Heather (her colour, fixed): the skin draws it, the feed names it so the skin has one place to look.
import { expandSeries, type RuleBetween } from '../_shared/series.ts'
import { wallTime } from '../_shared/zone.ts'

export interface MaskedBlock {
  id: string
  starts_at: string
  ends_at: string
  all_day: boolean
  title?: string
  masked?: boolean
  recurrence_rule?: string | null
  recurrence_exdates?: string[] | null
}
export interface MaskedTask { id: string; title: string; done?: boolean; goal?: boolean }

/** What share_widget_read answers when the key, the connection and the pause all say yes. */
export interface ReadOk {
  status: 'ok'
  name: string
  level: 'busy' | 'titles' | 'details'
  zone: string
  owner_zone: string
  from: string
  to: string
  data: { blocks: MaskedBlock[]; top3: MaskedTask[]; tasks: MaskedTask[] }
}

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000)

export function herFeed(r: ReadOk, now: Date, ruleBetween: RuleBetween) {
  const t = now.getTime()
  const rows = (r.data.blocks ?? []).map((b) => ({ ...b, recurrence_rule: b.recurrence_rule ?? null }))
  const timed = expandSeries(rows, new Date(r.from), new Date(r.to), r.owner_zone, ruleBetween)
    .filter((b) => !b.all_day && Date.parse(b.ends_at) > t)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  const block = (b: (typeof timed)[number]) => ({
    ...(b.title ? { title: b.title } : { busy: true }),
    start: sec(b.starts_at),
    end: sec(b.ends_at),
    start_hm: wallTime(b.starts_at, r.zone).slice(11),
    end_hm: wallTime(b.ends_at, r.zone).slice(11),
    color: 'heather',
  })
  let running: (typeof timed)[number] | null = null
  for (const b of timed) if (Date.parse(b.starts_at) <= t && (!running || Date.parse(b.starts_at) > Date.parse(running.starts_at))) running = b
  const next = timed.filter((b) => Date.parse(b.starts_at) > t).slice(0, 2)
  const top = r.level === 'details' ? (r.data.top3 ?? []) : []
  const goal = top.find((x) => x.goal) ?? null
  return {
    v: 1,
    status: 'ok' as const,
    updated_at: now.toISOString(),
    now: Math.floor(t / 1000),
    zone: r.zone,
    name: r.name,
    level: r.level,
    now_block: running ? block(running) : null,
    next_blocks: next.map(block),
    // Details only: her goal of the day and the Top 3 count. (The server sends neither below Details.)
    goal: goal ? { title: goal.title, done: !!goal.done } : null,
    top3: top.map((x) => ({ title: x.title, done: !!x.done, goal: !!x.goal })),
    top3_done: top.filter((x) => x.done).length,
  }
}

export type HerFeed = ReturnType<typeof herFeed>
