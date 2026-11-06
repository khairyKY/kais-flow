// Calendar subscriptions by link (ics-subscribe, Kai 2026-11-06; migration 0094): an .ics feed on the calendar, read-only,
// no Google account. Two callers, as google-sync:
//  - pg_cron every 3 hours (service-role key from Vault): every user's every subscription.
//  - a signed-in user (Settings › Calendar & time › Subscribed calendars): only their own.
// Anyone else gets 401.
//
//   { action: 'preview', url }                         → { name, color, events, reminders, host }   (nothing stored)
//   { action: 'add', url, name?, color?, use_alarms? } → { id, fetched, new, updated, removed }
//   { action: 'refresh', id? }                         → { fetched, new, updated, removed }   one subscription, or all of theirs
//   { action: 'update', id, name?, color?, use_alarms? } → the same (the rows are rewritten to match)
//   { action: 'remove', id }                           → { removed }   its events go with it
//   { action: 'sync' } (cron only)                     → { subs, failed, fetched, new, updated, removed }
//
// The link is PRIVATE: it can hold a location or a token, so it is stored where only this function reads it (0094's
// column grants), never logged, never in an error, never sent to an AI. Errors are stable codes: bad_url · blocked ·
// unreachable · timeout · http_error · too_large · not_ics · duplicate · too_many · not_found · server_error.
//
// What it fetches (SSRF): http(s) only, no passwords in the link; a name must resolve to public addresses only, an IP
// literal must be public; redirects are followed by hand (3 at most) and every hop is checked again; 5 MB at most; 15 s.
// ponytail: the DNS answer is checked, then fetch resolves again (Deno gives no way to pin the address), so a name that
// flips between public and private inside milliseconds could slip past. The edge runtime has no route to the project's
// private network anyway; upgrade path: a fetch through an allow-listed proxy.
//
// Each run reads the feed in full and keeps the window (60 days back, 400 ahead): _shared/ics.ts parses it, expands
// repeats and plans inserts, updates and removals by external_ref id (uid + recurrence-id). Events that left the feed go;
// a failed read changes nothing.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isServiceRole, requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { userZone } from '../_shared/zone.ts'
import type { RuleBetween } from '../_shared/series.ts'
import { buildRows, hexColor, hostProblem, ICS_MAX_BYTES, ICS_MAX_REDIRECTS, ICS_MAX_SUBSCRIPTIONS, ICS_TIMEOUT_MS, icsWindow, isPrivateIp, looksLikeIcs, normalizeFeedUrl, parseFeed, planIcsSync, type IcsRow, type ParsedFeed, type StoredIcs } from '../_shared/ics.ts'
// rrule is CommonJS: Deno takes its default export only (see mcp/index.ts).
import rrulePkg from 'npm:rrule@2'
const { RRule } = rrulePkg

const between: RuleBetween = (rule, dtstart, after, before) => new RRule({ ...RRule.parseString(rule), dtstart }).between(after, before, true)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
/** Server-side overrides, for the test harness (a hang, a feed bigger than the cap) — never set in production. */
const MAX_BYTES = Number(Deno.env.get('ICS_MAX_BYTES')) || ICS_MAX_BYTES
const TIMEOUT_MS = Number(Deno.env.get('ICS_TIMEOUT_MS')) || ICS_TIMEOUT_MS
const CONCURRENCY = 4

class IcsError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

const STATUS: Record<string, number> = { bad_url: 400, blocked: 400, not_ics: 400, too_large: 400, duplicate: 409, too_many: 409, not_found: 404, unreachable: 502, timeout: 502, http_error: 502, server_error: 500 }
const codeOf = (e: unknown): string => (e instanceof IcsError ? e.code : e instanceof Error && e.message === 'too_large' ? 'too_large' : 'server_error')

// ── fetching ────────────────────────────────────────────────────────────────────────────────────

const IP_LITERAL = /^\d+\.\d+\.\d+\.\d+$/

