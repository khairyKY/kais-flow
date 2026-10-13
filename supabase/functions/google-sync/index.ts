// Google Calendar → our calendar, read-only (parity audit B1, Kai 2026-10-13), and our plan → the
// account's primary calendar as busy (Kai 2026-10-14). Two callers, as github-sync:
//  - pg_cron every 15 min (service-role key from Vault, migration 0074): every user whose Google
//    integration is connected and not failing.
//  - a signed-in user's "Sync now" (Settings › Integrations › Google Calendar): only that user.
// Anyone else gets 401.
//
//   { action: 'sync' } → { calendars, fetched, new, updated, removed, out }          (user)
//                      → { users, failed, calendars, fetched, new, updated, removed, out } (cron)
//   out (user) = { blocks, written, failed, pending } | null — null: the grant lacks the write scope.
//
// Per user: the stored refresh token buys an access token; each chosen calendar is read over the
// window (_shared/google.ts syncWindow: today − 7 … + 60 days on the user's clock — app_settings.timezone)
// with singleEvents=true, so a repeat arrives as its instances; planGcalSync turns that into inserts,
// updates and deletes of calendar_events rows with source 'gcal' (all-day and cancellations in
// mapEvent). Synced rows are mirrors: hard-deleted when Google drops them, and never logged to
// activity_log (they aren't anything the user did).
//
// Then, when the grant has calendar.events.owned (_shared/google.ts GOOGLE_WRITE_SCOPE — a grant from
// before 2026-10-14 doesn't until a Reconnect, and reading carries on without it): our native, timed,
// live rows in the same window go out to the PRIMARY calendar as private busy events (mirrorBodies →
// planMirror → writeMirror), or, with "Show my plan in Google as busy" off, ours there are deleted.
// Google is the map: each of our events carries our id in a private extended property, so nothing is
// stored on our rows and nothing without that property is ever touched. A write-out failure never
// fails the read sync.
//
// ponytail: a full read of the window every run, no incremental syncTokens — a sliding window and a
// sync token don't mix (an event that slides into day +60 unchanged never shows up in a token's
// changes). Upgrade path: a syncToken per calendar plus one full read a day, if a calendar is ever big
// enough for this to matter (a prayer calendar is ~5 events a day).
//
// Errors are stable codes: not_connected · token_expired · google_unavailable · server_error. The
// refresh token is never logged or returned.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isServiceRole, requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { gGet, googleToken, GoogleError, GOOGLE_WRITE_SCOPE, hasScope, listMirrored, mapEvent, MAX_MIRROR_WRITES, mirrorBodies, planGcalSync, planMirror, syncWindow, writeMirror, type GCalendar, type GcalRow, type GEvent, type GoogleData, type NativeRow, type StoredGcal } from '../_shared/google.ts'
import { userZone } from '../_shared/zone.ts'
import type { RuleBetween } from '../_shared/series.ts'
// rrule is CommonJS: Deno takes its default export only (see mcp/index.ts).
import rrulePkg from 'npm:rrule@2'
const { RRule } = rrulePkg

/** A repeating event's occurrences (migration 0061), as chat/index.ts expands them. */
const ruleBetween: RuleBetween = (rule, dtstart, after, before) => new RRule({ ...RRule.parseString(rule), dtstart }).between(after, before, true)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

const CONCURRENCY = 4
/** Pages of 2500 events per calendar per run — 25 000 events, far past any real calendar's 67 days. */
const MAX_PAGES = 10

interface IntegrationRow {
  user_id: string
  data: GoogleData
  updated_at: string
}

interface Out {
  blocks: number
  written: number
  failed: number
  pending: number
}

interface Counts {
  calendars: number
  fetched: number
  new: number
  updated: number
  removed: number
  out: Out | null
}

function must<T>(res: { data: T | null; error: { code?: string } | null }): T {
  if (res.error) throw new Error(`db ${res.error.code ?? 'error'}`)
  return res.data as T
}

/** Every event of `cal` in the window, mapped; null when Google won't let us read it this run
 * (left alone until it can). A calendar that's gone (404/410) reads as empty, so its rows go. */
