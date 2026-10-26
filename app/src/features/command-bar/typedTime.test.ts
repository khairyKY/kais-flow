import { describe, expect, it } from 'vitest'
import { applyTyped, readTyped, typedEcho, type TypedContext } from './typedTime'

// Queue item 16: run in all four zones (PowerShell $env:TZ = Africa/Cairo, UTC, America/Los_Angeles,
// Asia/Tokyo). The device's zone must never matter: times are on the user's clock (appZone, Cairo).
const now = new Date('2026-10-26T12:00:00Z') // 15:00 Cairo (still summer time, +3, until the 29th)
const H = (h: number, m = 0) => h * 60 + m
const read = (text: string, ctx: TypedContext = {}) => readTyped(text, { now, ...ctx })
const value = (text: string, ctx: TypedContext = {}) => {
  const r = read(text, ctx)
  if (!r?.ok) throw new Error(`${text}: ${r ? r.why : 'empty'}`)
  return r.value
}

describe('readTyped — lengths', () => {
  it.each([
    ['50m', 50],
    ['1h20', 80],
    ['1h', 60],
    ['1h30m', 90],
    ['90min', 90],
  ])('%s is %i minutes', (text, minutes) => {
    expect(value(text)).toEqual({ minutes })
    expect(value(text, { hour24: true })).toEqual({ minutes })
  })

  it('a length-only field reads 1:45 and a bare number as a length', () => {
    expect(value('1:45', { accepts: 'length' })).toEqual({ minutes: 105 })
    expect(value('45', { accepts: 'length' })).toEqual({ minutes: 45 })
  })

  it('explains a time typed where a length goes, and a zero or a day', () => {
    expect(read('7pm', { accepts: 'length' })).toEqual({ ok: false, why: 'A length is like 50m, 1h20 or 1:45' })
    expect(read('0m')).toMatchObject({ ok: false, why: 'A length needs at least a minute' })
    expect(read('24h')).toMatchObject({ ok: false, why: 'Too long — under a day' })
  })
})

describe('readTyped — times, 12-hour clock', () => {
  it.each([
    ['7:10 pm', H(19, 10)],
    ['7:10pm', H(19, 10)],
    ['7 p.m.', H(19)],
    ['noon', H(12)],
    ['midnight', 0],
    ['19:10', H(19, 10)],
    ['07:10', H(7, 10)],
    ['at 9am', H(9)],
  ])('%s starts at minute %i', (text, start) => {
    expect(value(text)).toEqual({ start })
  })

  it('an hour without am/pm takes the half of the day nearest the block', () => {
    expect(value('7', { anchor: H(19) })).toEqual({ start: H(19) })
    expect(value('7', { anchor: H(8) })).toEqual({ start: H(7) })
    expect(value('1:45', { anchor: H(12, 30) })).toEqual({ start: H(13, 45) })
    // no block: nearest now (15:00 Cairo, whatever the device's zone)
    expect(value('5')).toEqual({ start: H(17) })
  })

  it('"in 2h" is two hours from now on the user\'s clock', () => {
    expect(value('in 2h')).toEqual({ start: H(17) })
    expect(value('in 45m')).toEqual({ start: H(15, 45) })
  })

  it('chrono reads the words', () => {
    expect(value('7.30pm')).toEqual({ start: H(19, 30) })
    expect(value('tonight at 8')).toEqual({ start: H(20) })
  })
})

describe('readTyped — times, 24-hour clock', () => {
  it('a bare hour is the 24-hour clock', () => {
    expect(value('7', { hour24: true, anchor: H(19) })).toEqual({ start: H(7) })
    expect(value('7:10', { hour24: true, anchor: H(19) })).toEqual({ start: H(7, 10) })
    expect(value('19:10', { hour24: true })).toEqual({ start: H(19, 10) })
    expect(value('7:10 pm', { hour24: true })).toEqual({ start: H(19, 10) })
    expect(value('noon', { hour24: true })).toEqual({ start: H(12) })
    expect(value('in 2h', { hour24: true })).toEqual({ start: H(17) })
  })

  it('ranges as typed', () => {
    expect(value('7-8:30', { hour24: true, anchor: H(19) })).toEqual({ start: H(7), minutes: 90 })
    expect(value('19–20:30', { hour24: true })).toEqual({ start: H(19), minutes: 90 })
    expect(read('22-1', { hour24: true })).toMatchObject({ ok: false, why: 'It ends before it starts' })
  })
})

describe('readTyped — ranges, 12-hour clock', () => {
  it.each([
    ['7–8:30', H(19), H(19), 90],
    ['7-8:30', H(8), H(7), 90],
    ['7 - 8:30 pm', H(8), H(19), 90],
    ['11-1pm', H(8), H(11), 120],
    ['11-1', H(10), H(11), 120],
    ['7pm-8:30', H(8), H(19), 90],
    ['7:10 pm to 8:30', H(8), H(19, 10), 80],
    ['10 - 11', H(21), H(22), 60],
  ])('%s (block at minute %i) is %i for %i minutes', (text, anchor, start, minutes) => {
    expect(value(text, { anchor })).toEqual({ start, minutes })
  })

  it('a time and a length', () => {
    expect(value('7pm 45m')).toEqual({ start: H(19), minutes: 45 })
    expect(value('7pm for 1h20')).toEqual({ start: H(19), minutes: 80 })
  })
})

describe('readTyped — what a field takes, and nonsense', () => {
  it('a time-only field turns down lengths and ranges', () => {
    expect(read('50m', { accepts: 'time' })).toMatchObject({ ok: false })
    expect(read('7-8', { accepts: 'time' })).toMatchObject({ ok: false, why: 'Just the start here — like 7:10 pm' })
    expect(value('7pm', { accepts: 'time' })).toEqual({ start: H(19) })
  })

  it('says what it did not catch', () => {
    expect(read('banana')).toEqual({ ok: false, why: "Didn't catch “banana” — try 7:10 pm, 7–8:30, 50m or in 2h" })
    expect(read('25:00')).toMatchObject({ ok: false, why: 'Try 7:10 pm, 7–8:30, 50m or in 2h' })
    expect(read('  ')).toBeNull()
  })
})

describe('applyTyped + typedEcho', () => {
  it('echoes the range and length on either clock', () => {
    const r = applyTyped(value('7:10-8:30', { anchor: H(19) }), { start: H(19), minutes: 30 })
    expect(typedEcho(r, false)).toBe('7:10–8:30 PM · 1h20')
    expect(typedEcho(r, true)).toBe('19:10–20:30 · 1h20')
  })

  it('a length keeps the start; a time keeps the length', () => {
    expect(typedEcho(applyTyped({ minutes: 50 }, { start: H(19), minutes: 30 }), false)).toBe('7:00–7:50 PM · 50m')
    expect(typedEcho(applyTyped({ start: H(7) }, { start: H(19), minutes: 30 }), false)).toBe('7:00–7:30 AM · 30m')
    expect(typedEcho(applyTyped({ minutes: 50 }, { start: null, minutes: null }), false)).toBe('50m')
    expect(typedEcho(applyTyped({ start: H(19, 10) }, { start: null, minutes: null }), false)).toBe('7:10 PM')
  })

  it('will not run past midnight', () => {
    expect(applyTyped({ minutes: 120 }, { start: H(23), minutes: 30 }).why).toBe('That runs past midnight')
  })
})
