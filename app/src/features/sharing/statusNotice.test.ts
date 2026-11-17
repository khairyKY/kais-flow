import { describe, expect, it } from 'vitest'
import { noticeWhen, shareNotice, shareNoticeLine, type ShareNoticeRow } from '../../../../supabase/functions/notify/copy.ts'
import { alive, clearsLine, modeOf } from './statusModel'

// Fri 20 Nov 2026, 8:00 PM in Cairo (UTC+2) = 18:00Z
const FRI_8PM = '2026-11-20T18:00:00Z'
const FRI_830PM = '2026-11-20T18:30:00Z'
const Z = 'Africa/Cairo'
const row = (over: Partial<ShareNoticeRow> = {}): ShareNoticeRow => ({ actor_name: 'Reem', kind: 'added', payload: { verb: 'added', what: 'Dinner', at: FRI_8PM }, n: 1, ...over })

describe('notice words', () => {
  it('says what Reem did, and when, on the reader’s own clock', () => {
    expect(shareNoticeLine(row(), Z)).toBe('Reem added Dinner, Fri 8 PM')
    expect(shareNoticeLine(row({ payload: { verb: 'added', what: 'Dinner', at: FRI_830PM } }), Z)).toBe('Reem added Dinner, Fri 8:30 PM')
    expect(shareNoticeLine(row(), Z, true)).toBe('Reem added Dinner, Fri 20:00')
    expect(noticeWhen(FRI_8PM, 'UTC', false)).toBe('Fri 6 PM')
  })

  it('at Busy only the server already sent "something", and the lock screen says the same whatever it held', () => {
    expect(shareNoticeLine(row({ payload: { verb: 'added', what: 'something', at: FRI_8PM } }), Z)).toBe('Reem added something, Fri 8 PM')
    expect(shareNoticeLine(row(), Z, false, false)).toBe('Reem added something, Fri 8 PM')
    expect(shareNoticeLine(row({ payload: { verb: 'added', what: null, at: null } }), Z)).toBe('Reem added something')
  })

  it('a burst folded by the server is one line, no time; a kind may say its own count', () => {
    expect(shareNoticeLine(row({ n: 3 }), Z)).toBe('Reem added 3 things')
    expect(shareNoticeLine(row({ n: 6, payload: { verb: 'ticked', what: '{n} on Groceries' } }), Z)).toBe('Reem ticked 6 on Groceries')
    expect(shareNoticeLine(row({ n: 6, payload: { verb: 'ticked', what: '{n} on Groceries' } }), Z, false, false)).toBe('Reem ticked 6 things')
  })
})

describe('the push', () => {
  it('one due notice is one line; the title carries it, with a title only when lock-screen names are on', () => {
    const n = shareNotice([row()], 'u1', { lock_screen_names: true }, Z)
    expect(n).toMatchObject({ kind: 'share_notice', title: 'Reem added Dinner, Fri 8 PM', tag: 'share-u1', url: '/today', silent: false })
    expect(shareNotice([row()], 'u1', { lock_screen_names: false }, Z).title).toBe('Reem added something, Fri 8 PM')
    expect(shareNotice([row()], 'u1', undefined, Z).title).not.toContain('Dinner')
  })

  it('several held through quiet hours become ONE line from her', () => {
    const n = shareNotice([row(), row({ payload: { verb: 'invited you to', what: 'Date night', at: FRI_830PM } })], 'u1', { lock_screen_names: true }, Z)
    expect(n.title).toBe('From Reem')
    expect(n.body).toBe('added Dinner, Fri 8 PM · invited you to Date night, Fri 8:30 PM')
  })

  it('reads the 24-hour switch from the person’s settings', () => {
    expect(shareNotice([row()], 'u1', { lock_screen_names: true, hour24: true }, Z).title).toBe('Reem added Dinner, Fri 20:00')
  })
})

describe('status words', () => {
  const now = new Date('2026-11-20T12:00:00Z')
  it('a status is gone the moment its time passes', () => {
    expect(alive({ words: 'Commuting', source: 'words', until: '2026-11-20T12:30:00Z' }, now)).toBe(true)
    expect(alive({ words: 'Commuting', source: 'words', until: '2026-11-20T11:59:00Z' }, now)).toBe(false)
    expect(alive(null, now)).toBe(false)
  })
  it('says when it clears', () => {
    expect(clearsLine('2026-11-20T12:40:00Z', now, Z)).toBe('Clears in 40 min')
    expect(clearsLine('2026-11-20T20:30:00Z', now, Z)).toBe('Clears today 10:30 PM')
    expect(clearsLine('2026-11-21T05:00:00Z', now, Z)).toBe('Clears tomorrow 7:00 AM')
  })
})

describe('notice switches', () => {
  it('every kind is Off until chosen', () => {
    expect(modeOf(undefined, 'added')).toBe('off')
    expect(modeOf({ notice_prefs: {} }, 'added')).toBe('off')
    expect(modeOf({ notice_prefs: { added: 'push' } }, 'added')).toBe('push')
  })
})
