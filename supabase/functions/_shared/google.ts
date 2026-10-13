// Google Calendar sync (parity audit B1 → option a, Kai 2026-10-13): outside calendars (his prayer
// times) on our own grid, READ-ONLY there. The pure half of google-connect / google-sync — no Deno APIs, so
// the app's vitest runs it (app/src/features/settings/googleSync.test.ts).
//
// integrations row, provider 'google', `data` = {
//   refresh_token,                      server-side only, never selected by the client
//   login,                              the account (its primary calendar's id is its email)
//   calendars: [{id, name, color}],     every calendar the account lists (non-secret)
//   chosen: [calendar id…],             the ones shown on the grid (non-secret)
//   status: 'ok'|'failing', synced_at   like GitHub's: 'failing' after Google refused the refresh token
//   can_write,                          the grant includes GOOGLE_WRITE_SCOPE (Kai 2026-10-14)
//   mirror,                             "Show my plan in Google as busy"; absent = on
// }
// Synced events are calendar_events rows with source 'gcal', gcal_id / gcal_etag, and
// external_ref {source:'gcal', id:'<calendar id>/<event id>', calendar:<name>, calendar_id} — 0027's
// unique index dedupes them. The app never writes them (calendar/api writeEvent).
// The other way (Kai 2026-10-14, "write blocks to google as busy"): our own timed blocks go to the
// account's PRIMARY calendar as private busy events, tagged with our private extended properties —
// see "our plan out to Google" below.
import { addDays, dateKey, wallToInstant } from './zone.ts'
import { expandSeries, type RuleBetween, type SeriesRow } from './series.ts'

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
/** Least privilege for writing our blocks out: "See, create, change, and delete events on Google
 * calendars you own" (developers.google.com/workspace/calendar/api/auth, checked 2026-10-14) — not
 * calendar.events, which reaches every calendar the account can edit. */
export const GOOGLE_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned'
/** Whether a token response's space-separated `scope` includes `scope`. */
export const hasScope = (granted: string | undefined, scope: string): boolean => (granted ?? '').split(' ').includes(scope)
export const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
export const GOOGLE_API = 'https://www.googleapis.com/calendar/v3'

/** The window each sync reads, in days around today on the user's clock. */
export const SYNC_PAST_DAYS = 7
export const SYNC_AHEAD_DAYS = 60
/** How many calendars one account can show (a sync reads each one). */
export const MAX_CALENDARS = 20

export interface GCalendar {
  id: string
  name: string
  /** Google's background colour for it ("#9fe1e7"); null = the grid's own event hue. */
  color: string | null
}

export interface GoogleData {
  refresh_token?: string
  login?: string
  calendars?: GCalendar[]
  chosen?: string[]
  status?: 'ok' | 'failing'
  synced_at?: string | null
  can_write?: boolean
  mirror?: boolean
}

// ── OAuth ───────────────────────────────────────────────────────────────────────────────────────

/** Google's consent page. offline + prompt=consent: a refresh token every time, so a reconnect
 * always replaces a dead one. */
export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // Both every time: a grant from before 2026-10-14 lacks the write scope, and Reconnect adds it.
    scope: `${GOOGLE_SCOPE} ${GOOGLE_WRITE_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${GOOGLE_AUTH}?${q}`
}

/** What rides through Google in `state`: whose connect this is, where to send the browser back to,
 * and until when it's good. Signed, because the callback has no session of its own. */
export interface StatePayload {
  u: string
  r: string
  e: number
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))))
}

export async function signState(p: StatePayload, secret: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(p)))
  return `${body}.${await hmac(secret, body)}`
}

/** The payload, or null when the signature is wrong, it's expired, or it isn't ours at all. */
export async function readState(state: string | null, secret: string, now = Date.now()): Promise<StatePayload | null> {
  const [body, sig, extra] = (state ?? '').split('.')
  if (!body || !sig || extra !== undefined) return null
  const want = await hmac(secret, body)
  // ponytail: plain compare — the HMAC is over our own short-lived payload, not a stored secret.
  if (want !== sig) return null
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64url(body))) as StatePayload
    return typeof p.u === 'string' && typeof p.r === 'string' && typeof p.e === 'number' && p.e > now ? p : null
  } catch {
    return null
  }
}

