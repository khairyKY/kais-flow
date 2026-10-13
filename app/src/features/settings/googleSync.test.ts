import { describe, expect, it } from 'vitest'
// The edge functions' pure Google Calendar logic — Deno-free on purpose so it can be tested here.
import { authUrl, dropSynced, GOOGLE_SCOPE, GOOGLE_WRITE_SCOPE, hasScope, isMirrored, mapEvent, MIRROR_KEY, MIRROR_TAG, mirrorBodies, planGcalSync, planMirror, readCalendars, readChosen, readState, returnTo, signState, syncWindow, type GCalendar, type GcalRow, type GMirrored, type NativeRow, type StoredGcal } from '../../../../supabase/functions/_shared/google.ts'
import { ruleBetween } from '../calendar/series'

const PRAYER: GCalendar = { id: 'prayer@group.calendar.google.com', name: 'Prayer times', color: '#9fe1e7' }

describe('mapEvent — one Google event to a read-only calendar_events row', () => {
  it('a timed event: the instant in UTC, whatever offset Google wrote it in', () => {
    const r = mapEvent({ id: 'e1', etag: '"1"', summary: 'Fajr', start: { dateTime: '2026-10-14T04:31:00+03:00' }, end: { dateTime: '2026-10-14T04:46:00+03:00' } }, PRAYER)!
    expect(r).toMatchObject({ title: 'Fajr', starts_at: '2026-10-14T01:31:00.000Z', ends_at: '2026-10-14T01:46:00.000Z', all_day: false, source: 'gcal', gcal_id: 'e1', gcal_etag: '"1"', busy: true, type: 'event', color: '#9fe1e7' })
    expect(r.external_ref).toEqual({ source: 'gcal', id: 'prayer@group.calendar.google.com/e1', calendar: 'Prayer times', calendar_id: PRAYER.id })
  })

  it('the same instant from another zone maps to the same row (no zone guessing)', () => {
    const cairo = mapEvent({ id: 'e', start: { dateTime: '2026-10-14T12:00:00+03:00' }, end: { dateTime: '2026-10-14T12:30:00+03:00' } }, PRAYER)!
    const la = mapEvent({ id: 'e', start: { dateTime: '2026-10-14T02:00:00-07:00' }, end: { dateTime: '2026-10-14T02:30:00-07:00' } }, PRAYER)!
    expect(la.starts_at).toBe(cairo.starts_at)
    expect(la.ends_at).toBe(cairo.ends_at)
  })

  it('an all-day event: its dates at T00:00Z, end exclusive (the app’s all-day convention)', () => {
    expect(mapEvent({ id: 'h', summary: 'Mawlid', start: { date: '2026-10-14' }, end: { date: '2026-10-15' } }, PRAYER)).toMatchObject({ starts_at: '2026-10-14T00:00:00.000Z', ends_at: '2026-10-15T00:00:00.000Z', all_day: true })
    expect(mapEvent({ id: 'h', start: { date: '2026-10-14' }, end: { date: '2026-10-17' } }, PRAYER)).toMatchObject({ starts_at: '2026-10-14T00:00:00.000Z', ends_at: '2026-10-17T00:00:00.000Z' })
    // No (or a bad) end: one day.
    expect(mapEvent({ id: 'h', start: { date: '2026-12-31' } }, PRAYER)!.ends_at).toBe('2027-01-01T00:00:00.000Z')
    expect(mapEvent({ id: 'h', start: { date: '2026-10-14' }, end: { date: '2026-10-14' } }, PRAYER)!.ends_at).toBe('2026-10-15T00:00:00.000Z')
  })

  it('a cancelled event (or one with no usable start) maps to nothing', () => {
    expect(mapEvent({ id: 'c', status: 'cancelled', start: { dateTime: '2026-10-14T10:00:00Z' } }, PRAYER)).toBeNull()
    expect(mapEvent({ id: 'x' }, PRAYER)).toBeNull()
    expect(mapEvent({ id: 'x', start: { dateTime: 'soon' } }, PRAYER)).toBeNull()
    expect(mapEvent({ start: { dateTime: '2026-10-14T10:00:00Z' } }, PRAYER)).toBeNull()
  })

  it('recurring instances (singleEvents=true) are each their own row, keyed by the instance id', () => {
    const a = mapEvent({ id: 'series_20261014T013100Z', start: { dateTime: '2026-10-14T01:31:00Z' }, end: { dateTime: '2026-10-14T01:46:00Z' } }, PRAYER)!
    const b = mapEvent({ id: 'series_20261015T013200Z', start: { dateTime: '2026-10-15T01:32:00Z' }, end: { dateTime: '2026-10-15T01:47:00Z' } }, PRAYER)!
    expect(a.external_ref.id).not.toBe(b.external_ref.id)
  })

  it('no title (a free/busy-only share) reads "Busy"; an end before the start collapses to the start', () => {
    const r = mapEvent({ id: 'b', start: { dateTime: '2026-10-14T10:00:00Z' }, end: { dateTime: '2026-10-14T09:00:00Z' } }, { ...PRAYER, color: null })!
    expect(r.title).toBe('Busy')
    expect(r.ends_at).toBe(r.starts_at)
    expect(r.color).toBeNull()
  })
})