async function readCalendar(cal: GCalendar, token: string, window: { start: Date; end: Date }): Promise<GcalRow[] | null> {
  const rows: GcalRow[] = []
  let page = ''
  for (let i = 0; i < MAX_PAGES; i++) {
    const q = new URLSearchParams({
      singleEvents: 'true',
      timeMin: window.start.toISOString(),
      timeMax: window.end.toISOString(),
      maxResults: '2500',
      fields: 'items(id,etag,status,summary,start,end,extendedProperties),nextPageToken',
    })
    if (page) q.set('pageToken', page)
    try {
      const res = await gGet<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(cal.id)}/events?${q}`, token)
      rows.push(...(res.items ?? []).flatMap((e) => mapEvent(e, cal) ?? []))
      page = res.nextPageToken ?? ''
    } catch (e) {
      if (e instanceof GoogleError && e.status === 401) throw e
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return []
      console.error('google-sync: a calendar read failed', e instanceof Error ? e.message : 'error')
      return null
    }
    if (!page) return rows
  }
  return null // more than MAX_PAGES: a partial read must not delete the rest
}

async function syncUser(db: SupabaseClient, { user_id: userId, data, updated_at }: IntegrationRow): Promise<Counts> {
  const startedAt = new Date().toISOString()
  // Only if the row is unchanged since we read it — a reconnect or a "choose" mid-run wins.
  const saveData = (patch: Partial<GoogleData>) =>
    db.from('integrations').update({ data: { ...data, ...patch } })
      .eq('user_id', userId).eq('provider', 'google').eq('updated_at', updated_at)

  try {
    const tok = await googleToken({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: data.refresh_token ?? '', grant_type: 'refresh_token' })
    const access_token = tok.access_token
    // A refresh answers the grant's scopes; without them, trust what the connect stored.
    const canWrite = tok.scope ? hasScope(tok.scope, GOOGLE_WRITE_SCOPE) : !!data.can_write
    const settings = must(await db.from('app_settings').select('timezone').eq('user_id', userId).maybeSingle()) as { timezone?: string | null } | null
    const zone = userZone(settings?.timezone)
    const window = syncWindow(new Date(), zone)
    const chosen = data.chosen ?? []
    const calendars = (data.calendars ?? []).filter((c) => chosen.includes(c.id))

    const fetched = new Map<string, GcalRow[]>()
    for (const cal of calendars) {
      const rows = await readCalendar(cal, access_token, window)
      if (rows) fetched.set(cal.id, rows)
    }

    // Every write below is filtered by user_id: the service role bypasses RLS.
    const stored: StoredGcal[] = []
    for (let from = 0; ; from += 1000) {
      const page = must(await db.from('calendar_events').select('id, starts_at, ends_at, gcal_etag, color, deleted_at, external_ref')
        .eq('user_id', userId).eq('source', 'gcal').gt('ends_at', window.start.toISOString())
        .order('id').range(from, from + 999)) as StoredGcal[]
      stored.push(...page)
      if (page.length < 1000) break
    }

    const plan = planGcalSync(stored, fetched, chosen, window)
    const counts: Counts = { calendars: fetched.size, fetched: [...fetched.values()].reduce((n, r) => n + r.length, 0), new: 0, updated: 0, removed: 0, out: null }

    for (let i = 0; i < plan.remove.length; i += 200) {
      must(await db.from('calendar_events').delete().eq('user_id', userId).eq('source', 'gcal').in('id', plan.remove.slice(i, i + 200)))
    }
    counts.removed = plan.remove.length
    for (const u of plan.update) {
      must(await db.from('calendar_events').update({ ...u.row, deleted_at: null }).eq('id', u.id).eq('user_id', userId).eq('source', 'gcal'))
      counts.updated++
    }
    counts.new = await insertNew(db, plan.insert.map((r) => ({ id: crypto.randomUUID(), user_id: userId, ...r })))

    if (canWrite) counts.out = await writeOut(db, userId, access_token, window, zone, data.mirror !== false)

    must(await saveData({ status: 'ok', synced_at: startedAt, can_write: canWrite }))
    return counts
  } catch (e) {
    if (e instanceof GoogleError && e.status === 401) await saveData({ status: 'failing' })
    throw e
  }
}

/** Our plan → the primary calendar (or, switched off, ours there deleted). Never throws: the read sync
 * already landed, and the next run retries whatever this one couldn't do. */
async function writeOut(db: SupabaseClient, userId: string, token: string, window: { start: Date; end: Date }, zone: string, on: boolean): Promise<Out> {
  try {
    const rows: NativeRow[] = []
    // source 'native' only: a Google row never goes back out (mirrorBodies checks it again).
    for (let from = 0; on; from += 1000) {
      const page = must(await db.from('calendar_events').select('id, title, starts_at, ends_at, all_day, source, busy, deleted_at, recurrence_rule, recurrence_exdates')
        .eq('user_id', userId).eq('source', 'native').eq('all_day', false).is('deleted_at', null)
        .lt('starts_at', window.end.toISOString()).or(`ends_at.gt.${window.start.toISOString()},recurrence_rule.not.is.null`)
        .order('id').range(from, from + 999)) as NativeRow[]
      rows.push(...page)
      if (page.length < 1000) break
    }
    const want = mirrorBodies(rows, window, zone, ruleBetween)
    const r = await writeMirror(planMirror(want, await listMirrored(token)), token, MAX_MIRROR_WRITES)
    if (r.failed) console.error('google-sync: some writes to Google failed', r.failed)
    return { blocks: want.size, ...r }
  } catch (e) {
    console.error('google-sync: writing out failed', describe(e))
    return { blocks: 0, written: 0, failed: 1, pending: 0 }
  }
}

/** Inserts the batch; returns how many landed. A concurrent sync (cron + "Sync now") that got there
 * first trips 0027's unique index — then row by row, skipping the duplicates. */
async function insertNew(db: SupabaseClient, rows: { id: string }[]): Promise<number> {
  if (rows.length === 0) return 0
  const { error } = await db.from('calendar_events').insert(rows)
  if (!error) return rows.length
  if (error.code !== '23505') throw new Error(`db ${error.code}`)
  let n = 0
  for (const row of rows) {
    const { error: e } = await db.from('calendar_events').insert(row)
    if (!e) n++
    else if (e.code !== '23505') throw new Error(`db ${e.code}`)
  }
  return n
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : 'error'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── pg_cron: every connected, non-failing user ──
  if (await isServiceRole(req)) {
    if (!CLIENT_ID || !CLIENT_SECRET) return jsonResponse(req, { users: 0, skipped: 'not_configured' })
    const { data: rows, error } = await db.from('integrations').select('user_id, data, updated_at')
      .eq('provider', 'google').eq('data->>status', 'ok')
    if (error) {
      console.error('google-sync: listing integrations failed', error.code)
      return jsonResponse(req, { error: 'server_error' }, 500)
    }
    const totals = { users: 0, failed: 0, calendars: 0, fetched: 0, new: 0, updated: 0, removed: 0, out: 0 }
    const queue = [...(rows as IntegrationRow[])]
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        totals.users++
        try {
          const c = await syncUser(db, row)
          totals.calendars += c.calendars
          totals.fetched += c.fetched
          totals.new += c.new
          totals.updated += c.updated
          totals.removed += c.removed
          totals.out += c.out?.written ?? 0
        } catch (e) {
          totals.failed++
          console.error('google-sync: user sync failed', describe(e))
        }
      }
    }))
    return jsonResponse(req, totals)
  }

  // ── A signed-in user's "Sync now" ──
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const { data: row, error } = await db.from('integrations').select('user_id, data, updated_at')
    .eq('user_id', auth.user.id).eq('provider', 'google').maybeSingle()
  if (error) return jsonResponse(req, { error: 'server_error' }, 500)
  if (!row || !CLIENT_ID || !CLIENT_SECRET) return jsonResponse(req, { error: 'not_connected' }, 404)
  try {
    return jsonResponse(req, await syncUser(db, row as IntegrationRow))
  } catch (e) {
    console.error('google-sync: sync failed', describe(e))
    if (e instanceof GoogleError) {
      return jsonResponse(req, { error: e.status === 401 ? 'token_expired' : 'google_unavailable' }, e.status === 401 ? 409 : 502)
    }
    return jsonResponse(req, { error: 'server_error' }, 500)
  }
})
