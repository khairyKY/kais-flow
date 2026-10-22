import { describe, expect, it, beforeAll } from 'vitest'
import { setHour24 } from '../../lib/clock'
import {
  chipCounts, describeRow, doneWord, excerpt, groupRows, hitDay, inWindow, indexSearchData, isOpen, journalDate, relatedRows, searchRows, NO_FILTERS, RELATED_MAX,
  type SearchData, type SearchRow,
} from './searchView'
import type { Book, CalendarEvent, InboxItem, Interaction, JournalEntry, Note, Person, Project, Quote, SearchEntityType, SearchHit, Task, TimeEntry } from '../../lib/types'

// These read times on the 24-hour clock (lib/clock, Kai 2026-10-22); the 12-hour one is lib/clock.test's.
beforeAll(() => setHour24(true))

// Monday 12 Oct 2026, 10:00 on the user's clock (Africa/Cairo, the default zone: UTC+3 until the
// last Thursday of October). Every day below is a Cairo day, whatever zone the device runs in.
const NOW = new Date('2026-10-12T07:00:00Z')
const C = '2026-10-01T09:00:00Z'

const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id, title, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false,
  snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false,
  completed_at: null, created_at: C, updated_at: C, ...over,
})
const project = (id: string, name: string, over: Partial<Project> = {}): Project => ({ id, domain_id: null, name, type: 'standard', status: 'active', created_at: C, updated_at: C, ...over })
const event = (id: string, title: string, starts: string, ends: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title, starts_at: starts, ends_at: ends, all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, created_at: C, updated_at: C, ...over,
})
const inbox = (id: string, raw: string, status: InboxItem['status'] = 'pending'): InboxItem => ({ id, kind: 'text', raw_text: raw, transcript: null, ai_parse: null, confidence: null, status, filed_task_id: null, payload: null, snoozed_until: null, created_at: C, updated_at: '2026-10-04T09:00:00Z' })
const journal = (id: string, body: string, day: string): JournalEntry => ({ id, body, entry_date: day, mood: null, transcript: null, media_paths: [], gratitude: [], created_at: C, updated_at: C })
const person = (id: string, name: string): Person => ({ id, user_id: 'u', name, facts: [], domain_id: null, created_at: C, updated_at: C })
const touch = (personId: string, at: string): Interaction => ({ id: `i-${at}`, user_id: 'u', person_id: personId, summary: 'x', occurred_at: at, created_at: at, updated_at: at } as Interaction)
const book = (id: string, title: string, over: Partial<Book> = {}): Book => ({ id, user_id: 'u', title, author: null, published_year: null, current_page: 0, total_pages: 1, status: 'reading', created_at: C, updated_at: C, ...over })
const note = (id: string, body: string, over: Partial<Note> = {}): Note => ({ id, user_id: 'u', title: null, body, tags: [], domain_id: null, book_id: null, created_at: C, updated_at: C, ...over })
const quote = (id: string, text: string, over: Partial<Quote> = {}): Quote => ({ id, user_id: 'u', text, author: null, source: null, tags: [], book_id: null, page: null, created_at: C, updated_at: C, ...over })
const entry = (projectId: string, at: string, min: number): TimeEntry => ({ id: `te-${at}`, user_id: 'u', project_id: projectId, task_id: null, note: null, duration_min: min, started_at: at, ended_at: null, created_at: at, updated_at: at })
const hit = (entity_type: SearchEntityType, entity_id: string, title = entity_id, score = 1): SearchHit => ({ entity_type, entity_id, title, snippet: null, score })