describe('syncWindow — today − 7 … + 60 days on the user’s clock', () => {
  it('starts at the user’s midnight a week back and ends after day +60', () => {
    const now = new Date('2026-10-13T22:30:00Z') // already Wednesday 14 Oct in Cairo (UTC+3)
    const w = syncWindow(now, 'Africa/Cairo')
    expect(w.start.toISOString()).toBe('2026-10-06T21:00:00.000Z') // Wed 7 Oct 00:00 Cairo
    expect(w.end.toISOString()).toBe('2026-12-13T22:00:00.000Z') // Mon 14 Dec 00:00 Cairo (UTC+2 by then)
    const la = syncWindow(now, 'America/Los_Angeles') // still Tuesday 13 Oct there
    expect(la.start.toISOString()).toBe('2026-10-06T07:00:00.000Z')
  })
})

const row = (id: string, at: string, over: Partial<GcalRow> = {}): GcalRow => ({ ...mapEvent({ id, etag: '"1"', summary: id, start: { dateTime: at }, end: { dateTime: at } }, PRAYER)!, ...over })
const stored = (id: string, key: string, at: string, over: Partial<StoredGcal> = {}): StoredGcal => ({
  id, starts_at: at, ends_at: at, gcal_etag: '"1"', color: '#9fe1e7', deleted_at: null,
  external_ref: { source: 'gcal', id: `${PRAYER.id}/${key}`, calendar: 'Prayer times', calendar_id: PRAYER.id }, ...over,
})
const WINDOW = { start: new Date('2026-10-06T21:00:00Z'), end: new Date('2026-12-13T22:00:00Z') }

