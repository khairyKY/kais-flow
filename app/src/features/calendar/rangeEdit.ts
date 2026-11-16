// F7 · multi-day events — the editable form of an event's when: a start and an end, each a date (and a time,
// unless the event is all-day), as the Starts / Ends rows, QuickCreate's Ends field and the phone's "Ends" row
// show them. Pure, on the user's zone (lib/appZone), so every surface cuts a range the same way. An all-day
// event stores T00:00Z dates with an exclusive end (see ./daySpans); here its `endDay` is the LAST day, included.

import { addDays } from '../../components/pickerMath'
import { appZone } from '../../lib/appZone'
import { clockText } from '../../lib/clock'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { spanDays } from './daySpans'
import { zoneTimeKey, zoneToIso } from './eventTime'

type Times = Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>

export interface Range {
  all_day: boolean
  startDay: string
  /** "HH:MM" — '00:00' while all-day. */
  startTime: string
  /** The last day (an all-day event's is included, not the exclusive stored end). */
  endDay: string
  endTime: string
}

/** What a new timed event gets when all-day goes off (Kai's spec: 09:00–10:00 on the first day). */
export const DEFAULT_START = '09:00'
export const DEFAULT_END = '10:00'
/** The shortest a timed range may be — the grid's own snap. */
const MIN_MS = 15 * 60_000

const dayGap = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** The stored times as the form's fields. */
export function rangeOf(e: Times, zone: string = appZone()): Range {
  if (e.all_day) {
    const { first, last } = spanDays(e, zone)
    return { all_day: true, startDay: first, startTime: '00:00', endDay: last, endTime: '00:00' }
  }
  const s = new Date(e.starts_at)
  const en = new Date(e.ends_at)
  return { all_day: false, startDay: zoneDateKey(s, zone), startTime: zoneTimeKey(s, zone), endDay: zoneDateKey(en, zone), endTime: zoneTimeKey(en, zone) }
}

/** The fields as the stored times (an all-day end is the day after the last one). Never before the start. */
export function storeRange(r: Range, zone: string = appZone()): Times {
  if (r.all_day) {
    const last = r.endDay < r.startDay ? r.startDay : r.endDay
    return { all_day: true, starts_at: `${r.startDay}T00:00:00.000Z`, ends_at: `${addDays(last, 1)}T00:00:00.000Z` }
  }
  const starts = zoneToIso(r.startDay, r.startTime, zone)
  const ends = zoneToIso(r.endDay, r.endTime, zone)
  return { all_day: false, starts_at: starts, ends_at: Date.parse(ends) > Date.parse(starts) ? ends : new Date(Date.parse(starts) + MIN_MS).toISOString() }
}

/** A range with its end brought back to where it can be: not before the start. */
export function clampRange(r: Range, zone: string = appZone()): Range {
  return rangeOf(storeRange(r, zone), zone)
}

/** The Ends row's pick: a new last day (and, for a timed event, time of day). An end before the start
 * lands on the start — the end can't be before it. */
export function setEnd(r: Range, endDay: string, endTime: string = r.endTime, zone: string = appZone()): Range {
  return clampRange({ ...r, endDay, endTime: r.all_day ? '00:00' : endTime }, zone)
}

/** The Starts row's pick: the event moves to the new start and keeps its length (a Google event's way). */
export function moveStart(r: Range, startDay: string, startTime: string = r.startTime, zone: string = appZone()): Range {
  if (r.all_day) return { ...r, startDay, endDay: addDays(startDay, dayGap(r.startDay, r.endDay)) }
  const was = storeRange(r, zone)
  const length = Date.parse(was.ends_at) - Date.parse(was.starts_at)
  const starts = zoneToIso(startDay, startTime, zone)
  return rangeOf({ all_day: false, starts_at: starts, ends_at: new Date(Date.parse(starts) + length).toISOString() }, zone)
}

