import { describe, expect, it } from 'vitest'
import { isInProgress, upNextLabel } from './upNext'

// Instants are written in UTC; Cairo is UTC+3 on 2026-09-26 (EEST).
const at = (cairoHHMM: string) => {
  const [h, m] = cairoHHMM.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, 26, h - 3, m))
}
const iso = (cairoHHMM: string) => at(cairoHHMM).toISOString()
const tenToEleven = [iso('10:00'), iso('11:00')] as const

describe('upNextLabel', () => {
  it('the audit case: at 08:38 a 10:00 event reads its start time, not "Now"', () => {
    expect(upNextLabel(...tenToEleven, at('08:38'))).toEqual({ text: '10:00 AM', tone: 'time' })
  })
  it('reads "Now" from the minute it starts until just before it ends', () => {
    expect(upNextLabel(...tenToEleven, at('10:00'))).toEqual({ text: 'Now', tone: 'now' })
    expect(upNextLabel(...tenToEleven, at('10:59'))).toEqual({ text: 'Now', tone: 'now' })
  })
  it('an event that has ended reads its start time again', () => {
    expect(upNextLabel(...tenToEleven, at('11:00'))).toEqual({ text: '10:00 AM', tone: 'time' })
    expect(upNextLabel(iso('07:00'), iso('07:30'), at('08:38'))).toEqual({ text: '7:00 AM', tone: 'time' })
  })
  it('two overlapping events are both "Now" while both run', () => {
    const now = at('10:15')
    expect(upNextLabel(iso('10:00'), iso('11:00'), now).tone).toBe('now')
    expect(upNextLabel(iso('10:10'), iso('10:40'), now).tone).toBe('now')
  })
  it('prints Cairo time whatever the device zone', () => {
    expect(upNextLabel(iso('13:00'), iso('14:00'), at('08:00')).text).toBe('1:00 PM')
  })
})

describe('isInProgress', () => {
  it('is start-inclusive and end-exclusive', () => {
    expect(isInProgress(...tenToEleven, at('09:59'))).toBe(false)
    expect(isInProgress(...tenToEleven, at('10:00'))).toBe(true)
    expect(isInProgress(...tenToEleven, at('11:00'))).toBe(false)
  })
})