/** The addresses a name resolves to, or null when this runtime can't say (then only the literal checks stand). */
async function addresses(host: string): Promise<string[] | null> {
  const dns = (Deno as { resolveDns?: (h: string, t: 'A' | 'AAAA') => Promise<string[]> }).resolveDns
  if (typeof dns !== 'function') return null
  const out: string[] = []
  let answered = false
  for (const type of ['A', 'AAAA'] as const) {
    try {
      out.push(...(await dns(host, type)))
      answered = true
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) answered = true // this record type just isn't there
    }
  }
  return answered ? out : null
}

/** Throws unless `u` may be fetched: public IP literal, or a name that resolves only to public addresses. */
async function assertPublic(u: URL): Promise<void> {
  const problem = hostProblem(u)
  if (problem) throw new IcsError(problem)
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host.includes(':') || IP_LITERAL.test(host)) return
  const found = await addresses(host)
  if (found && found.length === 0) throw new IcsError('unreachable')
  if (found?.some(isPrivateIp)) throw new IcsError('blocked')
}

/** The feed's text. Redirects by hand, each hop guarded; the body capped as it streams. */
async function fetchFeed(start: URL): Promise<string> {
  let u = start
  for (let hop = 0; ; hop++) {
    await assertPublic(u)
    let res: Response
    try {
      res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5', 'User-Agent': 'KaisFlow-CalendarSubscription/1' } })
    } catch (e) {
      throw new IcsError(e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'unreachable')
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel().catch(() => undefined)
      if (hop >= ICS_MAX_REDIRECTS) throw new IcsError('unreachable')
      try {
        u = new URL(res.headers.get('location')!, u)
      } catch {
        throw new IcsError('unreachable')
      }
      if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) throw new IcsError('bad_url')
      continue
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined)
      throw new IcsError('http_error')
    }
    if (Number(res.headers.get('content-length')) > MAX_BYTES) {
      await res.body?.cancel().catch(() => undefined)
      throw new IcsError('too_large')
    }
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      const reader = res.body?.getReader()
      for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
        total += r.value.length
        if (total > MAX_BYTES) {
          await reader!.cancel().catch(() => undefined)
          throw new IcsError('too_large')
        }
        chunks.push(r.value)
      }
    } catch (e) {
      if (e instanceof IcsError) throw e
      throw new IcsError(e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'unreachable')
    }
    const all = new Uint8Array(total)
    let at = 0
    for (const c of chunks) {
      all.set(c, at)
      at += c.length
    }
    return new TextDecoder('utf-8').decode(all)
  }
}

/** Fetch + parse. */
async function loadFeed(url: URL, zone: string): Promise<ParsedFeed> {
  const text = await fetchFeed(url)
  if (!looksLikeIcs(text)) throw new IcsError('not_ics')
  return parseFeed(text, zone)
}

// ── the database ────────────────────────────────────────────────────────────────────────────────

interface SubRow {
  id: string
  user_id: string
  url: string
  name: string
  color: string | null
  use_alarms: boolean
}

interface Counts {
  fetched: number
  new: number
  updated: number
  removed: number
}

function must<T>(res: { data: T | null; error: { code?: string } | null }): T {
  if (res.error) throw new Error(`db ${res.error.code ?? 'error'}`)
  return res.data as T
}

async function userZoneOf(db: SupabaseClient, userId: string): Promise<string> {
  const s = must(await db.from('app_settings').select('timezone').eq('user_id', userId).maybeSingle()) as { timezone?: string | null } | null
  return userZone(s?.timezone)
}

async function storedRows(db: SupabaseClient, sub: SubRow): Promise<StoredIcs[]> {
  const stored: StoredIcs[] = []
  for (let from = 0; ; from += 1000) {
    const page = must(await db.from('calendar_events').select('id, title, starts_at, ends_at, all_day, busy, color, remind_min, deleted_at, external_ref')
      .eq('user_id', sub.user_id).eq('source', 'ics').eq('external_ref->>sub_id', sub.id).order('id').range(from, from + 999)) as StoredIcs[]
    stored.push(...page)
    if (page.length < 1000) break
  }
  return stored
}

/** Inserts the batch; a concurrent sync (cron + Refresh) that got there first trips 0027's unique index — then row by row,
 * skipping the duplicates. */