describe('planGcalSync — inserts, updates, deletes', () => {
  it('new events insert; unchanged ones are left alone; a changed etag updates', () => {
    const fetched = new Map([[PRAYER.id, [row('a', '2026-10-14T01:00:00Z'), row('b', '2026-10-14T09:00:00Z', { gcal_etag: '"2"' }), row('c', '2026-10-15T01:00:00Z')]]])
    const plan = planGcalSync([stored('r-a', 'a', '2026-10-14T01:00:00Z'), stored('r-b', 'b', '2026-10-14T09:00:00Z')], fetched, [PRAYER.id], WINDOW)
    expect(plan.insert.map((r) => r.gcal_id)).toEqual(['c'])
    expect(plan.update.map((u) => u.id)).toEqual(['r-b'])
    expect(plan.remove).toEqual([])
  })

  it('a deleted or cancelled event (gone from the read) is removed — inside the window only', () => {
    const fetched = new Map([[PRAYER.id, [] as GcalRow[]]])
    const plan = planGcalSync([stored('in', 'x', '2026-10-20T10:00:00Z'), stored('before', 'y', '2026-10-01T10:00:00Z')], fetched, [PRAYER.id], WINDOW)
    expect(plan.remove).toEqual(['in']) // history before the window stays
  })

  it('a calendar that failed to read leaves its rows alone', () => {
    const plan = planGcalSync([stored('r', 'x', '2026-10-20T10:00:00Z')], new Map(), [PRAYER.id], WINDOW)
    expect(plan).toEqual({ insert: [], update: [], remove: [] })
  })

  it('a calendar no longer chosen loses its rows', () => {
    const plan = planGcalSync([stored('r', 'x', '2026-10-20T10:00:00Z')], new Map(), [], WINDOW)
    expect(plan.remove).toEqual(['r'])
  })

  it('a synced row trashed in the app, or recoloured / renamed in Google, comes back as Google has it', () => {
    const fetched = new Map([[PRAYER.id, [row('a', '2026-10-14T01:00:00Z'), row('b', '2026-10-14T02:00:00Z', { color: '#ff0000' }), row('c', '2026-10-14T03:00:00Z')]]])
    const renamed = stored('r-c', 'c', '2026-10-14T03:00:00Z', { external_ref: { source: 'gcal', id: `${PRAYER.id}/c`, calendar: 'Old name', calendar_id: PRAYER.id } })
    const plan = planGcalSync([stored('r-a', 'a', '2026-10-14T01:00:00Z', { deleted_at: '2026-10-13T10:00:00Z' }), stored('r-b', 'b', '2026-10-14T02:00:00Z'), renamed], fetched, [PRAYER.id], WINDOW)
    expect(plan.update.map((u) => u.id).sort()).toEqual(['r-a', 'r-b', 'r-c'])
    expect(plan.insert).toEqual([])
  })

  it('two stored copies of one event: one is kept, the other removed', () => {
    const fetched = new Map([[PRAYER.id, [row('a', '2026-10-14T01:00:00Z')]]])
    const plan = planGcalSync([stored('r1', 'a', '2026-10-14T01:00:00Z'), stored('r2', 'a', '2026-10-14T01:00:00Z')], fetched, [PRAYER.id], WINDOW)
    expect(plan.remove).toEqual(['r2'])
    expect(plan.insert).toEqual([])
  })
})

describe('calendars', () => {
  it('readCalendars: primary first, its id is the account, ticked-in-Google ones shown by default', () => {
    const r = readCalendars([
      { id: 'prayer@group', summary: 'Prayer times', backgroundColor: '#9FE1E7', selected: true },
      { id: 'kai@gmail.com', summary: 'kai@gmail.com', summaryOverride: 'Kai', backgroundColor: 'teal', primary: true, selected: true },
      { id: 'hidden@group', summary: 'Holidays', selected: false },
      { id: 'gone@group', summary: 'Old', deleted: true },
    ])
    expect(r.login).toBe('kai@gmail.com')
    expect(r.calendars).toEqual([
      { id: 'kai@gmail.com', name: 'Kai', color: null },
      { id: 'prayer@group', name: 'Prayer times', color: '#9fe1e7' },
      { id: 'hidden@group', name: 'Holidays', color: null },
    ])
    expect(r.selected).toEqual(['kai@gmail.com', 'prayer@group'])
  })

  it('readChosen: only ids of listed calendars, deduped', () => {
    const cals = [PRAYER, { id: 'kai@gmail.com', name: 'Kai', color: null }]
    expect(readChosen([PRAYER.id, PRAYER.id], cals)).toEqual([PRAYER.id])
    expect(readChosen([], cals)).toEqual([])
    expect(readChosen(['someone-else@group'], cals)).toBeNull()
    expect(readChosen('kai@gmail.com', cals)).toBeNull()
    expect(readChosen([1], cals)).toBeNull()
  })
})