/** Where the browser lands after Google: the app it came from — only an http(s) origin the
 * functions already trust (`allowed`, cors.ts isAllowedOrigin) — else the public web app. */
export function returnTo(origin: unknown, allowed: (o: string) => boolean, fallback: string): string {
  const o = typeof origin === 'string' ? origin.replace(/\/+$/, '') : ''
  return /^https?:\/\/[^/]+$/.test(o) && allowed(o) ? o : fallback
}

/** A Google answer we can't use. 401 = the refresh token is dead (revoked, expired — a "Testing"
 * consent screen's tokens last 7 days): the row flips to 'failing' and Settings says reconnect. */
export class GoogleError extends Error {
  readonly status: number
  constructor(status: number, code = '') {
    super(`google ${status}${code ? ` ${code}` : ''}`)
    this.status = status
  }
}

/** POST to Google's token endpoint (a code exchange or a refresh). */
export async function googleToken(form: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; scope?: string }> {
  const res = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error?: string }
  if (!res.ok || !body.access_token) throw new GoogleError(body.error === 'invalid_grant' ? 401 : res.status || 502, body.error ?? '')
  return body as { access_token: string; refresh_token?: string; scope?: string }
}

/** GET from the Calendar API. */
export async function gGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GOOGLE_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    await res.body?.cancel()
    throw new GoogleError(res.status)
  }
  return (await res.json()) as T
}

