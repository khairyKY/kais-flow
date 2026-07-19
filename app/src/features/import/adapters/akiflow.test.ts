import { describe, expect, it } from 'vitest'
import { parseAkiflow } from './akiflow'
import { naiveLocalToUtc, mapPriority, stableHash } from './shared'

// Fixture mirrors the real dump's shapes (all fields present, nulls where empty) —
// invented neutral titles, no personal data.
const akiflowTask = {
  id: '', url: 'https://link.akiflow.com/tasks/x', title: '',
  description: null as string | null, parent_task_id: null, parent_task_title: null,
  date: null as string | null, datetime: null as string | null,
  plan_week: null as string | null, plan_month: null,
  deadline: null as string | null, duration: null as number | null,
  priority: null as string | null, project_id: null as string | null, project_name: null as string | null,
  tags_ids: [] as string[], tags: [] as string[], links: [] as string[],
  done: false, done_at: null as string | null, status: 'inbox',
}

const dump = {
  source: 'akiflow',
  exported_at: '2026-07-18T05:00:00.000Z',
  projects: [
    { id: 'p1', name: '🌱 Garden (Hobby)' },
    { id: 'p2', name: 'Errands' },
  ],
  tags: [{ id: 'tag1', title: 'Deep Work' }],
  tasks: [
    { ...akiflowTask, id: 't1', title: 'Water the ferns', description: 'Front row first.<br /><br />Then the back.', priority: 'HIGH', duration: 45, project_id: 'p1', datetime: '2026-07-17T17:15:00', status: 'planned for Fri 17 Jul 17:15' },
    { ...akiflowTask, id: 't2', title: 'Buy seeds', priority: 'LOW', project_id: 'p2', date: '2026-07-20', deadline: '2026-07-25' },
    { ...akiflowTask, id: 't3', title: 'Old chore', done: true, done_at: '2026-01-15T09:30:00', priority: 'MEDIUM' },
    { ...akiflowTask, id: 't4', title: 'Someday: build a greenhouse', status: 'someday', priority: 'GOAL' },
    { ...akiflowTask, id: 't5', title: 'Tagged task', tags: ['Deep Work'] },
    // real dumps: {id,title} objects, orphaned {id,name:null} refs to deleted tags, and id-only lookups
    { ...(akiflowTask as object), id: 't6', title: 'Odd tags', tags: [{ id: 'tagX', name: null }, { id: 'tag1' }, { id: 'tag2', title: 'Inline' }] } as unknown as typeof akiflowTask,
  ],
  events: [
    { id: 'e1', url: '', title: 'Standup', start: '2026-07-18T10:00:00', end: '2026-07-18T10:15:00', duration: 15, all_day: false, description: null, location: null, recurrence: null, busy_mode: null, visibility: null, guests_count: 0, guests: [], declined: false, read_only: false, calendar_id: 'c1', calendar_name: 'Work', calendar_read_only: false },
  ],
  timeslots: [],
}

describe('parseAkiflow', () => {
  const batch = parseAkiflow(dump)

  it('maps projects name-as-is with akiflow ids as external refs', () => {
    expect(batch.projects).toHaveLength(2)
    expect(batch.projects[0].name).toBe('🌱 Garden (Hobby)')
    expect(batch.projects[0].external_ref).toMatchObject({ source: 'akiflow', id: 'p1' })
  })

  it('maps title/notes/priority/duration/project and flattens <br />', () => {
    const t = batch.tasks[0]
    expect(t.title).toBe('Water the ferns')
    expect(t.notes).toBe('Front row first.\n\nThen the back.')
    expect(t.priority).toBe(1) // HIGH → 1 ("!!!")
    expect(t.duration_min).toBe(45)
    expect(t.sourceProjectId).toBe('p1')
  })

  it('converts Cairo-naive datetime to UTC scheduled_start/_end (+2 in winterless July: Cairo DST = UTC+3)', () => {
    const t = batch.tasks[0]
    // 2026-07-17 17:15 Cairo (DST, UTC+3) → 14:15 UTC
    expect(t.scheduled_start).toBe('2026-07-17T14:15:00.000Z')
    expect(t.scheduled_end).toBe('2026-07-17T15:00:00.000Z') // +45min
    expect(t.due_at).toBe(t.scheduled_start) // no deadline → datetime doubles as due
  })

  it('prefers deadline over date for due_at, at Cairo midnight', () => {
    // 2026-07-25 00:00 Cairo (UTC+3) → 2026-07-24 21:00 UTC
    expect(batch.tasks[1].due_at).toBe('2026-07-24T21:00:00.000Z')
  })

  it('handles winter (non-DST) done_at: Cairo UTC+2', () => {
    // 2026-01-15 09:30 Cairo (UTC+2) → 07:30 UTC
    expect(batch.tasks[2].completed_at).toBe('2026-01-15T07:30:00.000Z')
    expect(batch.tasks[2].done).toBe(true)
  })

  it('maps someday status and GOAL priority', () => {
    expect(batch.tasks[3].someday).toBe(true)
    expect(batch.tasks[3].priority).toBe(1) // GOAL folds into 1
  })

  it('maps tags to labels', () => {
    expect(batch.tasks[4].labels).toEqual(['Deep Work'])
  })

  it('tolerates orphaned/object tags: deleted refs drop, ids resolve via dump.tags, inline titles keep', () => {
    expect(batch.tasks[5].labels).toEqual(['Deep Work', 'Inline'])
  })

  it('keeps the WHOLE source row in external_ref.raw (nothing dropped)', () => {
    const raw = batch.tasks[0].external_ref.raw
    expect(raw.url).toBe('https://link.akiflow.com/tasks/x')
    expect(raw.status).toBe('planned for Fri 17 Jul 17:15')
    expect(raw.plan_week).toBeNull()
  })

  it('parses events with Cairo → UTC conversion', () => {
    expect(batch.events[0].starts_at).toBe('2026-07-18T07:00:00.000Z')
    expect(batch.events[0].external_ref.id).toBe('e1')
  })

  it('is deterministic — same input, same external refs (idempotency keys stable)', () => {
    const again = parseAkiflow(dump)
    expect(again.tasks.map((t) => t.external_ref.id)).toEqual(batch.tasks.map((t) => t.external_ref.id))
  })

  it('rejects a non-akiflow file', () => {
    expect(() => parseAkiflow({ hello: 'world' })).toThrow()
  })
})

describe('shared helpers', () => {
  it('mapPriority covers the akiflow scale', () => {
    expect(mapPriority('GOAL')).toBe(1)
    expect(mapPriority('HIGH')).toBe(1)
    expect(mapPriority('MEDIUM')).toBe(2)
    expect(mapPriority('LOW')).toBe(3)
    expect(mapPriority('NONE')).toBeNull()
    expect(mapPriority(null)).toBeNull()
  })

  it('naiveLocalToUtc handles date-only as midnight local', () => {
    expect(naiveLocalToUtc('2026-07-20')).toBe('2026-07-19T21:00:00.000Z') // Cairo DST UTC+3
    expect(naiveLocalToUtc('2026-01-20')).toBe('2026-01-19T22:00:00.000Z') // winter UTC+2
  })

  it('stableHash is stable and input-sensitive', () => {
    expect(stableHash('a|b|c')).toBe(stableHash('a|b|c'))
    expect(stableHash('a|b|c')).not.toBe(stableHash('a|b|d'))
  })
})
