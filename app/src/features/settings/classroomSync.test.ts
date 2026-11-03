import { describe, expect, it } from 'vitest'
// The edge functions' pure Google Classroom logic — Deno-free on purpose so it can be tested here.
import { classroomAuthUrl, CLASSROOM_SCOPES, dueOf, hasAllScopes, isHandedIn, mergeCourses, planCourse, readChosenCourses, readCourses, type GWork, type StoredTask } from '../../../../supabase/functions/_shared/classroom.ts'

const NOW = new Date('2026-11-03T10:00:00Z')
let n = 0
const run = (work: GWork[], subs: Record<string, string>, stored: StoredTask[], zone = 'Africa/Cairo') =>
  planCourse({ courseId: 'c1', projectId: 'p1', domainId: 'd1', work, submissions: new Map(Object.entries(subs)), stored, zone, now: NOW, newId: () => `new${++n}` })
const hw = (id: string, over: Partial<GWork> = {}): GWork => ({ id, courseId: 'c1', title: `HW ${id}`, state: 'PUBLISHED', alternateLink: `https://classroom.google.com/c/c1/a/${id}`, dueDate: { year: 2026, month: 11, day: 10 }, dueTime: { hours: 21, minutes: 59 }, ...over })
const stored = (id: string, over: Partial<StoredTask> = {}, ref: Partial<NonNullable<StoredTask['external_ref']>> = {}): StoredTask => ({
  id: `t-${id}`, title: `HW ${id}`, status: 'todo', due_at: '2026-11-10T21:59:00.000Z', someday: false, deleted_at: null,
  external_ref: { source: 'classroom', id: `c1/${id}`, course_id: 'c1', due: '2026-11-10T21:59:00.000Z', title: `HW ${id}`, url: `https://classroom.google.com/c/c1/a/${id}`, ...ref }, ...over,
})
const NOTHING = { insert: [], update: [], done: [], trash: [] }

describe('dueOf', () => {
  it('a date and a time are UTC, exactly', () => {
    expect(dueOf({ dueDate: { year: 2026, month: 11, day: 10 }, dueTime: { hours: 21, minutes: 59 } }, 'Africa/Cairo')).toBe('2026-11-10T21:59:00.000Z')
    expect(dueOf({ dueDate: { year: 2026, month: 11, day: 10 }, dueTime: {} }, 'Africa/Cairo')).toBe('2026-11-10T00:00:00.000Z')
  })
  it('a date alone is the end of that day on the student clock, not 09:00', () => {
    expect(dueOf({ dueDate: { year: 2026, month: 11, day: 10 } }, 'Africa/Cairo')).toBe('2026-11-10T21:59:00.000Z') // Cairo is UTC+2 in November
    expect(dueOf({ dueDate: { year: 2026, month: 11, day: 10 } }, 'America/New_York')).toBe('2026-11-11T04:59:00.000Z')
  })
  it('no date is undated', () => {
    expect(dueOf({}, 'Africa/Cairo')).toBeNull()
    expect(dueOf({ dueTime: { hours: 5 } }, 'Africa/Cairo')).toBeNull()
  })
})

describe('submission state', () => {
  it('only TURNED_IN and RETURNED are handed in', () => {
    expect(['NEW', 'CREATED', 'RECLAIMED_BY_STUDENT', 'TURNED_IN', 'RETURNED', undefined].map(isHandedIn)).toEqual([false, false, false, true, true, false])
  })
})