describe('OAuth', () => {
  it('authUrl: offline access, consent every time, read + owned-calendar events (least privilege)', () => {
    const u = new URL(authUrl('cid.apps.googleusercontent.com', 'https://x.supabase.co/functions/v1/google-connect', 'st'))
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: 'cid.apps.googleusercontent.com', redirect_uri: 'https://x.supabase.co/functions/v1/google-connect', response_type: 'code', scope: `${GOOGLE_SCOPE} ${GOOGLE_WRITE_SCOPE}`, access_type: 'offline', prompt: 'consent', state: 'st' })
    expect(GOOGLE_WRITE_SCOPE).toBe('https://www.googleapis.com/auth/calendar.events.owned')
  })

  it('hasScope: a token answer’s space-separated scopes; an old read-only grant can’t write', () => {
    expect(hasScope(`${GOOGLE_SCOPE} ${GOOGLE_WRITE_SCOPE}`, GOOGLE_WRITE_SCOPE)).toBe(true)
    expect(hasScope(GOOGLE_SCOPE, GOOGLE_WRITE_SCOPE)).toBe(false)
    expect(hasScope(`${GOOGLE_SCOPE} https://www.googleapis.com/auth/calendar.events.owned.readonly`, GOOGLE_WRITE_SCOPE)).toBe(false)
    expect(hasScope(undefined, GOOGLE_SCOPE)).toBe(false)
  })

  it('state: signed round trip; a tampered, foreign, or expired state is refused', async () => {
    const p = { u: 'user-1', r: 'https://kais-flow.kaidagoat.workers.dev', e: 2_000 }
    const s = await signState(p, 'secret')
    expect(await readState(s, 'secret', 1_000)).toEqual(p)
    expect(await readState(s, 'other-secret', 1_000)).toBeNull()
    expect(await readState(s, 'secret', 3_000)).toBeNull()
    const forged = await signState({ ...p, u: 'user-2' }, 'guess')
    expect(await readState(`${forged.split('.')[0]}.${s.split('.')[1]}`, 'secret', 1_000)).toBeNull()
    expect(await readState(null, 'secret')).toBeNull()
    expect(await readState('a.b.c', 'secret')).toBeNull()
  })

  it('returnTo: an allowed http(s) origin, else the public web app', () => {
    const allowed = (o: string) => o === 'http://localhost:5277' || o === 'https://localhost'
    expect(returnTo('http://localhost:5277/', allowed, 'https://app')).toBe('http://localhost:5277')
    expect(returnTo('https://evil.example', allowed, 'https://app')).toBe('https://app')
    expect(returnTo('capacitor://localhost', () => true, 'https://app')).toBe('https://app')
    expect(returnTo('http://localhost:5277/settings', allowed, 'https://app')).toBe('https://app')
    expect(returnTo(undefined, allowed, 'https://app')).toBe('https://app')
  })
})

describe('privacy: Google events never reach an AI (site info §3)', () => {
  it('dropSynced: chat’s search hits lose the Google events, keep everything else', () => {
    const hits = [
      { entity_type: 'calendar_event', entity_id: 'g-1', title: 'Dhuhr' },
      { entity_type: 'calendar_event', entity_id: 'n-1', title: 'Lunch with Omar' },
      { entity_type: 'task', entity_id: 'g-1', title: 'a task that happens to share the id' },
      { entity_type: 'journal_entry', entity_id: 'j-1', title: 'Today' },
    ]
    expect(dropSynced(hits, new Set(['g-1'])).map((h) => h.title)).toEqual(['Lunch with Omar', 'a task that happens to share the id', 'Today'])
    // chat fails closed: when the look-up errors it passes every event hit's id as "synced".
    expect(dropSynced(hits, new Set(['g-1', 'n-1'])).every((h) => h.entity_type !== 'calendar_event')).toBe(true)
    expect(dropSynced(hits, new Set())).toHaveLength(4)
  })
})