const SHAHEEN = project('p1', 'Shaheen website', { type: 'retainer', color: 'var(--acc-terra)', updated_at: '2026-10-12T06:00:00Z' })
const OLD = project('p2', 'Old site', { status: 'archived' })
const DATA: SearchData = {
  tasks: [
    task('t-call', 'Call Omar about pricing', { priority: 2, due_at: '2026-10-13T12:00:00Z', scheduled_start: '2026-10-13T12:00:00Z', notes: 'Lock the retainer number before Omar flies out on Thursday, then send the milestone table.' }),
    task('t-scope', 'Send Omar the revised scope', { project_id: 'p1', due_at: '2026-10-16T06:00:00Z', notes: 'waiting on the milestone table' }),
    task('t-done', "Reply to Omar's comments", { project_id: 'p1', status: 'done', completed_at: '2026-10-11T15:00:00Z' }),
    task('t-invoice', 'Invoice the retainer', { project_id: 'p1', due_at: '2026-10-20T06:00:00Z' }),
    task('t-later', 'Renew the domain', { project_id: 'p1' }),
    task('t-early', 'Draft the brief', { project_id: 'p1', due_at: '2026-10-14T06:00:00Z' }),
    task('t-extra', 'Book the venue', { project_id: 'p1', due_at: '2026-10-25T06:00:00Z' }),
    task('t-gone', 'Old chore', { project_id: 'p1', status: 'cancelled' }),
    task('t-late', 'Late-night call', { due_at: '2026-10-12T22:30:00Z' }), // 01:30 on the 13th in Cairo
  ],
  projects: [SHAHEEN, OLD],
  events: [
    event('e-next', 'Pricing call — Omar', '2026-10-13T12:00:00Z', '2026-10-13T12:45:00Z'),
    event('e-past', 'Coffee — Omar', '2026-09-30T08:00:00Z', '2026-09-30T09:00:00Z'),
  ],
  inbox: [inbox('n-open', 'Omar idea: a monthly retainer report'), inbox('n-filed', 'Omar link', 'filed')],
  journal: [journal('j1', 'Omar pushed back on the timeline and he was right.', '2026-07-08'), journal('j2', 'A long walk after the Omar call.', '2026-10-12')],
  people: [person('o', 'Omar El-Sayed')],
  interactions: [touch('o', '2026-10-01T09:00:00Z'), touch('o', '2026-10-10T06:00:00Z')],
  books: [book('b1', 'Four Thousand Weeks', { author: 'Oliver Burkeman' }), book('b2', 'Done book', { status: 'finished' })],
  notes: [note('nt1', 'Notes from the efficiency chapter', { book_id: 'b1', title: 'Efficiency trap' }), note('nt2', 'Unrelated note')],
  quotes: [quote('q1', 'The garden does not hurry.', { book_id: 'b1', author: 'Oliver Burkeman', source: 'Four Thousand Weeks' })],
  timeEntries: [entry('p1', '2026-10-03T08:00:00Z', 300), entry('p1', '2026-10-09T08:00:00Z', 360), entry('p1', '2026-09-28T08:00:00Z', 600)],
}
const IX = indexSearchData(DATA)
const keys = (rows: readonly SearchRow[]) => rows.map((r) => `${r.hit.entity_type}:${r.hit.entity_id}${r.related ? '*' : ''}`)

describe('inWindow — the user’s calendar, weeks Monday to Sunday', () => {
  const today = '2026-10-12' // a Monday
  it.each([
    ['today', '2026-10-12', true], ['today', '2026-10-13', false],
    ['week', '2026-10-12', true], ['week', '2026-10-18', true], ['week', '2026-10-11', false], ['week', '2026-10-19', false],
    ['month', '2026-10-31', true], ['month', '2026-09-30', false],
    ['year', '2026-01-01', true], ['year', '2025-12-31', false],
    ['any', '1999-01-01', true],
  ] as const)('%s holds %s: %s', (w, day, want) => expect(inWindow(day, w, today)).toBe(want))

  it('a Sunday belongs to the week that started the Monday before', () => {
    expect(inWindow('2026-10-12', 'week', '2026-10-18')).toBe(true)
    expect(inWindow('2026-10-19', 'week', '2026-10-18')).toBe(false)
  })
})

describe('what "Open only" and "Any time" read', () => {
  it('open = not finished with', () => {
    expect(isOpen(hit('task', 't-call'), IX, NOW)).toBe(true)
    expect(isOpen(hit('task', 't-done'), IX, NOW)).toBe(false)
    expect(isOpen(hit('task', 't-gone'), IX, NOW)).toBe(false)
    expect(isOpen(hit('inbox_item', 'n-filed'), IX, NOW)).toBe(false)
    expect(isOpen(hit('project', 'p2'), IX, NOW)).toBe(false)
    expect(isOpen(hit('calendar_event', 'e-past'), IX, NOW)).toBe(false)
    expect(isOpen(hit('calendar_event', 'e-next'), IX, NOW)).toBe(true)
    expect(isOpen(hit('book', 'b2'), IX, NOW)).toBe(false)
    expect(isOpen(hit('person', 'o'), IX, NOW)).toBe(true)
    expect(isOpen(hit('task', 'not-cached'), IX, NOW)).toBeNull()
  })

  it('a day is a day on the user’s clock, not the device’s', () => {
    expect(hitDay(hit('task', 't-late'), IX)).toBe('2026-10-13')
    expect(hitDay(hit('task', 't-done'), IX)).toBe('2026-10-11') // undated: the day it was done
    expect(hitDay(hit('journal_entry', 'j1'), IX)).toBe('2026-07-08')
    expect(hitDay(hit('person', 'o'), IX)).toBe('2026-10-10') // the last touch
    expect(hitDay(hit('task', 'not-cached'), IX)).toBeNull()
  })
})

