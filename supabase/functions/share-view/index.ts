// The no-account share link (v1.6.6, partner sharing P1; migration 0100 `share_links`): a read-only page of the owner's
// today and the next 7 days, at Busy or Titles. Authenticated like `widget` (0090) and `calendar-feed` (0096): a token in
// the URL, made in Settings → Sharing → Share a view link, only its SHA-256 stored, verify_jwt = false (config.toml) —
// the token IS the auth. The page itself is the app's /v/<token> route, which asks this.
//
//   GET /functions/v1/share-view?t=<token>   JSON, Cache-Control no-store, CORS for the app's origins
//
// Unknown token 401 {"error":"unauthorized"}; revoked or past its 30 days 410 {"error":"gone","reason":"revoked|expired"};
// past HOURLY_LIMIT calls an hour 429.
//
// The masking is the SAME path the app's lane uses: share_day_data() (migration 0100), which no app role can call and
// which returns only masked columns (no title and no kind at Busy or for anything Private; never Top 3 or tasks below
// Details, and a link is never Details). This function adds nothing of its own to what leaves: it expands repeats into
// plain occurrences (the rule and exceptions stay in the database), groups them by the owner's day, and names the owner
// by their display name. No service role anywhere: the database connection is the same one calendar-feed uses.
import { corsHeadersFor } from '../_shared/cors.ts'
import { addDays, dateKey, userZone, wallToInstant } from '../_shared/zone.ts'
import { expandSeries } from '../_shared/series.ts'
import { ruleBetween, sql } from '../mcp/store.ts'

const TOKEN = /^kf_v_[A-Za-z0-9_-]{43}$/
const HOURLY_LIMIT = 120
const DAYS = 8 // today and the next 7

const respond = (req: Request, body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeadersFor(req), 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface Masked {
  id: string
  starts_at: string
  ends_at: string
  all_day: boolean
  title?: string
  masked?: boolean
  recurrence_rule?: string | null
  recurrence_exdates?: string[] | null
}

/** The blocks that touch each of `keys`' days on `zone`'s clock: [start, end) of a timed one against the day, an all-day one by its dates. */
function byDay(blocks: readonly Masked[], keys: readonly string[], zone: string) {
  return keys.map((date) => {
    const start = wallToInstant(date, 0, 0, zone), end = wallToInstant(addDays(date, 1), 0, 0, zone)
    const dayStart = Date.parse(`${date}T00:00:00Z`)
    const out = blocks
      .filter((b) => {
        const s = Date.parse(b.starts_at), e = Date.parse(b.ends_at)
        // An all-day row is a calendar date in no zone (its UTC midnight), the end exclusive.
        return b.all_day ? s < dayStart + 86_400_000 && e > dayStart : s < end.getTime() && e > start.getTime()
      })
      .map((b) => (b.title ? { starts_at: b.starts_at, ends_at: b.ends_at, all_day: b.all_day, title: b.title } : { starts_at: b.starts_at, ends_at: b.ends_at, all_day: b.all_day }))
    return { date, blocks: out }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...corsHeadersFor(req), 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })
  if (req.method !== 'GET') return respond(req, { error: 'method' }, 405)
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!TOKEN.test(token)) return respond(req, { error: 'unauthorized' }, 401)
  const hash = await sha256Hex(token)
  const now = new Date()
  try {
    const out = await sql.begin(async (tx) => {
      // Counted first, as the table owner: every call against a known token spends its hour, valid or not.
      const [l] = await tx`
        update share_links set calls = case when calls_hour = date_trunc('hour', now()) then calls + 1 else 1 end,
          calls_hour = date_trunc('hour', now()), last_used_at = now()
        where token_hash = ${hash}::text
        returning user_id, level, calls, expires_at, revoked_at`
      if (!l) return { status: 401, body: { error: 'unauthorized' } }
      if ((l.calls as number) > HOURLY_LIMIT) return { status: 429, body: { error: 'rate_limited' } } // the count still commits
      if (l.revoked_at) return { status: 410, body: { error: 'gone', reason: 'revoked' } }
      if ((l.expires_at as Date).getTime() <= now.getTime()) return { status: 410, body: { error: 'gone', reason: 'expired' } }
      const owner = l.user_id as string
      const [tz] = await tx`select timezone from app_settings where user_id = ${owner}::uuid`
      const zone = userZone((tz?.timezone as string | undefined) ?? null)
      const keys: string[] = []
      for (let i = 0, k = dateKey(now, zone); i < DAYS; i++, k = addDays(k, 1)) keys.push(k)
      const from = wallToInstant(keys[0], 0, 0, zone)
      const to = wallToInstant(addDays(keys[DAYS - 1], 1), 0, 0, zone)
      const [d] = await tx`select share_day_data(${owner}::uuid, ${l.level as string}::text, ${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz) as data`
      const data = d.data as { blocks: Masked[] }
      const rows = data.blocks.map((b) => ({ ...b, recurrence_rule: b.recurrence_rule ?? null }))
      const expanded = expandSeries(rows, from, to, zone, ruleBetween)
      const [nm] = await tx`select share_name(${owner}::uuid) as name`
      return {
        status: 200,
        body: { name: nm.name, zone, level: l.level, updated_at: now.toISOString(), expires_at: (l.expires_at as Date).toISOString(), days: byDay(expanded, keys, zone) },
      }
    })
    return respond(req, out.body, out.status)
  } catch (e) {
    console.error('share-view:', e)
    return respond(req, { error: 'server' }, 500)
  }
})
