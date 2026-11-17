// Her-day widget feed (Rainmeter skin, ./index.ts; migration 0104): one connected person's day, shaped for a small skin.
// Pure - no Deno APIs - so the app's vitest runs it (app/src/features/sharing/herFeed.test.ts). The database
// (share_widget_read -> share_day_data, 0100) already masked it to the level both people allow; this only expands repeats,
// picks now and next, and counts the Top 3. It adds nothing the server did not send: a block with no `title` stays without
// one, and Top 3 / tasks only exist at Details.
//
// Times are the VIEWER's clock (`zone`): epoch seconds for the skin to work out now and next between fetches, and "HH:MM".
// The colour is the one the VIEWER gave her (circle_members.color, palette C's 16 swatches; Heather until picked, migration 0105): the
// feed names it (`color`, a swatch name like 'rose') and the skin draws it from its own table of the 16.
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
/** Palette C by the day hex the server stores -> the swatch's name (app/src/features/calendar/blockHue.ts BLOCK_SWATCHES; herFeed.test.ts keeps them equal). */
export const SWATCH_NAMES: Readonly<Record<string, string>> = {
  '#E58F99': 'rose', '#E29572': 'clay', '#C9A658': 'ochre', '#A0B569': 'olive', '#72BF8E': 'fern', '#47BFC5': 'lagoon', '#81ADED': 'cornflower', '#B59CE3': 'iris',
  '#B36670': 'wine', '#B16C4C': 'rust', '#9C7B31': 'honey', '#768A42': 'moss', '#4A9266': 'pine', '#0D9298': 'tide', '#5A81BC': 'indigo', '#8972B3': 'heather',
}
/** The swatch name for a stored colour: Heather for anything unknown, so a skin always has a colour to draw. */
export const swatchName = (hex?: string | null): string => (hex && SWATCH_NAMES[hex.toUpperCase()]) || 'heather'

export interface MaskedTask { id: string; title: string; done?: boolean; goal?: boolean }

/** What share_widget_read answers when the key, the connection and the pause all say yes. */
export interface ReadOk {
  status: 'ok'
  name: string
  level: 'busy' | 'titles' | 'details'
  zone: string
  /** The colour the viewer gave her (a palette C day hex). */
  color?: string
  owner_zone: string
  from: string
  to: string
  data: { blocks: MaskedBlock[]; top3: MaskedTask[]; tasks: MaskedTask[] }
}

/** One of her blocks as the skin gets it: a title, or `busy` when the server left the title out. */
export interface HerBlock { title?: string; busy?: boolean; start: number; end: number; start_hm: string; end_hm: string; color: string }

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000)

export function herFeed(r: ReadOk, now: Date, ruleBetween: RuleBetween) {
  const t = now.getTime()
  const color = swatchName(r.color)
  const rows = (r.data.blocks ?? []).map((b) => ({ ...b, recurrence_rule: b.recurrence_rule ?? null }))
  const timed = expandSeries(rows, new Date(r.from), new Date(r.to), r.owner_zone, ruleBetween)
    .filter((b) => !b.all_day && Date.parse(b.ends_at) > t)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  const block = (b: (typeof timed)[number]): HerBlock => ({
    ...(b.title ? { title: b.title } : { busy: true }),
    start: sec(b.starts_at),
    end: sec(b.ends_at),
    start_hm: wallTime(b.starts_at, r.zone).slice(11),
    end_hm: wallTime(b.ends_at, r.zone).slice(11),
    color,
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
    color,
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