describe('searchRows — the hits, the filters, then Related', () => {
  const HITS = [hit('task', 't-call'), hit('task', 't-done'), hit('project', 'p1', 'Shaheen website'), hit('project', 'p2'), hit('calendar_event', 'e-past'), hit('inbox_item', 'n-filed'), hit('task', 'ghost')]

  it('no filters: every hit, then the open tasks of the matched project as Related', () => {
    expect(keys(searchRows(HITS, IX, NO_FILTERS, NOW))).toEqual([
      'task:t-call', 'task:t-done', 'project:p1', 'project:p2', 'calendar_event:e-past', 'inbox_item:n-filed', 'task:ghost',
      'task:t-early*', 'task:t-scope*', 'task:t-invoice*', // soonest due first, capped
    ])
  })

  it('Open only hides the finished; a row not in the cache stays (nothing known against it)', () => {
    const rows = searchRows(HITS, IX, { openOnly: true, window: 'any' }, NOW)
    expect(keys(rows).filter((k) => !k.endsWith('*'))).toEqual(['task:t-call', 'project:p1', 'task:ghost'])
  })

  it('Any time ▾ narrows by day; Related rows are held to it too', () => {
    const rows = searchRows(HITS, IX, { openOnly: false, window: 'week' }, NOW)
    // t-done was done on Sunday (last week); t-invoice is due next week
    expect(keys(rows)).toEqual(['task:t-call', 'project:p1', 'task:ghost', 'task:t-early*', 'task:t-scope*'])
    expect(keys(searchRows(HITS, IX, { openOnly: false, window: 'today' }, NOW))).toEqual(['project:p1', 'task:ghost'])
  })
})

describe('relatedRows — only links the data has', () => {
  it('a matched project brings its open tasks, never one that is already a hit, at most RELATED_MAX', () => {
    const rows = relatedRows([hit('project', 'p1'), hit('task', 't-early')], IX)
    expect(keys(rows)).toEqual(['task:t-scope*', 'task:t-invoice*', 'task:t-extra*'])
    expect(rows).toHaveLength(RELATED_MAX)
    expect(rows[0].related).toBe('In Shaheen website')
  })

  it('a matched book brings its notes and quotes', () => {
    const rows = relatedRows([hit('book', 'b1')], IX)
    expect(keys(rows)).toEqual(['note:nt1*', 'quote:q1*'])
    expect(rows.map((r) => r.related)).toEqual(['From Four Thousand Weeks', 'From Four Thousand Weeks'])
    expect(rows[0].hit.title).toBe('Efficiency trap')
  })

  it('people get none — the app keeps no person-to-person or person-to-project links', () => {
    expect(relatedRows([hit('person', 'o')], IX)).toEqual([])
  })
})

describe('groupRows + chipCounts', () => {
  const rows: SearchRow[] = [
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ hit: hit('task', id), related: null })),
    { hit: hit('task', 'r'), related: 'In X' },
    { hit: hit('person', 'o'), related: null },
    { hit: hit('note', 'nt2'), related: null },
    { hit: hit('quote', 'q1'), related: null },
  ]

  it('All: groups in the export’s order; a group peeks and keeps its last place for a Related row', () => {
    const groups = groupRows(rows, null)
    expect(groups.map((g) => `${g.key}:${g.rows.length}/${g.total}`)).toEqual(['person:1/1', 'task:5/7', 'library:2/2'])
    expect(keys(groups[1].rows)).toEqual(['task:a', 'task:b', 'task:c', 'task:d', 'task:r*'])
  })

  it('a chip shows its whole group', () => {
    const groups = groupRows(rows, 'task')
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(7)
  })

  it('chips follow 1a’s order, Library counts books, notes and quotes together', () => {
    expect(chipCounts(rows)).toEqual([
      { key: 'task', label: 'Tasks', count: 7 },
      { key: 'person', label: 'People', count: 1 },
      { key: 'library', label: 'Library', count: 2 },
    ])
  })
})

