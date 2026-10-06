import { afterEach, describe, expect, it, vi } from 'vitest'

// User time zones (2026-10-04): the same helpers the Cairo suites pin, run for a user in New York
// and one in Tokyo (app_settings.timezone → setAppZone). Every `now` is an explicit instant and
// every expectation explicit, so these hold whatever zone the machine runs in.
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./outbox', () => ({ writeRow: vi.fn() }))

const { DEFAULT_ZONE, appZone, isZone, searchZones, setAppZone, zoneCity } = await import('./appZone')
const { cairoDateKey, cairoWallTimeToIso, daysUntilNextMonday, scheduleNextWeek, scheduleToday, scheduleTomorrow, tomorrowHint, zoneDateKey, zoneOffsetMinutes } = await import('./dateShortcuts')
const { cairoTimeKey, cairoToIso } = await import('../features/calendar/eventTime')
const { parseCommand } = await import('../features/command-bar/parseCommand')
const { formatDueChip } = await import('../features/command-bar/dueChip')
const { quickPicks, toMin } = await import('../components/pickerMath')
const { upNextClock, upNextEvents } = await import('../features/today/upNext')
const { cairoMinutes } = await import('../features/today/dayPhase')
const { loopDayKey } = await import('../features/rituals/loopDay')
const { shouldResume } = await import('../features/paper/paperMath')
const { shouldOfferDeviceZone } = await import('./settings')

const NY = 'America/New_York'
const TOKYO = 'Asia/Tokyo'

afterEach(() => setAppZone(DEFAULT_ZONE))

describe('the zone source', () => {
  it('defaults to Cairo and falls back to it for an unknown or empty zone', () => {
    expect(appZone()).toBe('Africa/Cairo')
    setAppZone(NY)
    expect(appZone()).toBe(NY)
    setAppZone('Mars/Olympus_Mons')
    expect(appZone()).toBe('Africa/Cairo')
    setAppZone(NY)
    setAppZone(null)
    expect(appZone()).toBe('Africa/Cairo')
  })
  it('knows real zones, names their city and finds them by search', () => {
    expect(isZone(NY)).toBe(true)
    expect(isZone('')).toBe(false)
    expect(isZone('Nope/Nowhere')).toBe(false)
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
    expect(searchZones('new york')).toContain(NY)
    expect(searchZones('London')).toContain('Europe/London')
    expect(searchZones('  ')).toEqual([])
    expect(searchZones('a', 3)).toHaveLength(3)
  })
  it('offers the device zone once, only while the account still has the default', () => {
    expect(shouldOfferDeviceZone('Africa/Cairo', 'Europe/London', false)).toBe(true)
    expect(shouldOfferDeviceZone('Africa/Cairo', 'Europe/London', true)).toBe(false) // asked before on this device
    expect(shouldOfferDeviceZone('Asia/Tokyo', 'Europe/London', false)).toBe(false) // they chose one
    expect(shouldOfferDeviceZone('Africa/Cairo', 'Africa/Cairo', false)).toBe(false) // already the device's
    expect(shouldOfferDeviceZone('Africa/Cairo', 'Not/AZone', false)).toBe(false)
  })
})