/** A write to the Calendar API (our own events only — see planMirror). A DELETE answers no body. */
export async function gSend(method: 'POST' | 'PATCH' | 'DELETE', path: string, accessToken: string, body?: unknown): Promise<void> {
  const res = await fetch(`${GOOGLE_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  await res.body?.cancel()
  if (!res.ok) throw new GoogleError(res.status)
}

// ── calendars ───────────────────────────────────────────────────────────────────────────────────

export interface GCalendarListEntry {
  id?: string
  summary?: string
  summaryOverride?: string
  backgroundColor?: string
  primary?: boolean
  selected?: boolean
  deleted?: boolean
}

/** calendarList → our list (primary first, then as Google orders them), the account, and the
 * calendars shown by default — the ones ticked in Google Calendar itself. */
export function readCalendars(items: readonly GCalendarListEntry[]): { calendars: GCalendar[]; login: string | null; selected: string[] } {
  const live = items.filter((c) => c.id && !c.deleted)
  const sorted = [...live.filter((c) => c.primary), ...live.filter((c) => !c.primary)].slice(0, MAX_CALENDARS)
  const color = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null)
  return {
    calendars: sorted.map((c) => ({ id: c.id!, name: c.summaryOverride || c.summary || c.id!, color: color(c.backgroundColor) })),
    login: live.find((c) => c.primary)?.id ?? null,
    selected: sorted.filter((c) => c.selected || c.primary).map((c) => c.id!),
  }
}

/** A "choose" request's ids, kept only when every one is a calendar we listed. */
export function readChosen(ids: unknown, calendars: readonly GCalendar[]): string[] | null {
  if (!Array.isArray(ids) || ids.length > MAX_CALENDARS) return null
  const known = new Set(calendars.map((c) => c.id))
  const out = [...new Set(ids)]
  return out.every((id) => typeof id === 'string' && known.has(id)) ? (out as string[]) : null
}

// ── events ──────────────────────────────────────────────────────────────────────────────────────

/** The [start, end) a sync reads: SYNC_PAST_DAYS before today to SYNC_AHEAD_DAYS after it, whole days
 * on the user's clock. */
export function syncWindow(now: Date, zone: string): { start: Date; end: Date } {
  const today = dateKey(now, zone)
  return { start: wallToInstant(addDays(today, -SYNC_PAST_DAYS), 0, 0, zone), end: wallToInstant(addDays(today, SYNC_AHEAD_DAYS + 1), 0, 0, zone) }
}

export interface GEventTime {
  date?: string
  dateTime?: string
}

/** events.list's item (singleEvents=true: a repeat arrives as its instances). */
export interface GEvent {
  id?: string
  etag?: string
  status?: string
  summary?: string
  start?: GEventTime
  end?: GEventTime
  extendedProperties?: { private?: Record<string, string> }
}

export interface GcalRef {
  source: 'gcal'
  id: string
  calendar: string
  calendar_id: string
}

/** The columns a synced event writes. */
export interface GcalRow {
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  source: 'gcal'
  gcal_id: string
  gcal_etag: string | null
  busy: boolean
  type: 'event'
  color: string | null
  external_ref: GcalRef
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function instant(t: GEventTime | undefined): string | null {
  if (!t?.dateTime) return null
  const ms = Date.parse(t.dateTime)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** One Google event → our row; null for a cancelled one (or one without a usable start).
 * All-day: the dates in no zone at T00:00Z, end exclusive — the app's own all-day convention
 * (QuickCreate, daySpans.spanDays). Timed: the instant, stored UTC. */
export function mapEvent(ev: GEvent, cal: GCalendar): GcalRow | null {
  if (!ev.id || ev.status === 'cancelled') return null
  // One of our own blocks, written out to the primary calendar: it's already on the grid (no loop).
  if (ev.extendedProperties?.private?.[MIRROR_KEY]) return null
  let starts: string | null
  let ends: string | null
  const allDay = !!ev.start?.date && !ev.start.dateTime
  if (allDay) {
    if (!DATE_RE.test(ev.start!.date!)) return null
    const first = ev.start!.date!
    const end = ev.end?.date && DATE_RE.test(ev.end.date) && ev.end.date > first ? ev.end.date : addDays(first, 1)
    starts = `${first}T00:00:00.000Z`
    ends = `${end}T00:00:00.000Z`
  } else {
    starts = instant(ev.start)
    if (!starts) return null
    ends = instant(ev.end)
    if (!ends || ends < starts) ends = starts
  }
  return {
    title: ev.summary?.trim() || 'Busy', // an event shared as free/busy only has no title
    starts_at: starts,
    ends_at: ends,
    all_day: allDay,
    source: 'gcal',
    gcal_id: ev.id,
    gcal_etag: ev.etag ?? null,
    // Kai's prayer times come from a calendar he can't edit, so Google's per-event "Show as: Available"
    // can't be changed there. ponytail: every synced event is busy (blocks free time and planning);
    // honour transparency per calendar if a calendar ever needs to stay out of the way.
    busy: true,
    type: 'event',
    color: cal.color,
    external_ref: { source: 'gcal', id: `${cal.id}/${ev.id}`, calendar: cal.name, calendar_id: cal.id },
  }
}

/** A stored synced row, as much of it as the plan reads. */
export interface StoredGcal {
  id: string
  starts_at: string
  ends_at: string
  gcal_etag: string | null
  color: string | null
  deleted_at: string | null
  external_ref: Partial<GcalRef> | null
}

export interface GcalPlan {
  insert: GcalRow[]
  update: { id: string; row: GcalRow }[]
  remove: string[]
}

/**
 * What one sync writes. `fetched`: each calendar read in full this run → its mapped rows (a calendar
 * that failed to read is absent, and its rows are left alone). `stored`: the synced rows that end
 * after the window's start. A row comes back as it is in Google when its etag, colour or calendar name
 * changed — or when something in the app trashed it (Google is the truth). A stored row whose calendar
 * was read and no longer lists it inside the window (deleted, cancelled, moved out) goes; so does any
 * row of a calendar no longer chosen. Rows before the window stay as history.
 */
export function planGcalSync(stored: readonly StoredGcal[], fetched: ReadonlyMap<string, readonly GcalRow[]>, chosen: readonly string[], window: { start: Date; end: Date }): GcalPlan {
  const want = new Map<string, GcalRow>()
  for (const rows of fetched.values()) for (const r of rows) want.set(r.external_ref.id, r)
  const pick = new Set(chosen)
  const seen = new Set<string>()
  const plan: GcalPlan = { insert: [], update: [], remove: [] }
  const ws = window.start.getTime()
  const we = window.end.getTime()
  for (const s of stored) {
    const key = s.external_ref?.id ?? ''
    const cal = s.external_ref?.calendar_id ?? ''
    const row = want.get(key)
    if (row && !seen.has(key)) {
      seen.add(key)
      if (s.gcal_etag !== row.gcal_etag || s.color !== row.color || s.deleted_at || s.external_ref?.calendar !== row.external_ref.calendar) plan.update.push({ id: s.id, row })
      continue
    }
    const inWindow = Date.parse(s.ends_at) > ws && Date.parse(s.starts_at) < we
    if (!pick.has(cal) || (fetched.has(cal) && inWindow) || row) plan.remove.push(s.id) // `row` here = a duplicate of one kept
  }
  for (const [key, row] of want) if (!seen.has(key)) plan.insert.push(row)
  return plan
}

// ── our plan out to Google as busy (Kai 2026-10-14) ─────────────────────────────────────────────
// Every native, timed, live calendar_events row in the sync window — time blocks, task blocks, the
// user's own events; a repeating series as one Google event per occurrence — becomes a private, busy
// event on the account's PRIMARY calendar, without Google's reminders (ours already ring). Google holds
// only the window: an event whose row is gone, trashed, all-day now, or outside the window (moved out,
// or slid past the start) is deleted. We touch ONLY events carrying our private properties, and never
// write a 'gcal' row out (mirrorBodies takes source 'native' only; mapEvent drops ours on the way in).

/** Our private extended properties: `kaisflow` = our event id (an occurrence's "<row id>::<start>");
 * `kaisflow_mirror` = '1', the tag events.list filters on (Google matches private properties exactly). */
export const MIRROR_KEY = 'kaisflow'
export const MIRROR_TAG = 'kaisflow_mirror'
/** Writes per run; the rest wait 15 minutes. Keeps a first run over a full plan inside Google's
 * per-user rate limit and the function's time limit. */
export const MAX_MIRROR_WRITES = 150

/** A calendar_events row, as much of it as the mirror reads. */
export interface NativeRow extends SeriesRow {
  title: string
  source: string
  busy?: boolean | null
}

export interface MirrorBody {
  summary: string
  start: { dateTime: string }
  end: { dateTime: string }
  transparency: 'opaque' | 'transparent'
  visibility: 'private'
  reminders: { useDefault: false }
  extendedProperties: { private: Record<string, string> }
}

/** events.list's item, for our own events. */
export interface GMirrored extends GEvent {
  transparency?: string
  visibility?: string
}

/** Ours: both private properties. Nothing else is ever changed or deleted. */
export const isMirrored = (g: GMirrored): boolean => !!g.id && g.extendedProperties?.private?.[MIRROR_TAG] === '1' && !!g.extendedProperties.private[MIRROR_KEY]

/** What Google should hold, keyed by our (occurrence) id. A block marked Free stays free there too. */
export function mirrorBodies(rows: readonly NativeRow[], window: { start: Date; end: Date }, zone: string, between: RuleBetween): Map<string, MirrorBody> {
  const live = rows.filter((r) => r.source === 'native' && !r.all_day && !r.deleted_at)
  const out = new Map<string, MirrorBody>()
  for (const r of expandSeries(live, window.start, window.end, zone, between)) {
    const s = Date.parse(r.starts_at)
    const e = Date.parse(r.ends_at)
    if (!(e > s && s < window.end.getTime() && e > window.start.getTime())) continue
    out.set(r.id, {
      summary: r.title.trim() || 'Busy',
      start: { dateTime: new Date(s).toISOString() },
      end: { dateTime: new Date(e).toISOString() },
      transparency: r.busy === false ? 'transparent' : 'opaque',
      visibility: 'private',
      reminders: { useDefault: false },
      extendedProperties: { private: { [MIRROR_KEY]: r.id, [MIRROR_TAG]: '1' } },
    })
  }
  return out
}

export interface MirrorPlan {
  create: MirrorBody[]
  update: { id: string; body: MirrorBody }[]
  remove: string[]
}

const sameInstant = (t: GEventTime | undefined, iso: string) => !!t?.dateTime && Date.parse(t.dateTime) === Date.parse(iso)

/** `want` (mirrorBodies) against what Google lists. Ours that match are left alone, ours that drifted
 * (title, times, busy/free, visibility — someone edited it in Google too) are put back, ours not wanted
 * (and duplicates) go, wanted ones Google lacks are created, soonest first. Anything not ours is skipped. */
export function planMirror(want: ReadonlyMap<string, MirrorBody>, listed: readonly GMirrored[]): MirrorPlan {
  const plan: MirrorPlan = { create: [], update: [], remove: [] }
  const seen = new Set<string>()
  for (const g of listed) {
    if (!isMirrored(g) || g.status === 'cancelled') continue
    const key = g.extendedProperties!.private![MIRROR_KEY]
    const body = want.get(key)
    if (!body || seen.has(key)) {
      plan.remove.push(g.id!)
      continue
    }
    seen.add(key)
    const same = g.summary === body.summary && sameInstant(g.start, body.start.dateTime) && sameInstant(g.end, body.end.dateTime) &&
      (g.transparency ?? 'opaque') === body.transparency && g.visibility === body.visibility
    if (!same) plan.update.push({ id: g.id!, body })
  }
  for (const [key, body] of want) if (!seen.has(key)) plan.create.push(body)
  plan.create.sort((a, b) => Date.parse(a.start.dateTime) - Date.parse(b.start.dateTime))
  return plan
}

/** Every event we wrote to the primary calendar, wherever it sits in time. Throws rather than return
 * part of the list: a plan from half a list would write duplicates. */
export async function listMirrored(token: string): Promise<GMirrored[]> {
  const out: GMirrored[] = []
  let page = ''
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ privateExtendedProperty: `${MIRROR_TAG}=1`, maxResults: '2500', fields: 'items(id,status,summary,start,end,transparency,visibility,extendedProperties),nextPageToken' })
    if (page) q.set('pageToken', page)
    const res = await gGet<{ items?: GMirrored[]; nextPageToken?: string }>(`/calendars/primary/events?${q}`, token)
    out.push(...(res.items ?? []))
    page = res.nextPageToken ?? ''
    if (!page) return out
  }
  throw new Error('google: too many mirrored events to list')
}

/** Runs a plan on the primary calendar: removes, then updates, then creates, at most `cap` writes, four
 * at a time. Already gone (404/410) counts as done; a refusal the rest would get too (401, 403, 429)
 * stops it — the next run picks up from what Google then lists. */
export async function writeMirror(plan: MirrorPlan, token: string, cap = Infinity): Promise<{ written: number; failed: number; pending: number }> {
  const path = (id?: string) => `/calendars/primary/events${id ? `/${encodeURIComponent(id)}` : ''}`
  const jobs: (() => Promise<void>)[] = [
    ...plan.remove.map((id) => () => gSend('DELETE', path(id), token)),
    ...plan.update.map((u) => () => gSend('PATCH', path(u.id), token, u.body)),
    ...plan.create.map((b) => () => gSend('POST', path(), token, b)),
  ]
  const todo = jobs.slice(0, cap)
  let written = 0
  let failed = 0
  let stop = false
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let job = todo.shift(); job && !stop; job = todo.shift()) {
      try {
        await job()
        written++
      } catch (e) {
        const s = e instanceof GoogleError ? e.status : 0
        if (s === 404 || s === 410) written++
        else {
          failed++
          if (s === 401 || s === 403 || s === 429) stop = true
        }
      }
    }
  }))
  return { written, failed, pending: jobs.length - written - failed }
}

// ── the AI never sees them ──────────────────────────────────────────────────────────────────────

/** The privacy promise (site/src/pages/info.mjs §3): Google-synced events are never sent to an AI. A
 * search-hit list (search_hybrid — chat's grounding) minus the Google events in it; `synced` = the ids
 * of the hits' calendar events that are source 'gcal'. Chat's snapshot and the MCP tools leave them
 * out in their own queries (source = 'native'). */
export function dropSynced<T extends { entity_type: string; entity_id: string }>(hits: readonly T[], synced: ReadonlySet<string>): T[] {
  return hits.filter((h) => !(h.entity_type === 'calendar_event' && synced.has(String(h.entity_id))))
}