async function insertNew(db: SupabaseClient, rows: { id: string }[]): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await db.from('calendar_events').insert(batch)
    if (!error) {
      n += batch.length
      continue
    }
    if (error.code !== '23505') throw new Error(`db ${error.code}`)
    for (const row of batch) {
      const { error: e } = await db.from('calendar_events').insert(row)
      if (!e) n++
      else if (e.code !== '23505') throw new Error(`db ${e.code}`)
    }
  }
  return n
}

/** Lands `rows` as the subscription's events. Every write is filtered by user_id: the service role bypasses RLS. */
async function land(db: SupabaseClient, sub: SubRow, rows: IcsRow[]): Promise<Counts> {
  const plan = planIcsSync(await storedRows(db, sub), rows)
  for (let i = 0; i < plan.remove.length; i += 200) {
    must(await db.from('calendar_events').delete().eq('user_id', sub.user_id).eq('source', 'ics').in('id', plan.remove.slice(i, i + 200)))
  }
  for (let i = 0; i < plan.update.length; i += 10) {
    await Promise.all(plan.update.slice(i, i + 10).map(async (u) =>
      must(await db.from('calendar_events').update({ ...u.row, deleted_at: null }).eq('id', u.id).eq('user_id', sub.user_id).eq('source', 'ics'))))
  }
  const added = await insertNew(db, plan.insert.map((r) => ({ id: crypto.randomUUID(), user_id: sub.user_id, ...r })))
  return { fetched: rows.length, new: added, updated: plan.update.length, removed: plan.remove.length }
}

const markFailed = (db: SupabaseClient, sub: SubRow, code: string) =>
  db.from('calendar_subscriptions').update({ status: 'failing', error: code }).eq('id', sub.id).eq('user_id', sub.user_id)

/** One subscription, start to finish: fetch, parse, land, record the outcome. A failure is recorded on the row and
 * thrown as its code; the events already there stay as they were. */
async function syncSub(db: SupabaseClient, sub: SubRow, zone: string, feed?: ParsedFeed): Promise<Counts> {
  try {
    const parsed = feed ?? await loadFeed(new URL(sub.url), zone)
    const rows = buildRows(parsed, { subId: sub.id, name: sub.name, color: sub.color, useAlarms: sub.use_alarms, window: icsWindow(new Date()), between })
    const counts = await land(db, sub, rows)
    must(await db.from('calendar_subscriptions').update({ status: 'ok', error: null, synced_at: new Date().toISOString(), event_count: rows.length }).eq('id', sub.id).eq('user_id', sub.user_id))
    return counts
  } catch (e) {
    const code = codeOf(e)
    console.error('ics-sync: a subscription failed', code, e instanceof Error && code === 'server_error' ? e.message : '')
    await markFailed(db, sub, code)
    throw new IcsError(code)
  }
}

const SUB_COLS = 'id, user_id, url, name, color, use_alarms'

// ── a signed-in user ────────────────────────────────────────────────────────────────────────────

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