describe('excerpt', () => {
  it('a short text is itself', () => expect(excerpt('  Omar   pushed back ', 'omar')).toBe('Omar pushed back'))
  it('a long one is cut around the match, on word edges', () => {
    const text = 'We spent the whole morning on the forecast tables and the cohort numbers before lunch, and then Omar pushed back on the timeline and he was right — the buffer was fantasy all along, sadly.'
    const out = excerpt(text, 'omar', 60)
    expect(out.startsWith('…')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
    expect(out).toContain('Omar pushed back')
    expect(out.length).toBeLessThanOrEqual(62)
  })
  it('falls back to a word of the query, then to the start', () => {
    expect(excerpt('x '.repeat(80) + 'timeline', 'the timeline', 30)).toContain('timeline')
    expect(excerpt('abc '.repeat(40), 'zzz', 20)).toMatch(/^abc .*…$/)
  })
})

describe('the row lines (1a)', () => {
  const view = (h: SearchHit, related: string | null = null, query = 'omar') => describeRow({ hit: h, related }, IX, query, NOW)

  it('task: a matching note is quoted; the chip is its day + time; the priority flag', () => {
    const v = view(hit('task', 't-call'))
    expect(v.line).toBe('"Lock the retainer number before Omar flies out on Thursday, then send the milestone table."')
    expect(v.chip).toBe('Tomorrow 15:00')
    expect(v.flag).toBe('!!')
  })

  it('task: otherwise its place · its note; a date-only chip', () => {
    const v = view(hit('task', 't-scope'), null, 'revised')
    expect(v.line).toBe('Shaheen website · waiting on the milestone table')
    expect(v.chip).toBe('Fri 16 Oct')
  })

  it('task: a subtask says whose it is first (Subtasks, Kai 2026-10-16)', () => {
    const data = { ...DATA, tasks: [...DATA.tasks!, { ...DATA.tasks!.find((t) => t.id === 't-scope')!, id: 't-sub', title: 'Attach the table', notes: null, parent_task_id: 't-scope' }] }
    expect(describeRow({ hit: hit('task', 't-sub'), related: null }, indexSearchData(data), 'table', NOW).line).toBe('↳ Send Omar the revised scope · Shaheen website')
  })

  it('task: done reads "Done yesterday · <place>", no chip, struck', () => {
    const v = view(hit('task', 't-done'))
    expect(v).toMatchObject({ line: 'Done yesterday · Shaheen website', done: true, chip: null, flag: null })
  })

  it('a Related row carries its reason as its line', () => {
    expect(view(hit('task', 't-invoice'), 'In Shaheen website')).toMatchObject({ line: 'In Shaheen website', related: true })
  })

  it('events: day + times; a past one fades and says so', () => {
    expect(view(hit('calendar_event', 'e-next')).line).toBe('Tue 13 Oct · 15:00 – 15:45')
    expect(view(hit('calendar_event', 'e-past'))).toMatchObject({ line: 'Past · Wed 30 Sep', faded: true })
  })

  it('journal: a quoted passage and its date column', () => {
    expect(view(hit('journal_entry', 'j1'))).toMatchObject({ title: '"Omar pushed back on the timeline and he was right."', quoted: true, date: 'Jul 08' })
    expect(journalDate('2025-07-08', '2026-10-12')).toBe('Jul 08 2025')
  })

  it('project: open count, retainer, hours this month', () => {
    expect(view(hit('project', 'p1', 'Shaheen website'))).toMatchObject({ line: '5 open · retainer', chip: '11h this month', color: 'var(--acc-terra)' })
    expect(view(hit('project', 'p2'))).toMatchObject({ line: '0 open · archived', faded: true, chip: null })
  })

  it('person: last touch', () => expect(view(hit('person', 'o')).side).toBe('Last touch · 2d ago'))

  it('inbox: captured or filed', () => {
    expect(view(hit('inbox_item', 'n-open')).line).toBe('Captured Thu 1 Oct')
    expect(view(hit('inbox_item', 'n-filed'))).toMatchObject({ line: 'Filed · Sun 4 Oct', faded: true })
  })

  it('library: the kind word first', () => {
    expect(view(hit('book', 'b1'), null, 'weeks').line).toBe('Book · Oliver Burkeman')
    expect(view(hit('note', 'nt1'), null, 'efficiency').line).toBe('Note · "Notes from the efficiency chapter" · Four Thousand Weeks')
    expect(view(hit('quote', 'q1'), null, 'garden')).toMatchObject({ title: '"The garden does not hurry."', line: 'Quote · Oliver Burkeman · Four Thousand Weeks' })
  })

  it('a hit the cache doesn’t hold yet shows what the search sent', () => {
    expect(view({ ...hit('task', 'ghost', 'Ghost'), snippet: 'from the server' })).toMatchObject({ title: 'Ghost', line: 'from the server' })
  })
})

describe('doneWord', () => {
  it.each([
    ['2026-10-12T05:00:00Z', 'Done today'],
    ['2026-10-11T20:59:00Z', 'Done yesterday'], // 23:59 Cairo
    ['2026-10-11T21:00:00Z', 'Done today'], // 00:00 Cairo on the 12th
    ['2026-10-07T09:00:00Z', 'Done Wednesday'],
    ['2026-10-05T09:00:00Z', 'Done Mon 5 Oct'],
  ])('%s → %s', (at, want) => expect(doneWord(at, NOW)).toBe(want))
})
