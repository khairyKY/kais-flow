// Desktop widgets (Rainmeter skins; docs/log/2026-10-29-*-widget-feed-handoff.md has the JSON for skin builders):
// today's plan for the owner of a Widget link — a token in the URL, made in Settings → Windows desktop
// (widget_links, migration 0090; only its SHA-256 is stored). Deployed with verify_jwt = false (config.toml):
// the token is not a JWT, the token IS the auth. It replaces kais-flow-export.ps1, which held the service-role key.
//
//   GET  /functions/v1/widget?t=<token>[&names=0]     today's feed (./feed.ts), Cache-Control max-age=30
//   POST /functions/v1/widget?t=<token>&tick=<task>   completes an open task — only on a link with "Allow
//                                                      ticking" (403 read_only otherwise); the app's / MCP's own
//                                                      completeTask, so a repeat spawns its next round and
//                                                      activity_log gets task.completed with source 'widget'
//
// A bad or revoked token is 401 {"error":"unauthorized"}; past HOURLY_LIMIT calls an hour, 429.
// Every request is one transaction on the database connection, mcp/index.ts's pattern: the link is looked
// up and counted as the table owner, then the transaction switches to role `authenticated` with the
// owner's uid (mcp/store.ts asUser), so every row read or written below is theirs by RLS. Nothing runs
// as the service role and no key is ever in a response.
import { userZone } from '../_shared/zone.ts'
import { expandSeries } from '../_shared/series.ts'
import { asUser, nextOccurrence, ruleBetween, sql, store, type Tx } from '../mcp/store.ts'
import { completeTask, dayWindow, isUuid, openTask, ToolInputError, type TaskRow, type ToolContext } from '../mcp/tools.ts'
import { buildFeed, HOURLY_LIMIT, type FeedEvent } from './feed.ts'

const TOKEN = /^kf_w_[A-Za-z0-9_-]{43}$/

const json = (body: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } })

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string))

async function feed(tx: Tx, canTick: boolean, names: boolean, now: Date) {
  const s = store(tx, new Set())
  const zone = userZone(await s.timezone())
  const { start, end } = dayWindow(now, zone)
  const open = await s.dayTasks(start.toISOString(), end.toISOString())
  const doneToday = (await tx`
    select to_jsonb(t) - 'embedding' - 'search_tsv' - 'external_ref' - 'user_id' as r from tasks t
    where t.status = 'done' and t.deleted_at is null and t.completed_at >= ${start.toISOString()}::timestamptz and t.completed_at < ${end.toISOString()}::timestamptz
    limit 500`).map((x) => x.r as TaskRow)
  // The calendar as the app draws it (Google-synced events too: this is the owner's own desktop), repeats expanded.
  const rows = await tx`
    select id, title, starts_at, ends_at, all_day, task_id, type, color, recurrence_rule, recurrence_exdates from calendar_events
    where deleted_at is null and starts_at < ${end.toISOString()}::timestamptz and (ends_at > ${start.toISOString()}::timestamptz or recurrence_rule is not null)
    order by starts_at, id
    limit 300`
  const events = expandSeries(rows.map((e) => ({ ...e, starts_at: iso(e.starts_at), ends_at: iso(e.ends_at) }) as FeedEvent & { recurrence_rule: string | null }), start, end, zone, ruleBetween)
  return buildFeed({ now, zone, open, doneToday, events, names, canTick })
}

async function tick(tx: Tx, taskId: string, now: Date) {
  const s = store(tx, new Set())
  const ctx: ToolContext = { store: s, zone: userZone(await s.timezone()), now, nextOccurrence, ruleBetween, scopes: new Set(), source: 'widget' }
  const { done, next } = await completeTask(ctx, await openTask(ctx, taskId))
  return { done: done.id, next: next?.id ?? null }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('t') ?? ''
  const tickId = url.searchParams.get('tick')
  const isTick = req.method === 'POST' && tickId !== null
  if (req.method !== 'GET' && !isTick) return json({ error: 'method' }, 405)
  if (!TOKEN.test(token)) return json({ error: 'unauthorized' }, 401)
  if (isTick && !isUuid(tickId!)) return json({ error: 'bad_task' }, 400)
  const hash = await sha256Hex(token)
  const now = new Date()
  try {
    return await sql.begin(async (tx) => {
      // As the table owner, before the switch: the link, and this call counted against its hour.
      const [l] = await tx`
        update widget_links set calls = case when calls_hour = date_trunc('hour', now()) then calls + 1 else 1 end,
          calls_hour = date_trunc('hour', now()), last_used_at = now()
        where token_hash = ${hash}::text and revoked_at is null
        returning user_id, can_tick, calls`
      if (!l) return json({ error: 'unauthorized' }, 401)
      if ((l.calls as number) > HOURLY_LIMIT) return json({ error: 'rate_limited' }, 429) // the count still commits
      if (isTick && !l.can_tick) return json({ error: 'read_only' }, 403)
      await asUser(tx, l.user_id as string)
      if (isTick) return json(await tick(tx, tickId!, now))
      return json(await feed(tx, !!l.can_tick, url.searchParams.get('names') !== '0', now), 200, 'max-age=30')
    }) as Response
  } catch (e) {
    // A task that isn't there (or not this user's — RLS) or isn't open any more: the tool's own refusal.
    if (e instanceof ToolInputError) return json({ error: 'not_open', message: e.message }, 409)
    console.error('widget:', e)
    return json({ error: 'server' }, 500)
  }
})
