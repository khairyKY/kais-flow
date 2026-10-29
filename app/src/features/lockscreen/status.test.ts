import { describe, expect, it } from 'vitest'
import type { LockState } from './native'
import { hasStatus, lockStatus } from './status'

const time = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const AT_1330 = Date.parse('2026-10-29T13:30:00Z')

/** Android 16, everything allowed, a block on now, both notifications posted, the widget placed. */
const A16: LockState = {
  sdk: 36, release: '16', nowBarSupported: true, nowBar: true, dayStrip: true,
  notifications: true, channel: 3, promote: true, lock: true, lockSilent: true, widget: true,
  showing: true, showFrom: Date.parse('2026-10-29T09:00:00Z'), nowBarPosted: true, stripPosted: true, promoted: true,
}
const A15: LockState = { ...A16, sdk: 35, release: '15', nowBarSupported: false, nowBar: false, promote: undefined, promoted: null }
const line = (st: LockState, id: string) => lockStatus(st, time).find((l) => l.id === id)!

describe('lockStatus', () => {
  it('all three active', () => {
    expect(lockStatus(A16, time).map((l) => [l.id, l.ok])).toEqual([['top3', true], ['nowbar', true], ['strip', true]])
    expect(line(A16, 'nowbar').text).toBe('In the Now Bar now')
  })

  it('Android 15: the Now Bar needs 16, the others still work', () => {
    expect(line(A15, 'nowbar')).toMatchObject({ ok: false, text: 'Android 16 needed (this phone: 15)', open: undefined })
    expect(line(A15, 'strip').ok).toBe(true)
  })

  it('Live notifications turned off for the app: Open settings → the promotion screen', () => {
    expect(line({ ...A16, promote: false }, 'nowbar')).toMatchObject({ ok: false, text: 'Live notifications are turned off for Kai’s Flow', open: 'promotion' })
  })

  it('posted but not promoted: says so, and points at the Galaxy developer option', () => {
    const l = line({ ...A16, promoted: false }, 'nowbar')
    expect(l.ok).toBe(false)
    expect(l.text).toMatch(/Live notifications for all apps/)
  })

  it('a lowered (silent) channel on a lock screen hiding silent ones', () => {
    expect(line({ ...A16, channel: 2, lockSilent: false }, 'strip')).toMatchObject({ ok: false, text: 'Lock screen hides silent notifications', open: 'lockscreen' })
    expect(line({ ...A16, channel: 2, lockSilent: null }, 'strip').ok).toBe(true) // the phone won't say: no guess
    expect(line({ ...A16, channel: 3, lockSilent: false }, 'strip').ok).toBe(true) // default importance isn't silent
  })

  it('nothing near: when it will show, or none left today', () => {
    expect(line({ ...A16, showing: false, showFrom: AT_1330 }, 'nowbar').text).toBe('Nothing to show until 2h before your next block (from 13:30)')
    expect(line({ ...A16, showing: false, showFrom: 0 }, 'strip').text).toBe('Nothing to show until 2h before your next block — none left today')
  })

  it('what blocks every notification comes first, with its screen', () => {
    expect(line({ ...A16, notifications: false, promote: false, showing: false }, 'nowbar')).toMatchObject({ text: 'Notifications are turned off for Kai’s Flow', open: 'notifications' })
    expect(line({ ...A16, channel: 0 }, 'strip')).toMatchObject({ ok: false, open: 'channel' })
    expect(line({ ...A16, lock: false }, 'strip')).toMatchObject({ ok: false, text: 'This phone shows no notifications on the lock screen', open: 'lockscreen' })
  })

  it('switched off here, and the widget not placed', () => {
    expect(line({ ...A16, nowBar: false }, 'nowbar').text).toMatch(/^Off: turn on/)
    expect(line({ ...A16, dayStrip: false }, 'strip').text).toMatch(/^Off: turn on/)
    expect(line({ ...A16, widget: false }, 'top3')).toMatchObject({ ok: false, text: expect.stringMatching(/^Not added in LockStar yet/) })
  })

  it('v1.6.0’s shell (switches only) has no status', () => {
    expect(hasStatus({ sdk: 36, nowBarSupported: true, nowBar: true, dayStrip: false })).toBe(false)
    expect(hasStatus(null)).toBe(false)
    expect(hasStatus(A16)).toBe(true)
  })
})