async function userAction(req: Request, db: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<Response> {
  const fail = (code: string) => jsonResponse(req, { error: code }, STATUS[code] ?? 500)
  try {
    const zone = await userZoneOf(db, userId)
    const own = async (id: unknown): Promise<SubRow | null> => (typeof id === 'string'
      ? (must(await db.from('calendar_subscriptions').select(SUB_COLS).eq('id', id).eq('user_id', userId).maybeSingle()) as SubRow | null)
      : null)

    if (body.action === 'preview' || body.action === 'add') {
      const url = typeof body.url === 'string' ? normalizeFeedUrl(body.url) : null
      if (!url) return fail('bad_url')
      if (body.action === 'add') {
        const { count } = await db.from('calendar_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userId)
        if ((count ?? 0) >= ICS_MAX_SUBSCRIPTIONS) return fail('too_many')
      }
      const feed = await loadFeed(url, zone)
      const color = hexColor(body.color as string) ?? feed.color ?? hexColor(url.searchParams.get('color'))
      const name = text(body.name, 200) ?? feed.name?.slice(0, 200) ?? url.hostname
      if (body.action === 'preview') {
        const rows = buildRows(feed, { subId: 'preview', name, color, useAlarms: true, window: icsWindow(new Date()), between })
        return jsonResponse(req, { name, color, events: rows.length, reminders: rows.some((r) => r.remind_min !== null), host: url.hostname })
      }
      const { data: sub, error } = await db.from('calendar_subscriptions')
        .insert({ user_id: userId, url: url.href, host: url.hostname, name, color, use_alarms: body.use_alarms !== false })
        .select(SUB_COLS).single()
      if (error) return fail(error.code === '23505' ? 'duplicate' : 'server_error')
      const counts = await syncSub(db, sub as SubRow, zone, feed)
      return jsonResponse(req, { id: (sub as SubRow).id, ...counts })
    }

    if (body.action === 'refresh') {
      const subs = body.id === undefined
        ? (must(await db.from('calendar_subscriptions').select(SUB_COLS).eq('user_id', userId).order('created_at')) as SubRow[])
        : [await own(body.id)]
      if (subs.some((s) => !s)) return fail('not_found')
      const total: Counts = { fetched: 0, new: 0, updated: 0, removed: 0 }
      let failed: string | null = null
      for (const sub of subs as SubRow[]) {
        try {
          const c = await syncSub(db, sub, zone)
          for (const k of Object.keys(total) as (keyof Counts)[]) total[k] += c[k]
        } catch (e) {
          failed ??= codeOf(e)
        }
      }
      return failed && subs.length === 1 ? fail(failed) : jsonResponse(req, { ...total, ...(failed ? { failed } : null) })
    }

    if (body.action === 'update') {
      const sub = await own(body.id)
      if (!sub) return fail('not_found')
      const patch: Record<string, unknown> = {}
      const name = text(body.name, 200)
      if (name) patch.name = name
      if (body.color !== undefined) {
        const c = hexColor(body.color as string)
        if (body.color !== null && !c) return jsonResponse(req, { error: 'bad_request' }, 400)
        patch.color = c
      }
      if (typeof body.use_alarms === 'boolean') patch.use_alarms = body.use_alarms
      const updated = Object.keys(patch).length === 0 ? sub : must(await db.from('calendar_subscriptions').update(patch).eq('id', sub.id).eq('user_id', userId).select(SUB_COLS).single()) as SubRow
      return jsonResponse(req, await syncSub(db, updated, zone))
    }

    if (body.action === 'remove') {
      const sub = await own(body.id)
      if (!sub) return fail('not_found')
      const gone = must(await db.from('calendar_events').delete().eq('user_id', userId).eq('source', 'ics').eq('external_ref->>sub_id', sub.id).select('id')) as unknown[]
      must(await db.from('calendar_subscriptions').delete().eq('id', sub.id).eq('user_id', userId))
      return jsonResponse(req, { removed: gone.length })
    }
    return jsonResponse(req, { error: 'bad_request' }, 400)
  } catch (e) {
    return fail(codeOf(e))
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeadersFor(req) })

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── pg_cron: every subscription of every user ──
  if (await isServiceRole(req)) {
    const { data, error } = await db.from('calendar_subscriptions').select(SUB_COLS)
    if (error) {
      console.error('ics-sync: listing subscriptions failed', error.code)
      return jsonResponse(req, { error: 'server_error' }, 500)
    }
    const totals = { subs: 0, failed: 0, fetched: 0, new: 0, updated: 0, removed: 0 }
    const zones = new Map<string, string>()
    const queue = [...(data as SubRow[])]
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (let sub = queue.shift(); sub; sub = queue.shift()) {
        totals.subs++
        try {
          if (!zones.has(sub.user_id)) zones.set(sub.user_id, await userZoneOf(db, sub.user_id))
          const c = await syncSub(db, sub, zones.get(sub.user_id)!)
          totals.fetched += c.fetched
          totals.new += c.new
          totals.updated += c.updated
          totals.removed += c.removed
        } catch {
          totals.failed++ // syncSub recorded why on the row
        }
      }
    }))
    return jsonResponse(req, totals)
  }

  // ── A signed-in user ──
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.action !== 'string') return jsonResponse(req, { error: 'bad_request' }, 400)
  return userAction(req, db, auth.user.id, body)
})
