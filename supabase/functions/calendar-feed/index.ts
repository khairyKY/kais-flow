// Your own calendar link (v1.6.4 F5; migration 0096, ./feed.ts for the format): the owner's events, Time blocks and
// scheduled tasks as an ICS feed. Authenticated like `widget` (0090): a token in the URL made in Settings → Calendar &
// time → Your calendar link, only its SHA-256 stored, verify_jwt = false (config.toml) — the token IS the auth.
//
//   GET /functions/v1/calendar-feed?t=<token>      text/calendar, Cache-Control max-age=300
//
// A bad or revoked token is 401 {"error":"unauthorized"}; past HOURLY_LIMIT calls an hour, 429. One transaction on
// the database connection: the link is looked up and counted as the table owner, then the transaction switches to
// role `authenticated` with the owner's uid (mcp/store.ts asUser), so every row read is theirs by RLS. Nothing
// runs as the service role. Never in the feed: Google (`gcal`) or subscribed (`ics`) events, trashed rows, the
// blocks of a task that isn't open — and no journal, people or notes content at all.
import { userZone } from '../_shared/zone.ts'
import { asUser, ruleBetween, sql, store } from '../mcp/store.ts'
import { buildCalendar, feedWindow, HOURLY_LIMIT, planEvents, type FeedRow, type Held } from './feed.ts'

const TOKEN = /^kf_c_[A-Za-z0-9_-]{43}$/
const MAX_ROWS = 3000

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string))

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'method' }, 405)
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!TOKEN.test(token)) return json({ error: 'unauthorized' }, 401)
  const hash = await sha256Hex(token)
  const now = new Date()
  try {
    return await sql.begin(async (tx) => {
      // As the table owner, before the switch: the link, and this call counted against its hour.
      const [l] = await tx`
        update calendar_feed_links set calls = case when calls_hour = date_trunc('hour', now()) then calls + 1 else 1 end,
          calls_hour = date_trunc('hour', now()), last_used_at = now()
        where token_hash = ${hash}::text and revoked_at is null
        returning user_id, include_tasks, titles, calls`
      if (!l) return json({ error: 'unauthorized' }, 401)
      if ((l.calls as number) > HOURLY_LIMIT) return json({ error: 'rate_limited' }, 429) // the count still commits
      await asUser(tx, l.user_id as string)
      const zone = userZone(await store(tx, new Set()).timezone())
      const { from, to } = feedWindow(now)
      // Native rows only (Google and subscribed events are never echoed back); a task's block only while the task is open.
      const found = await tx`
        select e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.type, e.task_id, e.recurrence_rule, e.recurrence_exdates, e.updated_at
        from calendar_events e left join tasks t on t.id = e.task_id
        where e.deleted_at is null and e.source = 'native'
          and e.starts_at < ${to.toISOString()}::timestamptz and (e.ends_at > ${from.toISOString()}::timestamptz or e.recurrence_rule is not null)
          and (e.task_id is null or (t.status = 'todo' and t.deleted_at is null))
        order by e.starts_at, e.id
        limit ${MAX_ROWS}`
      const rows = found.map((e) => ({ ...e, starts_at: iso(e.starts_at), ends_at: iso(e.ends_at), updated_at: iso(e.updated_at) }) as FeedRow)
      // The tasks each Time block holds (0073): titles only, and only when titles and tasks are both on.
      const slots = rows.filter((r) => r.type === 'time_block').map((r) => r.id)
      const held: Held[] = l.titles && l.include_tasks && slots.length
        ? ((await tx`
            select slot_id, slot_date::text as slot_date, title from tasks
            where deleted_at is null and status = 'todo' and coalesce(external_ref->>'source', '') <> 'classroom'
              and slot_id in (select jsonb_array_elements_text(${JSON.stringify(slots)}::text::jsonb)::uuid)
            order by scheduled_start nulls last, id
            limit 2000`) as unknown as Held[])
        : []
      const events = planEvents(rows, held, { zone, from, to, titles: !!l.titles, includeTasks: !!l.include_tasks, between: ruleBetween })
      return new Response(buildCalendar(events, zone, now), {
        headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300' },
      })
    }) as Response
  } catch (e) {
    console.error('calendar-feed:', e)
    return json({ error: 'server' }, 500)
  }
})