describe('planCourse', () => {
  it('new dated work becomes a task with its due date and time, link and ids', () => {
    const p = run([hw('a')], { a: 'NEW' }, [])
    expect(p.insert).toHaveLength(1)
    expect(p.insert[0]).toMatchObject({ project_id: 'p1', domain_id: 'd1', title: 'HW a', status: 'todo', due_at: '2026-11-10T21:59:00.000Z', someday: false })
    expect(p.insert[0].external_ref).toMatchObject({ source: 'classroom', id: 'c1/a', url: 'https://classroom.google.com/c/c1/a/a', course_id: 'c1' })
  })
  it('undated work goes to Someday', () => {
    const p = run([hw('u', { dueDate: undefined, dueTime: undefined })], {}, [])
    expect(p.insert[0]).toMatchObject({ due_at: null, someday: true })
  })
  it('work already handed in, and last term missing work, is not imported', () => {
    const p = run([hw('t'), hw('old', { dueDate: { year: 2026, month: 9, day: 1 } })], { t: 'TURNED_IN' }, [])
    expect(p.insert).toEqual([])
  })
  it('no duplicates: work that already has a task is not inserted again, even a trashed one', () => {
    expect(run([hw('a')], {}, [stored('a')]).insert).toEqual([])
    expect(run([hw('a')], {}, [stored('a', { deleted_at: '2026-11-01T00:00:00Z' })])).toEqual(NOTHING)
  })
  it('TURNED_IN or RETURNED ticks an open task off', () => {
    expect(run([hw('a'), hw('b')], { a: 'TURNED_IN', b: 'RETURNED' }, [stored('a'), stored('b')]).done.map((d) => d.id)).toEqual(['t-a', 't-b'])
    expect(run([hw('a')], { a: 'RECLAIMED_BY_STUDENT' }, [stored('a')]).done).toEqual([])
  })
  it('a done task stays done and is never reopened or trashed', () => {
    const done = stored('a', { status: 'done' })
    expect(run([hw('a')], { a: 'NEW' }, [done])).toEqual(NOTHING)
    expect(run([], {}, [done]).trash).toEqual([])
  })
  it('a changed due date updates the task (and Someday follows)', () => {
    const p = run([hw('a', { dueTime: { hours: 10, minutes: 0 } })], {}, [stored('a')])
    expect(p.update).toHaveLength(1)
    expect(p.update[0].patch).toMatchObject({ due_at: '2026-11-10T10:00:00.000Z', someday: false })
    expect(p.update[0].patch.external_ref.due).toBe('2026-11-10T10:00:00.000Z')
    const gone = run([hw('a', { dueDate: undefined, dueTime: undefined })], {}, [stored('a')])
    expect(gone.update[0].patch).toMatchObject({ due_at: null, someday: true })
  })
  it('an unchanged Classroom leaves a date the person edited here alone', () => {
    const edited = stored('a', { due_at: '2026-11-12T08:00:00.000Z' })
    expect(run([hw('a')], {}, [edited]).update).toEqual([])
  })
  it('a renamed assignment renames the task', () => {
    expect(run([hw('a', { title: 'Essay 2' })], {}, [stored('a')]).update[0].patch.title).toBe('Essay 2')
  })
  it('work deleted in Classroom moves its open task to Trash; drafts count as gone', () => {
    expect(run([hw('b')], {}, [stored('a'), stored('b')]).trash).toEqual(['t-a'])
    expect(run([hw('a', { state: 'DRAFT' })], {}, [stored('a')]).trash).toEqual(['t-a'])
  })
  it('a second run with nothing new changes nothing', () => {
    expect(run([hw('a')], {}, [stored('a')])).toEqual(NOTHING)
  })
})

describe('courses and consent', () => {
  it('lists active courses only, with the section', () => {
    expect(readCourses([{ id: '1', name: 'Physics', section: 'A', courseState: 'ACTIVE' }, { id: '2', name: 'Old', courseState: 'ARCHIVED' }, { id: '3', courseState: 'ACTIVE' }])).toEqual([{ id: '1', name: 'Physics · A' }, { id: '3', name: '3' }])
  })
  it('choose keeps only listed ids', () => {
    const cs = [{ id: '1', name: 'a' }]
    expect(readChosenCourses(['1'], cs)).toEqual(['1'])
    expect(readChosenCourses(['9'], cs)).toBeNull()
    expect(readChosenCourses('1', cs)).toBeNull()
  })
  it('a re-read never chooses a new course for the person, and drops finished ones', () => {
    expect(mergeCourses([{ id: '1', name: 'a' }, { id: '2', name: 'new' }], ['1', '3'])).toEqual({ courses: [{ id: '1', name: 'a' }, { id: '2', name: 'new' }], chosen: ['1'] })
  })
  it('the consent page asks for the three read-only scopes, offline, and nothing granted before', () => {
    const q = new URL(classroomAuthUrl('https://accounts.google.com/o/oauth2/v2/auth', 'cid', 'https://x/functions/v1/classroom-connect', 's')).searchParams
    expect(q.get('scope')).toBe(CLASSROOM_SCOPES.join(' '))
    expect(q.get('scope')).not.toContain('calendar')
    expect(q.get('access_type')).toBe('offline')
    expect(q.has('include_granted_scopes')).toBe(false)
  })
  it('all three scopes must be granted', () => {
    expect(hasAllScopes(CLASSROOM_SCOPES.join(' '))).toBe(true)
    expect(hasAllScopes(CLASSROOM_SCOPES.slice(0, 2).join(' '))).toBe(false)
  })
})