describe('a New York user (EDT, UTC-4) late on Wed 8 Jul — already Thursday in Cairo', () => {
  const now = new Date('2026-07-08T23:30:00-04:00') // 03:30Z Thu, 06:30 Thu in Cairo

  it('day keys and clocks read New York', () => {
    setAppZone(NY)
    expect(cairoDateKey(now)).toBe('2026-07-08')
    expect(zoneDateKey(now, 'Africa/Cairo')).toBe('2026-07-09') // an explicit zone still wins
    expect(cairoTimeKey(now)).toBe('23:30')
    expect(zoneOffsetMinutes(now)).toBe(-240)
    expect(cairoMinutes(now)).toBe(23 * 60 + 30)
    // the phone calendar's now line sits at the user's clock time
    expect(toMin(cairoTimeKey(now))).toBe(1410)
  })
  it('Today / Tomorrow / Next week are 09:00 New York', () => {
    setAppZone(NY)
    expect(scheduleToday(now)).toBe('2026-07-08T13:00:00.000Z')
    expect(scheduleTomorrow(now)).toBe('2026-07-09T13:00:00.000Z')
    expect(tomorrowHint(now)).toBe('Thu 09:00')
    expect(daysUntilNextMonday(now)).toBe(5)
    expect(scheduleNextWeek(now)).toBe('2026-07-13T13:00:00.000Z')
  })
  it('the same instant on Cairo’s clock is a day later — the zone is what moved it', () => {
    expect(cairoDateKey(now)).toBe('2026-07-09')
    expect(scheduleTomorrow(now)).toBe('2026-07-10T06:00:00.000Z')
  })
  it('Tomorrow 09:00 crosses New York’s fall-back night (Sun 1 Nov, EST from 02:00)', () => {
    setAppZone(NY)
    expect(scheduleTomorrow(new Date('2026-10-31T20:00:00-04:00'))).toBe('2026-11-01T14:00:00.000Z')
    expect(cairoWallTimeToIso(2026, 11, 1, 9)).toBe('2026-11-01T14:00:00.000Z')
  })
  it('form fields round-trip on New York’s clock', () => {
    setAppZone(NY)
    expect(cairoToIso('2026-07-08', '23:30')).toBe(now.toISOString())
  })
  it('the date picker’s quick picks land on New York days at 09:00 there', () => {
    setAppZone(NY)
    const picks = quickPicks(now, true)
    expect(picks.map((p) => [p.key, p.day, p.iso])).toEqual([
      ['today', '2026-07-08', '2026-07-08T13:00:00.000Z'],
      ['tomorrow', '2026-07-09', '2026-07-09T13:00:00.000Z'],
      ['weekend', '2026-07-11', '2026-07-11T13:00:00.000Z'],
      ['nextweek', '2026-07-13', '2026-07-13T13:00:00.000Z'],
    ])
  })
  it('"tomorrow 3pm" typed in the command bar is 15:00 tomorrow in New York', () => {
    setAppZone(NY)
    const p = parseCommand('call mom tomorrow 3pm', [], [], { zone: 'cairo', now })
    expect(p.dueAt).toBe('2026-07-09T19:00:00.000Z')
    expect(p.title).toBe('call mom')
    expect(formatDueChip(p.dueAt!, now)).toBe('Tomorrow · 3:00 PM')
  })
  it('Today’s Up next keeps tonight’s event and leaves tomorrow morning’s for tomorrow', () => {
    const tonight = { id: 'a', starts_at: '2026-07-09T03:45:00Z', ends_at: '2026-07-09T04:15:00Z', all_day: false } // 23:45 NY
    const tomorrowAm = { id: 'b', starts_at: '2026-07-09T12:00:00Z', ends_at: '2026-07-09T13:00:00Z', all_day: false } // 08:00 NY Thu
    setAppZone(NY)
    expect(upNextEvents([tomorrowAm, tonight], now).map((e) => e.id)).toEqual(['a'])
    expect(upNextClock(tonight.starts_at)).toBe('11:45 PM')
    setAppZone(DEFAULT_ZONE) // in Cairo it's already Thursday, so both are today's
    expect(upNextEvents([tomorrowAm, tonight], now).map((e) => e.id)).toEqual(['a', 'b'])
  })
  it('the loop day turns over at 04:00 New York', () => {
    setAppZone(NY)
    expect(loopDayKey(new Date('2026-07-09T02:00:00-04:00'))).toBe('2026-07-08')
    expect(loopDayKey(new Date('2026-07-09T04:00:00-04:00'))).toBe('2026-07-09')
  })
  it('a page that hit the shared daily vision limit waits for Cairo’s new day, whatever the user’s zone', () => {
    setAppZone(NY)
    const row = { status: 'queued' as const, error: 'daily_limit', reviewed_at: null, updated_at: '2026-07-08T20:30:00Z', pages_read: 0, pages: 1, storage_paths: ['p'] }
    // 16:30 → 17:30 in New York (same day) but 23:30 → 00:30 in Cairo: the quota refilled
    expect(shouldResume(row, new Date('2026-07-08T21:30:00Z'))).toBe(true)
    expect(shouldResume(row, new Date('2026-07-08T20:45:00Z'))).toBe(false)
  })
})

describe('a Tokyo user (JST, UTC+9) at 01:00 Thu 9 Jul — still Wednesday in Cairo', () => {
  const now = new Date('2026-07-09T01:00:00+09:00') // 16:00Z Wed

  it('reads Tokyo’s day and schedules 09:00 Tokyo', () => {
    setAppZone(TOKYO)
    expect(cairoDateKey(now)).toBe('2026-07-09')
    expect(cairoTimeKey(now)).toBe('01:00')
    expect(scheduleToday(now)).toBe('2026-07-09T00:00:00.000Z')
    expect(scheduleTomorrow(now)).toBe('2026-07-10T00:00:00.000Z')
    expect(tomorrowHint(now)).toBe('Fri 09:00')
    expect(quickPicks(now, false)[0]).toMatchObject({ key: 'today', day: '2026-07-09' })
  })
  it('the loop day is still Wednesday before 04:00 Tokyo', () => {
    setAppZone(TOKYO)
    expect(loopDayKey(now)).toBe('2026-07-08')
  })
})