// ── our plan out to Google as busy (Kai 2026-10-14) ──
describe('mirror — our blocks to the primary calendar as busy', () => {
  // Wed 14 Oct 2026, 10:00 Cairo → the window is 7 Oct … 14 Dec (Cairo midnights).
  const W = syncWindow(new Date('2026-10-14T07:00:00Z'), 'Africa/Cairo')
  const row = (id: string, over: Partial<NativeRow> = {}): NativeRow => ({ id, title: 'Deep work', starts_at: '2026-10-14T06:00:00.000Z', ends_at: '2026-10-14T08:00:00.000Z', all_day: false, source: 'native', busy: true, deleted_at: null, recurrence_rule: null, recurrence_exdates: [], ...over })
  const want = (rows: NativeRow[]) => mirrorBodies(rows, W, 'Africa/Cairo', ruleBetween)
  const ours = (key: string, over: Partial<GMirrored> = {}): GMirrored => ({ id: `g-${key}`, status: 'confirmed', summary: 'Deep work', start: { dateTime: '2026-10-14T09:00:00+03:00' }, end: { dateTime: '2026-10-14T11:00:00+03:00' }, visibility: 'private', extendedProperties: { private: { [MIRROR_KEY]: key, [MIRROR_TAG]: '1' } }, ...over })

  it('a timed block → a private, busy event with our id, no Google reminders', () => {
    expect(want([row('a')]).get('a')).toEqual({
      summary: 'Deep work', start: { dateTime: '2026-10-14T06:00:00.000Z' }, end: { dateTime: '2026-10-14T08:00:00.000Z' },
      transparency: 'opaque', visibility: 'private', reminders: { useDefault: false },
      extendedProperties: { private: { kaisflow: 'a', kaisflow_mirror: '1' } },
    })
  })

  it('which rows go: native, timed, live, inside the window — never a Google row (no loop)', () => {
    const w = want([
      row('keep'),
      row('gcal', { source: 'gcal' }),
      row('allday', { all_day: true, starts_at: '2026-10-14T00:00:00.000Z', ends_at: '2026-10-15T00:00:00.000Z' }),
      row('trashed', { deleted_at: '2026-10-13T10:00:00Z' }),
      row('past', { starts_at: '2026-10-01T06:00:00.000Z', ends_at: '2026-10-01T07:00:00.000Z' }),
      row('far', { starts_at: '2027-01-10T06:00:00.000Z', ends_at: '2027-01-10T07:00:00.000Z' }),
      row('empty', { ends_at: '2026-10-14T06:00:00.000Z' }),
      row('edge', { starts_at: '2026-10-06T20:30:00.000Z', ends_at: '2026-10-06T21:30:00.000Z' }), // runs past 7 Oct 00:00 Cairo
    ])
    expect([...w.keys()]).toEqual(['keep', 'edge'])
  })

  it('a block marked Free stays free there; no title reads Busy', () => {
    expect(want([row('f', { busy: false })]).get('f')!.transparency).toBe('transparent')
    expect(want([row('t', { title: '  ' })]).get('t')!.summary).toBe('Busy')
  })

  it('a repeating series: one event per occurrence in the window, keyed by occurrence id, skips excluded', () => {
    // Every Wednesday 09:00 Cairo from 14 Oct, the 21st skipped.
    const w = want([row('s', { recurrence_rule: 'FREQ=WEEKLY', recurrence_exdates: ['2026-10-21T06:00:00.000Z'] })])
    const keys = [...w.keys()]
    expect(keys[0]).toBe('s::2026-10-14T06:00:00.000Z')
    expect(keys).not.toContain('s::2026-10-21T06:00:00.000Z')
    expect(keys).toContain('s::2026-10-28T06:00:00.000Z')
    expect(keys.every((k) => Date.parse(k.split('::')[1]) < W.end.getTime())).toBe(true)
    expect(keys).toHaveLength(8) // 14 Oct … 9 Dec, less the 21st
    expect(w.get('s::2026-10-28T06:00:00.000Z')!.extendedProperties.private.kaisflow).toBe('s::2026-10-28T06:00:00.000Z')
    // A trashed series sends nothing.
    expect(want([row('s', { recurrence_rule: 'FREQ=DAILY', deleted_at: '2026-10-13T00:00:00Z' })]).size).toBe(0)
  })

  it('plan: create what Google lacks, leave what matches (Google’s own offset, transparency omitted), update what drifted', () => {
    const w = want([row('a'), row('b', { title: 'Write' }), row('c', { starts_at: '2026-10-14T05:00:00.000Z' })])
    const plan = planMirror(w, [ours('a'), ours('b'), ours('c')])
    expect(plan.create).toEqual([])
    expect(plan.update.map((u) => [u.id, u.body.summary, u.body.start.dateTime])).toEqual([['g-b', 'Write', '2026-10-14T06:00:00.000Z'], ['g-c', 'Deep work', '2026-10-14T05:00:00.000Z']])
    expect(plan.remove).toEqual([])
    // Free in the app, busy in Google → put back; same for a visibility someone changed in Google.
    expect(planMirror(want([row('a', { busy: false })]), [ours('a')]).update).toHaveLength(1)
    expect(planMirror(want([row('a')]), [ours('a', { visibility: 'default' })]).update).toHaveLength(1)
    // Missing in Google → created, soonest first.
    const fresh = planMirror(want([row('late', { starts_at: '2026-10-20T06:00:00.000Z', ends_at: '2026-10-20T07:00:00.000Z' }), row('soon')]), [])
    expect(fresh.create.map((b) => b.extendedProperties.private.kaisflow)).toEqual(['soon', 'late'])
  })

  it('plan: ours whose row is gone, trashed or out of the window go; a duplicate goes; a cancelled one is left', () => {
    const plan = planMirror(want([row('a')]), [ours('a'), ours('a', { id: 'g-dup' }), ours('gone'), ours('old', { status: 'cancelled' })])
    expect(plan.remove).toEqual(['g-dup', 'g-gone'])
    expect(plan.update).toEqual([])
  })

  it('never touches a Google event without our private properties — even with nothing wanted', () => {
    const foreign: GMirrored[] = [
      { id: 'meeting', summary: 'Deep work', start: { dateTime: '2026-10-14T09:00:00+03:00' }, end: { dateTime: '2026-10-14T11:00:00+03:00' } },
      { id: 'key-only', extendedProperties: { private: { [MIRROR_KEY]: 'a' } } },
      { id: 'tag-only', extendedProperties: { private: { [MIRROR_TAG]: '1' } } },
      { id: 'shared-prop', extendedProperties: { shared: { [MIRROR_KEY]: 'a', [MIRROR_TAG]: '1' } } as unknown as GMirrored['extendedProperties'] },
      { extendedProperties: { private: { [MIRROR_KEY]: 'a', [MIRROR_TAG]: '1' } } },
    ]
    expect(foreign.some(isMirrored)).toBe(false)
    expect(planMirror(want([row('a')]), foreign)).toEqual({ create: [want([row('a')]).get('a')], update: [], remove: [] })
    // Switched off / disconnect: a plan that wants nothing deletes ours, and only ours.
    expect(planMirror(new Map(), [...foreign, ours('a'), ours('b')])).toEqual({ create: [], update: [], remove: ['g-a', 'g-b'] })
  })

  it('read side: our own event in the primary calendar never comes back in as a Google row', () => {
    const kai: GCalendar = { id: 'kai@gmail.com', name: 'Kai', color: null }
    expect(mapEvent(ours('a'), kai)).toBeNull()
    expect(mapEvent({ id: 'm', summary: 'Standup', start: { dateTime: '2026-10-14T09:00:00Z' }, end: { dateTime: '2026-10-14T09:15:00Z' } }, kai)).not.toBeNull()
  })
})
