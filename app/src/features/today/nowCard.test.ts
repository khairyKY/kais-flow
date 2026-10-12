import { describe, expect, it } from 'vitest'
import { JUST_DONE_MS, nowBlock, nowState, type FocusNow, type NowTask } from './nowCard'
import type { Block } from './todayLayout'

// Instants in UTC; the user's zone is Cairo (the default), UTC+3 on 2026-09-27 — whatever the
// device zone the suite runs under (the TZ matrix).
const at = (hhmm: string, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm: string, day?: number) => at(hhmm, day).toISOString()
const block = (id: string, from: string, to: string, task_id: string | null = null): Block => ({ id, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id })
const task = (id: string, completed_at: string | null = null): NowTask => ({ id, status: completed_at ? 'done' : 'todo', completed_at })

const DEEP = block('deep', '09:00', '10:30')
const BANK = block('bank', '11:30', '12:00', 'bank-task')
const SYNC = block('sync', '13:00', '13:30')
const DAY = [SYNC, BANK, DEEP]

function state(now: Date, o: { events?: Block[]; tasks?: NowTask[]; focus?: FocusNow; clockMs?: number } = {}) {
  const tasks = new Map((o.tasks ?? [task('bank-task')]).map((t) => [t.id, t] as const))
  return nowState({ events: o.events ?? DAY, taskOf: (id) => tasks.get(id), now, focus: o.focus, clockMs: o.clockMs })
}

describe('nowState — MK Now Card states, only while something runs', () => {
  it('In progress: the running block, minutes left, ring = time spent', () => {
    const s = state(at('10:00'))
    expect(s).toMatchObject({ kind: 'running', leftMin: 30, pct: 67 })
    expect(nowBlock(s)?.id).toBe('deep')
  })

  it('idle — a block 12 minutes off, a free gap, nothing left — is no card (Kai: only while something runs)', () => {
    expect(state(at('11:18'))).toBeNull()
    expect(state(at('10:45'))).toBeNull()
    expect(state(at('15:00'))).toBeNull()
    expect(nowBlock(null)).toBeNull()
  })

  it("Running over: the task block ended, the task's still open → +minutes", () => {
    expect(state(at('12:20'))).toMatchObject({ kind: 'over', overMin: 20, block: { id: 'bank' } })
  })

  it('…not once the task is done, not after an hour, not once another block began', () => {
    expect(state(at('12:20'), { tasks: [task('bank-task', iso('11:50'))] })).toBeNull()
    expect(state(at('13:05'), { events: [BANK] })).toBeNull()
    expect(state(at('12:20'), { events: [BANK, block('call', '12:05', '12:15')] })).toBeNull()
  })

  it('a plain event never runs over (nothing to finish)', () => {
    expect(state(at('10:40'))).toBeNull()
  })

  it('Paused: the focus task, time frozen, hairline ring', () => {
    const focus: FocusNow = { taskId: 'bank-task', running: false, secondsLeft: 22 * 60, roundSeconds: 25 * 60, pausedAt: at('10:50').getTime() }
    const s = state(at('11:00'), { focus })
    expect(s).toMatchObject({ kind: 'paused', leftMin: 22, pct: 12, task: { id: 'bank-task' } })
    expect(s?.kind === 'paused' && s.since?.toISOString()).toBe(iso('10:50'))
  })

  it("…over its own block or a time block; a meeting or another task's block running outranks it", () => {
    const focus: FocusNow = { taskId: 'bank-task', running: false, secondsLeft: 600, roundSeconds: 1500, pausedAt: null }
    expect(state(at('11:40'), { focus })).toMatchObject({ kind: 'paused', block: { id: 'bank' }, since: null })
    expect(state(at('09:30'), { focus, events: [{ ...DEEP, type: 'time_block' }] })).toMatchObject({ kind: 'paused', block: { id: 'deep' } })
    expect(state(at('09:30'), { focus, events: [{ ...DEEP, type: 'event' }] })).toMatchObject({ kind: 'running', block: { id: 'deep' } })
    expect(state(at('09:30'), { focus, events: [{ ...DEEP, task_id: 'other' }], tasks: [task('bank-task'), task('other')] })).toMatchObject({ kind: 'running', block: { id: 'deep' } })
  })

  it('a running focus is not "paused" (and alone is no card)', () => {
    const focus: FocusNow = { taskId: 'bank-task', running: true, secondsLeft: 600, roundSeconds: 1500, pausedAt: null }
    expect(state(at('11:00'), { focus })).toBeNull()
  })

  it('Just done: checked off inside the toast window, then the card goes', () => {
    const doneAt = at('11:40').getTime()
    const tasks = [task('bank-task', new Date(doneAt).toISOString())]
    expect(state(at('11:40'), { tasks, clockMs: doneAt + 2000 })).toMatchObject({ kind: 'done', task: { id: 'bank-task' }, block: { id: 'bank' } })
    expect(state(at('11:40'), { tasks, clockMs: doneAt + JUST_DONE_MS })).toBeNull()
  })

  it('…and moves on to whatever runs next', () => {
    const doneAt = at('11:40').getTime()
    const tasks = [task('bank-task', new Date(doneAt).toISOString())]
    const events = [...DAY, block('focus', '11:35', '12:30')]
    expect(state(at('11:40'), { events, tasks, clockMs: doneAt + JUST_DONE_MS })).toMatchObject({ kind: 'running', block: { id: 'focus' } })
  })

  it("a task finished long ago (or one the card wasn't about) isn't Just done", () => {
    const tasks = [task('bank-task', iso('08:00')), task('other', iso('11:40'))]
    expect(state(at('11:40'), { tasks, clockMs: at('11:40').getTime() + 1000 })).toBeNull()
  })

  it('all-day events are never now; a block running since yesterday is', () => {
    expect(state(at('10:45'), { events: [{ ...SYNC, all_day: true }] })).toBeNull()
    const overnight = { id: 'night', starts_at: iso('23:00', 26), ends_at: iso('01:00'), all_day: false, task_id: null }
    expect(state(at('00:30'), { events: [overnight] })).toMatchObject({ kind: 'running', block: { id: 'night' } })
  })
})
