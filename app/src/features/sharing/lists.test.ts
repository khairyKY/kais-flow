import { describe, expect, it } from 'vitest'
import type { Task } from '../../lib/types'
import { faceOf, isSharedList, isTheirs, leftLine, listConnection, listItems, shareProblem, sharedLine, splitItems, stopCopy, tickWhen } from './lists'
import { moveGroups, placeTask } from '../tasks/move'
import type { Connection } from './model'

const ME = 'me-1'
const REEM: Connection = { circle_id: 'c1', relation: 'partner', partner_id: 'reem-1', partner_name: 'Reem', my_level: 'details', their_level: 'details', level: 'details', my_grant_id: 'g', show_lane: true, since: '2026-11-01T00:00:00Z', paused_until: null, paused_by_me: false }
const item = (id: string, over: Partial<Task> = {}): Task => ({
  id, project_id: 'p1', domain_id: null, area_id: null, title: id, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null,
  top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false,
  completed_at: null, created_at: `2026-11-1${id.length}T00:00:00Z`, updated_at: '2026-11-17T00:00:00Z', ...over,
})

describe('shared lists: which project, whose', () => {
  it('a project is a list only when the server marked it shared', () => {
    expect(isSharedList({ shared_circle_id: 'c1' })).toBe(true)
    expect(isSharedList({ shared_circle_id: null })).toBe(false)
    expect(isSharedList({})).toBe(false)
    expect(isSharedList(undefined)).toBe(false)
  })
  it('finds the connection by circle, and whose list it is', () => {
    expect(listConnection({ shared_circle_id: 'c1' }, [REEM])?.partner_name).toBe('Reem')
    expect(listConnection({ shared_circle_id: 'c9' }, [REEM])).toBeNull()
    expect(listConnection({ shared_circle_id: null }, [REEM])).toBeNull()
    expect(isTheirs({ user_id: 'reem-1' }, ME)).toBe(true)
    expect(isTheirs({ user_id: ME }, ME)).toBe(false)
    expect(isTheirs({}, ME)).toBe(false)
  })
})

describe('shared lists: the rows', () => {
  const rows = [
    item('b', { created_at: '2026-11-02T00:00:00Z' }),
    item('a', { created_at: '2026-11-01T00:00:00Z' }),
    item('d', { status: 'done', completed_at: '2026-11-17T10:00:00Z' }),
    item('e', { status: 'done', completed_at: '2026-11-17T16:12:00Z' }),
    item('x', { deleted_at: '2026-11-10T00:00:00Z' }),
    item('y', { status: 'cancelled' }),
    item('s', { parent_task_id: 'a' }),
    item('z', { project_id: 'other' }),
  ]
  it('lists the project\'s live items in the order they were added', () => {
    expect(listItems(rows, 'p1').map((t) => t.id)).toEqual(['a', 'b', 'd', 'e'])
  })
  it('To buy is the open items, Got the done ones with the latest tick first', () => {
    const { toBuy, got } = splitItems(listItems(rows, 'p1'))
    expect(toBuy.map((t) => t.id)).toEqual(['a', 'b'])
    expect(got.map((t) => t.id)).toEqual(['e', 'd'])
  })
  it('says what is left', () => {
    expect(leftLine([item('a'), item('b')])).toBe('2 to buy')
    expect(leftLine([item('a', { status: 'done' })])).toBe('All got')
    expect(leftLine([])).toBe('Empty')
  })
})

describe('shared lists: faces and times', () => {
  it('a row waiting in my outbox (no id yet) and my own ticks are mine', () => {
    expect(faceOf(null, ME, REEM)).toEqual({ name: 'You', mine: true })
    expect(faceOf(ME, ME, REEM)).toEqual({ name: 'You', mine: true })
  })
  it('the other person by name; a stranger or a deleted account as Someone', () => {
    expect(faceOf('reem-1', ME, REEM)).toEqual({ name: 'Reem', mine: false })
    expect(faceOf('gone', ME, REEM)).toEqual({ name: 'Someone', mine: false })
    expect(faceOf('reem-1', ME, null)).toEqual({ name: 'Someone', mine: false })
  })
  it('a tick reads the time today, the weekday this week, the date after', () => {
    const now = new Date('2026-11-18T10:00:00Z')
    expect(tickWhen('2026-11-18T08:30:00Z', now, 'Africa/Cairo')).toBe('10:30 AM')
    expect(tickWhen('2026-11-16T08:30:00Z', now, 'Africa/Cairo')).toBe('Mon')
    expect(tickWhen('2026-10-01T08:30:00Z', now, 'Africa/Cairo')).toBe('Oct 1')
    expect(tickWhen(null, now, 'Africa/Cairo')).toBe('')
  })
})

describe('shared lists: the words', () => {
  it('names the rule under the title', () => expect(sharedLine('Reem')).toBe('Shared with Reem · either of you adds and ticks'))
  it('says why a project can not be shared yet', () => {
    expect(shareProblem({ ok: false, error: 'private_items', count: 1 }, 'Reem')).toMatch(/1 item is Private/)
    expect(shareProblem({ ok: false, error: 'private_items', count: 3 }, 'Reem')).toMatch(/3 items are Private/)
    expect(shareProblem({ ok: false, error: 'not_connected' }, 'Reem')).toMatch(/not connected/)
    expect(shareProblem({ ok: false, error: 'not_yours' }, 'Reem')).toMatch(/made the project/)
  })
  it('leaving and stopping each promise a copy', () => {
    expect(stopCopy(true, 'Kai', 'Groceries')).toMatchObject({ action: 'Leave this list' })
    expect(stopCopy(true, 'Kai', 'Groceries').body).toMatch(/You keep a copy/)
    expect(stopCopy(false, 'Reem', 'Groceries')).toMatchObject({ action: 'Stop sharing' })
    expect(stopCopy(false, 'Reem', 'Groceries').body).toMatch(/Reem keeps a copy/)
  })
})

describe('moving a task into a shared list', () => {
  const task = { id: 't', project_id: null, area_id: null, domain_id: null, milestone_id: null, private: true }
  it('clears Private (everything in a shared list is shared)', () => {
    expect(placeTask(task, { kind: 'project', id: 'p1', domainId: null, name: 'Groceries', shared: true }).private).toBe(false)
  })
  it('leaves Private alone for an ordinary project', () => {
    expect(placeTask(task, { kind: 'project', id: 'p2', domainId: null, name: 'Thesis' }).private).toBe(true)
  })
  it('the picker marks a shared project', () => {
    const groups = moveGroups([], [], [{ id: 'p1', name: 'Groceries', domain_id: null, type: 'standard', status: 'active', shared_circle_id: 'c1', created_at: '', updated_at: '' }, { id: 'p2', name: 'Thesis', domain_id: null, type: 'standard', status: 'active', created_at: '', updated_at: '' }])
    const targets = groups.flatMap((g) => g.targets)
    expect(targets.find((t) => t.kind === 'project' && t.id === 'p1')).toMatchObject({ shared: true })
    expect(targets.find((t) => t.kind === 'project' && t.id === 'p2')).not.toHaveProperty('shared')
  })
})
