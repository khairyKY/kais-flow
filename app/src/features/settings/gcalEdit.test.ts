import { describe, expect, it } from 'vitest'
// gcal-events: the pure half of editing a Google event from the app (edge function google-sync's `edit` / `undo`), and
// what a synced row carries for it (mapEvent: edit / url / link / master). Deno-free on purpose, as googleSync.test.ts.
import { editable, joinUrl, mapEvent, planGcalSync, readCalendars, type GCalendar, type GEvent, type StoredGcal } from '../../../../supabase/functions/_shared/google.ts'
import { editError, planGcalChange, readChange, readOps, runOps, timeBody, timesOf, type GcalIO, type GcalOp, type PlanInput } from '../../../../supabase/functions/_shared/gcalEdit.ts'
import { GoogleError } from '../../../../supabase/functions/_shared/google.ts'
import { ruleBetween } from '../calendar/series'

const MINE: GCalendar = { id: 'kai@gmail.com', name: 'Kai', color: '#4986e7', role: 'owner' }
const SHARED: GCalendar = { id: 'team@group.calendar.google.com', name: 'Team', color: null, role: 'writer' }
const ZONE = 'Africa/Cairo'
const NOW = '2026-10-12T08:00:00.000Z'

const ev = (over: GEvent = {}): GEvent => ({ id: 'e1', etag: '"1"', summary: 'Standup', start: { dateTime: '2026-10-12T10:00:00+03:00' }, end: { dateTime: '2026-10-12T10:30:00+03:00' }, ...over })

