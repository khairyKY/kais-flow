import { describe, expect, it } from 'vitest'
import { leavingRows } from './rowExit'
import type { Task } from '../../lib/types'

const t = (id: string, over: Partial<Task> = {}) => ({ id, status: 'todo', top3: false, top3_rank: null, someday: false, deleted_at: null, due_at: null, scheduled_start: null, paused: false, snoozed_until: null, ...over }) as Task

describe('leavingRows (T6 — only rows the change takes off the list on screen exit)', () => {
  const notSomeday = (x: Task) => !x.someday
  it('Someday on a list that hides someday rows: the row leaves', () => {
    expect(leavingRows([t('a')], (x) => ({ ...x, someday: true }), notSomeday).map((x) => x.id)).toEqual(['a'])
  })
  it('a row the list keeps, one it never showed, or no list on screen: nothing exits', () => {
    expect(leavingRows([t('a')], (x) => ({ ...x, due_at: '2026-10-13T06:00:00Z' }), notSomeday)).toEqual([])
    expect(leavingRows([t('b', { someday: true })], (x) => ({ ...x, someday: true }), notSomeday)).toEqual([])
    expect(leavingRows([t('a')], (x) => ({ ...x, someday: true }), null)).toEqual([])
  })
  it('counts the Top 3 place a move to a later day gives up (releaseTop3)', () => {
    const now = new Date('2026-10-12T07:00:00Z')
    const pick = t('p', { top3: true, top3_rank: 1, due_at: '2026-10-12T06:00:00Z' })
    const top3Only = (x: Task) => x.top3
    expect(leavingRows([pick], (x) => ({ ...x, due_at: '2026-10-13T06:00:00Z' }), top3Only, now).map((x) => x.id)).toEqual(['p'])
  })
})