/** The band's resize: one end moved `days` whole days (+ later), the other kept. The end never lands before the start. */
export function resizeEdge(r: Range, edge: 'start' | 'end', days: number, zone: string = appZone()): Range {
  if (edge === 'end') return setEnd(r, addDays(r.endDay, days), undefined, zone)
  const startDay = addDays(r.startDay, days)
  return clampRange({ ...r, startDay: startDay > r.endDay ? r.endDay : startDay }, zone)
}

/** What a DatePicker hands back for the Starts / Ends row → the new range. All-day: `picked` is a date key. Timed:
 * an instant (the picker's `iso` mode) — whose time counts only when `timed` (the picker's Set time), else the day
 * alone changes and the row keeps its time of day. */
export function pickRange(r: Range, edge: 'start' | 'end', picked: string, timed?: boolean, zone: string = appZone()): Range {
  if (r.all_day) return edge === 'end' ? setEnd(r, picked, undefined, zone) : moveStart(r, picked, undefined, zone)
  const at = new Date(picked)
  const [day, time] = [zoneDateKey(at, zone), timed ? zoneTimeKey(at, zone) : undefined]
  return edge === 'end' ? setEnd(r, day, time, zone) : moveStart(r, day, time, zone)
}

/**
 * The all-day switch. On: the dates stay (a timed range ending exactly at midnight doesn't touch the next day).
 * Off: the first day, 09:00–10:00 — or `was`'s times when the form still remembers them (QuickCreate keeps them while
 * it's open; a stored all-day event doesn't).
 */
export function toggleAllDay(r: Range, on: boolean, was?: Pick<Range, 'startTime' | 'endTime'>, zone: string = appZone()): Range {
  if (on === r.all_day) return r
  if (on) {
    const last = r.endTime === '00:00' && r.endDay > r.startDay ? addDays(r.endDay, -1) : r.endDay
    return { all_day: true, startDay: r.startDay, startTime: '00:00', endDay: last < r.startDay ? r.startDay : last, endTime: '00:00' }
  }
  const startTime = was?.startTime && was.startTime !== '00:00' ? was.startTime : DEFAULT_START
  const endTime = was?.endTime && was.endTime !== '00:00' && was.endTime > startTime ? was.endTime : startTime === DEFAULT_START ? DEFAULT_END : addMinutes(startTime, 60)
  return clampRange({ all_day: false, startDay: r.startDay, startTime, endDay: r.startDay, endTime }, zone)
}

function addMinutes(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const t = Math.min(h * 60 + m + min, 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

const weekday = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })

/** "Mon 3 – Thu 6" (all-day, or just days), "Mon 22:00 – Tue 02:00" (a timed one over midnight); "Mon 9:00–10:00" stays
 * a one-day time range. The times follow the clock setting (lib/clock). */
export function rangeLabel(r: Range): string {
  const day = (k: string) => `${weekday(k)} ${Number(k.slice(8))}`
  if (r.all_day) return r.endDay > r.startDay ? `${day(r.startDay)} – ${day(r.endDay)}` : day(r.startDay)
  const at = (t: string) => clockText(t)
  if (r.endDay === r.startDay) return `${day(r.startDay)} ${at(r.startTime)}–${at(r.endTime)}`
  return `${day(r.startDay)} ${at(r.startTime)} – ${day(r.endDay)} ${at(r.endTime)}`
}

/** Whether a range covers more than one date (the QuickCreate / sheet shows its end date then). */
export const spansDays = (r: Range): boolean => r.endDay > r.startDay

/** Whole days between two dates (`b` − `a`). */
export { dayGap }

/** An event moved by `days` whole days, its times of day kept: the band's drag and resize (an all-day event by its
 * dates, a timed one on the user's wall clock — so a span over a DST change keeps its 09:00). */
export function shiftDays(iso: string, days: number, allDay: boolean, zone: string = appZone()): string {
  if (allDay) return `${addDays(iso.slice(0, 10), days)}T00:00:00.000Z`
  const at = new Date(iso)
  return zoneToIso(addDays(zoneDateKey(at, zone), days), zoneTimeKey(at, zone), zone)
}