describe('mapEvent — what a Google row carries for editing, joining and opening', () => {
  it('edit: only with the write grant, on a calendar we own, for a plain event we organise', () => {
    expect(mapEvent(ev(), MINE, true)!.external_ref.edit).toBe(true)
    expect(mapEvent(ev(), MINE)!.external_ref.edit).toBeUndefined() // a grant without the write scope
    expect(mapEvent(ev(), SHARED, true)!.external_ref.edit).toBeUndefined() // someone else's calendar: the scope doesn't reach it
    expect(mapEvent(ev(), { ...MINE, role: undefined }, true)!.external_ref.edit).toBeUndefined() // a list read before roles existed
    expect(editable(ev({ eventType: 'birthday' }), MINE)).toBe(false)
    expect(editable(ev({ eventType: 'fromGmail' }), MINE)).toBe(false)
    expect(editable(ev({ eventType: 'default' }), MINE)).toBe(true)
    expect(editable(ev({ locked: true }), MINE)).toBe(false)
  })

  it('an invitation on our calendar: ours to change only when the organiser lets guests', () => {
    expect(editable(ev({ organizer: { self: false } }), MINE)).toBe(false)
    expect(editable(ev({ organizer: { self: false }, guestsCanModify: true }), MINE)).toBe(true)
    expect(editable(ev({ organizer: { self: true } }), MINE)).toBe(true)
  })

  it('the Meet link (hangoutLink) or another video entry point becomes `url`; the page `link`; a repeat’s `master`', () => {
    const meet = mapEvent(ev({ hangoutLink: 'https://meet.google.com/abc-defg-hij', htmlLink: 'https://www.google.com/calendar/event?eid=x', recurringEventId: 'series' }), MINE, true)!
    expect(meet.external_ref).toMatchObject({ url: 'https://meet.google.com/abc-defg-hij', link: 'https://www.google.com/calendar/event?eid=x', master: 'series', edit: true })
    const zoom = mapEvent(ev({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1555' }, { entryPointType: 'video', uri: 'https://zoom.us/j/1' }] } }), MINE)!
    expect(zoom.external_ref.url).toBe('https://zoom.us/j/1')
    expect(joinUrl(ev({ hangoutLink: 'javascript:alert(1)' }))).toBeNull() // a join link is https, whatever Google says
    expect(mapEvent(ev(), MINE)!.external_ref).toEqual({ source: 'gcal', id: 'kai@gmail.com/e1', calendar: 'Kai', calendar_id: MINE.id })
  })

  it('readCalendars keeps the role Google gives (and nothing it makes up)', () => {
    const r = readCalendars([{ id: 'a', summary: 'A', primary: true, accessRole: 'owner' }, { id: 'b', summary: 'B', accessRole: 'reader' }, { id: 'c', summary: 'C', accessRole: 'bogus' }])
    expect(r.calendars.map((c) => c.role)).toEqual(['owner', 'reader', undefined])
  })
})

describe('planGcalSync — a Reconnect that adds the write scope flips rows to editable without an etag change', () => {
  it('updates a stored row whose edit flag, link, join link or series changed', () => {
    const row = mapEvent(ev({ hangoutLink: 'https://meet.google.com/x' }), MINE, true)!
    const stored: StoredGcal = { id: 'r1', starts_at: row.starts_at, ends_at: row.ends_at, gcal_etag: row.gcal_etag, color: row.color, deleted_at: null, external_ref: { source: 'gcal', id: row.external_ref.id, calendar: 'Kai', calendar_id: MINE.id } }
    const window = { start: new Date('2026-10-05T00:00:00Z'), end: new Date('2026-12-14T00:00:00Z') }
    const plan = planGcalSync([stored], new Map([[MINE.id, [row]]]), [MINE.id], window)
    expect(plan.update.map((u) => u.id)).toEqual(['r1'])
    const same = planGcalSync([{ ...stored, external_ref: row.external_ref }], new Map([[MINE.id, [row]]]), [MINE.id], window)
    expect(same.update).toEqual([])
  })
})

describe('readChange / readOps — what the client sends is checked', () => {
  it('a change is a rename, new times (end not before start), both, or a delete — nothing else', () => {
    expect(readChange({ title: '  Retro ' })).toEqual({ title: 'Retro' })
    expect(readChange({ starts_at: '2026-10-12T08:00:00Z', ends_at: '2026-10-12T09:00:00Z' })).toEqual({ starts_at: '2026-10-12T08:00:00.000Z', ends_at: '2026-10-12T09:00:00.000Z' })
    expect(readChange({ title: 'x', starts_at: '2026-10-12T08:00:00Z', ends_at: '2026-10-12T09:00:00Z', all_day: false })).toMatchObject({ title: 'x', all_day: false })
    expect(readChange({ delete: true })).toEqual({ delete: true })
    expect(readChange({})).toBeNull()
    expect(readChange({ title: '' })).toBeNull()
    expect(readChange({ title: 'x'.repeat(1001) })).toBeNull()
    expect(readChange({ starts_at: '2026-10-12T09:00:00Z', ends_at: '2026-10-12T08:00:00Z' })).toBeNull()
    expect(readChange({ starts_at: '2026-10-12T09:00:00Z' })).toBeNull()
    expect(readChange({ delete: true, title: 'x' })).toBeNull()
    expect(readChange(null)).toBeNull()
  })

  it('an undo’s ops keep only the fields a patch may carry', () => {
    const ops = readOps([{ op: 'patch', id: 'e1', body: { summary: 'Old', attendees: [{ email: 'x@y.z' }], status: 'confirmed' } }, { op: 'delete', id: 'e2' }, { op: 'insert', body: { summary: 'N', creator: 'me' } }])!
    expect(ops[0]).toEqual({ op: 'patch', id: 'e1', body: { summary: 'Old', status: 'confirmed' } })
    expect(ops[1]).toEqual({ op: 'delete', id: 'e2' })
    expect(ops[2]).toEqual({ op: 'insert', body: { summary: 'N' } })
    expect(readOps([])).toBeNull()
    expect(readOps('x')).toBeNull()
    expect(readOps([{ op: 'patch', id: 'e1', body: { attendees: [] } }])).toBeNull() // nothing allowed in it
    expect(readOps([{ op: 'wipe' }])).toBeNull()
    expect(readOps(Array.from({ length: 5 }, () => ({ op: 'delete', id: 'x' })))).toBeNull()
  })
})

// A weekly Monday standup, 10:00–10:30 Cairo, from 5 Oct; the occurrence on Mon 12 Oct.
const master = (over: GEvent = {}): GEvent => ev({ id: 'series', start: { dateTime: '2026-10-05T10:00:00+03:00', timeZone: ZONE }, end: { dateTime: '2026-10-05T10:30:00+03:00', timeZone: ZONE }, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'], ...over })
const inst = (over: GEvent = {}): GEvent => ev({ id: 'series_20261012T070000Z', recurringEventId: 'series', originalStartTime: { dateTime: '2026-10-12T10:00:00+03:00' }, start: { dateTime: '2026-10-12T10:00:00+03:00', timeZone: ZONE }, end: { dateTime: '2026-10-12T10:30:00+03:00', timeZone: ZONE }, ...over })
const plan = (over: Partial<PlanInput> & Pick<PlanInput, 'change'>): GcalOp[] | { error: string } =>
  planGcalChange({ scope: 'this', inst: inst(), master: master(), zone: ZONE, between: ruleBetween, now: NOW, ...over })
const ops = (p: ReturnType<typeof plan>): GcalOp[] => {
  if (!Array.isArray(p)) throw new Error(`planned an error: ${p.error}`)
  return p
}

describe('planGcalChange — This event', () => {
  it('a rename patches the instance', () => {
    expect(ops(plan({ change: { title: 'Retro' } }))).toEqual([{ op: 'patch', id: 'series_20261012T070000Z', body: { summary: 'Retro' } }])
  })

  it('a move or resize patches the instance’s start and end in its own zone, clearing the unused date field', () => {
    const [o] = ops(plan({ change: { starts_at: '2026-10-12T08:00:00.000Z', ends_at: '2026-10-12T08:45:00.000Z' } }))
    expect(o).toEqual({ op: 'patch', id: 'series_20261012T070000Z', body: { start: { dateTime: '2026-10-12T08:00:00.000Z', timeZone: ZONE, date: null }, end: { dateTime: '2026-10-12T08:45:00.000Z', timeZone: ZONE, date: null } } })
  })

  it('a delete deletes the instance (that occurrence only); a one-off event ignores the scope', () => {
    expect(ops(plan({ change: { delete: true } }))).toEqual([{ op: 'delete', id: 'series_20261012T070000Z' }])
    expect(ops(plan({ change: { delete: true }, scope: 'all', inst: ev(), master: null }))).toEqual([{ op: 'delete', id: 'e1' }])
  })

  it('onto the all-day line: dates in place of times, the time fields nulled', () => {
    const [o] = ops(plan({ change: { starts_at: '2026-10-13T00:00:00.000Z', ends_at: '2026-10-14T00:00:00.000Z', all_day: true }, inst: ev(), master: null }))
    expect(o).toEqual({ op: 'patch', id: 'e1', body: { start: { date: '2026-10-13', dateTime: null, timeZone: null }, end: { date: '2026-10-14', dateTime: null, timeZone: null } } })
  })
})

describe('planGcalChange — All events', () => {
  it('a rename patches the master; a delete deletes it', () => {
    expect(ops(plan({ scope: 'all', change: { title: 'Retro' } }))).toEqual([{ op: 'patch', id: 'series', body: { summary: 'Retro' } }])
    expect(ops(plan({ scope: 'all', change: { delete: true } }))).toEqual([{ op: 'delete', id: 'series' }])
  })

  it('a move shifts the master by the same days, to the same time of day, and BYDAY with it', () => {
    // Mon 12 Oct 10:00 → Tue 13 Oct 11:00, an hour long.
    const [o] = ops(plan({ scope: 'all', change: { starts_at: '2026-10-13T08:00:00.000Z', ends_at: '2026-10-13T09:00:00.000Z' } }))
    expect(o).toMatchObject({ op: 'patch', id: 'series' })
    const body = (o as { body: Record<string, unknown> }).body
    expect(body.start).toEqual({ dateTime: '2026-10-06T08:00:00.000Z', timeZone: ZONE, date: null }) // Tue 6 Oct 11:00 Cairo
    expect(body.end).toEqual({ dateTime: '2026-10-06T09:00:00.000Z', timeZone: ZONE, date: null })
    expect(body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU'])
  })

  it('a same-day resize keeps the days and BYDAY, and changes the length', () => {
    const [o] = ops(plan({ scope: 'all', change: { starts_at: '2026-10-12T07:00:00.000Z', ends_at: '2026-10-12T08:00:00.000Z' } }))
    const body = (o as { body: Record<string, unknown> }).body
    expect(body.start).toMatchObject({ dateTime: '2026-10-05T07:00:00.000Z' })
    expect(body.end).toMatchObject({ dateTime: '2026-10-05T08:00:00.000Z' })
    expect(body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO'])
  })

  it('a series with EXDATE / RDATE lines is not shifted (it would corrupt them): unsupported', () => {
    const m = master({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=Africa/Cairo:20261019T100000'] })
    expect(plan({ scope: 'all', master: m, change: { starts_at: '2026-10-13T08:00:00.000Z', ends_at: '2026-10-13T09:00:00.000Z' } })).toEqual({ error: 'unsupported' })
    // …but a rename needs no shifting.
    expect(plan({ scope: 'all', master: m, change: { title: 'x' } })).toEqual([{ op: 'patch', id: 'series', body: { summary: 'x' } }])
  })

  it('across the all-day line is "This event" only', () => {
    expect(plan({ scope: 'all', change: { starts_at: '2026-10-12T00:00:00.000Z', ends_at: '2026-10-13T00:00:00.000Z', all_day: true } })).toEqual({ error: 'unsupported' })
  })
})

describe('planGcalChange — This and following events', () => {
  const later = () => inst({ id: 'series_20261019T070000Z', originalStartTime: { dateTime: '2026-10-19T10:00:00+03:00' }, start: { dateTime: '2026-10-19T10:00:00+03:00', timeZone: ZONE }, end: { dateTime: '2026-10-19T10:30:00+03:00', timeZone: ZONE } })

  it('a delete ends the series just before the occurrence (UNTIL, COUNT dropped)', () => {
    const [o, extra] = ops(plan({ scope: 'following', inst: later(), change: { delete: true } }))
    expect(extra).toBeUndefined()
    expect(o).toEqual({ op: 'patch', id: 'series', body: { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T065959Z'] } })
  })

  it('a delete from the first occurrence deletes the series (nothing before it to keep)', () => {
    const first = inst({ id: 'series_20261005T070000Z', originalStartTime: { dateTime: '2026-10-05T10:00:00+03:00' }, start: { dateTime: '2026-10-05T10:00:00+03:00' }, end: { dateTime: '2026-10-05T10:30:00+03:00' } })
    expect(ops(plan({ scope: 'following', inst: first, change: { delete: true } }))).toEqual([{ op: 'delete', id: 'series' }])
  })

  it('a rename ends the old series and starts a new one on the occurrence, with the master’s details', () => {
    const m = master({ description: 'Daily sync', location: 'Room 4', colorId: '5', attendees: [{ email: 'a@x.io', responseStatus: 'accepted' } as never] })
    const [head, tail] = ops(plan({ scope: 'following', inst: later(), master: m, change: { title: 'Retro' } }))
    expect(head).toMatchObject({ op: 'patch', id: 'series', body: { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T065959Z'] } })
    expect(tail).toEqual({
      op: 'insert',
      body: {
        description: 'Daily sync', location: 'Room 4', colorId: '5', attendees: [{ email: 'a@x.io' }], summary: 'Retro',
        start: { dateTime: '2026-10-19T07:00:00.000Z', timeZone: ZONE, date: null }, end: { dateTime: '2026-10-19T07:30:00.000Z', timeZone: ZONE, date: null },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
      },
    })
  })

  it('COUNT carries what was left: 4 weekly occurrences, split at the third, leaves 2 for the new series', () => {
    const m = master({ recurrence: ['RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO'] })
    const third = inst({ id: 'series_20261019T070000Z', originalStartTime: { dateTime: '2026-10-19T10:00:00+03:00' }, start: { dateTime: '2026-10-19T10:00:00+03:00' }, end: { dateTime: '2026-10-19T10:30:00+03:00' } })
    const [head, tail] = ops(plan({ scope: 'following', inst: third, master: m, change: { title: 'x' } }))
    expect((head as { body: { recurrence: string[] } }).body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T065959Z'])
    expect((tail as { body: { recurrence: string[] } }).body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2'])
  })

  it('a move takes the new series to the new time, BYDAY with the days', () => {
    // The 19th, Mon 10:00 → Wed 21st 09:00.
    const [, tail] = ops(plan({ scope: 'following', inst: later(), change: { starts_at: '2026-10-21T06:00:00.000Z', ends_at: '2026-10-21T06:30:00.000Z' } }))
    const body = (tail as { body: Record<string, unknown> }).body
    expect(body.start).toMatchObject({ dateTime: '2026-10-21T06:00:00.000Z' })
    expect(body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=WE'])
  })

  it('an all-day series ends on a DATE, not a UTC stamp', () => {
    const m = ev({ id: 'hol', start: { date: '2026-10-05' }, end: { date: '2026-10-06' }, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] })
    const i = ev({ id: 'hol_20261019', recurringEventId: 'hol', originalStartTime: { date: '2026-10-19' }, start: { date: '2026-10-19' }, end: { date: '2026-10-20' } })
    const [head] = ops(plan({ scope: 'following', inst: i, master: m, change: { delete: true } }))
    expect((head as { body: { recurrence: string[] } }).body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261018'])
  })
})

describe('timesOf / timeBody', () => {
  it('an all-day event is its dates at T00:00Z, end exclusive; a timed one its instants', () => {
    expect(timesOf(ev({ start: { date: '2026-10-13' }, end: { date: '2026-10-14' } }))).toEqual({ start: '2026-10-13T00:00:00.000Z', end: '2026-10-14T00:00:00.000Z', allDay: true })
    expect(timesOf(ev())).toEqual({ start: '2026-10-12T07:00:00.000Z', end: '2026-10-12T07:30:00.000Z', allDay: false })
    expect(timesOf({})).toBeNull()
    expect(timeBody({ start: '2026-10-12T07:00:00.000Z', end: '2026-10-12T07:30:00.000Z', allDay: false }, ZONE).start).toMatchObject({ dateTime: '2026-10-12T07:00:00.000Z', timeZone: ZONE })
  })
})

/** A fake Calendar API: events by id, a log of what was called. */
function fake(events: GEvent[], failOn?: (call: string) => boolean): GcalIO & { log: string[]; events: Map<string, GEvent> } {
  const map = new Map(events.map((e) => [e.id!, structuredClone(e)]))
  const log: string[] = []
  const guard = (call: string) => {
    log.push(call)
    if (failOn?.(call)) throw new GoogleError(500)
  }
  return {
    log,
    events: map,
    get: async (id) => structuredClone(map.get(id)!),
    patch: async (id, body) => {
      guard(`patch ${id}`)
      map.set(id, { ...map.get(id)!, ...body } as GEvent)
      return map.get(id)!
    },
    insert: async (body) => {
      guard('insert')
      const made = { ...body, id: `new${map.size}` } as GEvent
      map.set(made.id!, made)
      return made
    },
    remove: async (id) => {
      guard(`delete ${id}`)
      map.set(id, { ...map.get(id)!, status: 'cancelled' })
    },
  }
}

describe('runOps — the inverse puts every event back', () => {
  it('a rename and a move: the undo patches the earlier summary and times back', async () => {
    const io = fake([inst()])
    const o = ops(plan({ change: { title: 'Retro', starts_at: '2026-10-12T08:00:00.000Z', ends_at: '2026-10-12T09:00:00.000Z' } }))
    const before = new Map([['series_20261012T070000Z', inst()]])
    const undo = await runOps(io, o, before)
    expect(io.events.get('series_20261012T070000Z')).toMatchObject({ summary: 'Retro', start: { dateTime: '2026-10-12T08:00:00.000Z' } })
    await runOps(io, undo, new Map())
    expect(io.events.get('series_20261012T070000Z')).toMatchObject({ summary: 'Standup', start: { dateTime: '2026-10-12T10:00:00+03:00', timeZone: ZONE, date: null }, end: { dateTime: '2026-10-12T10:30:00+03:00' } })
  })

  it('a delete: the undo confirms it again', async () => {
    const io = fake([inst()])
    const undo = await runOps(io, [{ op: 'delete', id: 'series_20261012T070000Z' }], new Map())
    expect(io.events.get('series_20261012T070000Z')!.status).toBe('cancelled')
    expect(undo).toEqual([{ op: 'patch', id: 'series_20261012T070000Z', body: { status: 'confirmed' } }])
    await runOps(io, undo, new Map())
    expect(io.events.get('series_20261012T070000Z')!.status).toBe('confirmed')
  })

  it('following: head patched and tail inserted — the undo deletes the tail and puts the old rule back', async () => {
    const io = fake([master(), inst({ id: 'series_20261019T070000Z', originalStartTime: { dateTime: '2026-10-19T10:00:00+03:00' }, start: { dateTime: '2026-10-19T10:00:00+03:00' }, end: { dateTime: '2026-10-19T10:30:00+03:00' } })])
    const o = ops(plan({ scope: 'following', inst: io.events.get('series_20261019T070000Z')!, change: { title: 'Retro' } }))
    const undo = await runOps(io, o, new Map([['series', master()]]))
    expect(io.log).toEqual(['patch series', 'insert'])
    expect(io.events.get('series')!.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T065959Z'])
    await runOps(io, undo, new Map())
    expect(io.events.get('series')!.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO'])
    expect(io.events.get('new2')!.status).toBe('cancelled')
  })

  it('a step that fails puts the earlier ones back and throws', async () => {
    const io = fake([master()], (c) => c === 'insert')
    const o: GcalOp[] = [{ op: 'patch', id: 'series', body: { summary: 'Changed' } }, { op: 'insert', body: { summary: 'tail' } }]
    await expect(runOps(io, o, new Map([['series', master()]]))).rejects.toBeInstanceOf(GoogleError)
    expect(io.events.get('series')!.summary).toBe('Standup')
  })
})

describe('editError — stable codes for what Google refused with', () => {
  it('401 → token_expired, 403 → read_only, 404/410 → gone, 400 → bad_request, the rest google_unavailable', () => {
    expect(editError(new GoogleError(401))).toEqual({ status: 409, error: 'token_expired' })
    expect(editError(new GoogleError(403))).toEqual({ status: 403, error: 'read_only' })
    expect(editError(new GoogleError(404))).toEqual({ status: 404, error: 'gone' })
    expect(editError(new GoogleError(410)).error).toBe('gone')
    expect(editError(new GoogleError(400)).error).toBe('bad_request')
    expect(editError(new GoogleError(503)).error).toBe('google_unavailable')
    expect(editError(new Error('db'))).toEqual({ status: 500, error: 'server_error' })
  })
})
