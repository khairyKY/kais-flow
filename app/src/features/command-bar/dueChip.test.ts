import { describe, expect, it } from 'vitest'
import { formatDueChip } from './dueChip'
import { parseCommand } from './parseCommand'

// Intl may put a narrow no-break space before AM/PM; compare on plain spaces.
const plain = (s: string) => s.replace(/\s/g, ' ')

// Run under TZ=UTC, Africa/Cairo and America/Los_Angeles: the chip reads Cairo on every device.
describe('formatDueChip (command bar date chip)', () => {
  const morning = new Date('2026-09-26T06:00:00Z') // 09:00 Cairo, Sat Sep 26

  it('says the Cairo day and time, with no seconds and no raw locale string', () => {
    const chip = plain(formatDueChip('2026-09-27T07:00:00.000Z', morning))
    expect(chip).toBe('Tomorrow · 10:00 AM')
    expect(chip).not.toMatch(/\d:\d\d:\d\d/)
    expect(chip).not.toContain('/')
  })

  it('today and a real date further out', () => {
    expect(plain(formatDueChip('2026-09-26T12:30:00.000Z', morning))).toBe('Today · 3:30 PM')
    expect(plain(formatDueChip('2026-10-07T12:00:00.000Z', morning))).toBe('Wed, Oct 7 · 3:00 PM')
  })

  it('uses the Cairo day at the edges, not the device’s', () => {
    // Due 21:30 UTC Sat = 00:30 Sun in Cairo, but still Saturday in UTC and Los Angeles.
    const lateCairo = new Date('2026-09-26T20:30:00Z') // 23:30 Sat Cairo
    expect(plain(formatDueChip('2026-09-26T21:30:00.000Z', lateCairo))).toBe('Tomorrow · 12:30 AM')
  })

  it('"call Omar tomorrow 10am" typed at 9:00 Cairo shows "Tomorrow · 10:00 AM" on any device', () => {
    const { dueAt } = parseCommand('call Omar tomorrow 10am', [], [], { now: morning, zone: 'cairo' })
    expect(plain(formatDueChip(dueAt!, morning))).toBe('Tomorrow · 10:00 AM')
  })
})
