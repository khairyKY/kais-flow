import { describe, expect, it } from 'vitest'
import type { Area, CalendarEvent, Domain, Project, Task } from '../../lib/types'
import { calendarIcs, csvCell, exportEnvelope, exportFileName, icsFold, icsText, tasksCsv, TASK_CSV_HEADER } from './files'

const T = '2026-10-01T09:00:00Z'
const task = (o: Partial<Task>): Task => ({
  id: 't', project_id: null, domain_id: null, area_id: null, title: 'A task', notes: null, status: 'todo', due_at: null,
  scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [],
  priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null,
  deleted_at: null, created_at: T, updated_at: T, ...o,
})
const event = (o: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e', title: 'An event', starts_at: '2026-10-17T07:00:00Z', ends_at: '2026-10-17T08:00:00Z', all_day: false, task_id: null,
  source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, created_at: T, updated_at: T, ...o,
})
// A CSV parser good enough to read our own output back (quoted fields, "" escapes, CRLF rows).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted && c === '"' && text[i + 1] === '"') {
      cell += '"'
      i++
    } else if (c === '"') {
      quoted = !quoted
    } else if (!quoted && c === ',') {
      row.push(cell)
      cell = ''
    } else if (!quoted && c === '\r' && text[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else {
      cell += c
    }
  }
  return rows
}

describe('csvCell', () => {
  it('leaves plain text and numbers alone, empties nulls', () => {
    expect(csvCell('Renew the domain')).toBe('Renew the domain')
    expect(csvCell(30)).toBe('30')
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    expect(csvCell('eggs, milk')).toBe('"eggs, milk"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
  })
  it('keeps a formula from running in Excel / Sheets', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1 idea')).toBe("'+1 idea")
    expect(csvCell('-call mom')).toBe("'-call mom")
    expect(csvCell('@home')).toBe("'@home")
  })
})

describe('tasksCsv', () => {
  const projects = [{ id: 'p1', name: 'Website' }] as Project[]
  const areas = [{ id: 'a1', name: 'Work' }] as Area[]
  const domains = [{ id: 'd1', name: 'Shaheen' }] as Domain[]
  const tasks = [
    task({ id: 'parent', title: 'Launch 🚀', project_id: 'p1', area_id: 'a1', domain_id: 'd1', labels: ['Urgent', 'Deep work'], priority: 1, duration_min: 45, due_at: '2026-10-20T21:59:00Z', scheduled_start: '2026-10-17T07:00:00Z', scheduled_end: '2026-10-17T07:45:00Z', notes: 'Check, then "ship"\nsecond line' }),
    task({ id: 'child', title: 'اكتب النص', parent_task_id: 'parent', status: 'done', completed_at: '2026-10-02T10:15:00Z' }),
    task({ id: 'gone', title: 'In the trash', deleted_at: '2026-10-03T00:00:00Z' }),
  ]
  const csv = tasksCsv(tasks, { projects, areas, domains }, 'Asia/Tokyo')

  it('starts with a UTF-8 BOM and uses CRLF rows', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.slice(1).split('\r\n')[0]).toBe(TASK_CSV_HEADER.join(','))
  })
  it('one row per task outside Trash, names instead of ids, times on the user’s clock', () => {
    const rows = parseCsv(csv.slice(1))
    expect(rows).toHaveLength(3) // header + 2 (the trashed one is left out)
    const col = (r: string[], h: string) => r[TASK_CSV_HEADER.indexOf(h)]
    const [, parent, child] = rows
    expect(col(parent, 'Title')).toBe('Launch 🚀')
    expect(col(parent, 'Status')).toBe('To do')
    expect(col(parent, 'Due date')).toBe('2026-10-21') // 06:59 the next day in Tokyo
    expect(col(parent, 'Scheduled start')).toBe('2026-10-17 16:00')
    expect(col(parent, 'Scheduled end')).toBe('2026-10-17 16:45')
    expect(col(parent, 'Duration (min)')).toBe('45')
    expect(col(parent, 'Priority')).toBe('Critical')
    expect(col(parent, 'Labels')).toBe('Urgent, Deep work')
    expect([col(parent, 'Project'), col(parent, 'Area'), col(parent, 'Domain')]).toEqual(['Website', 'Work', 'Shaheen'])
    expect(col(parent, 'Notes')).toBe('Check, then "ship"\nsecond line')
    expect(col(parent, 'Created')).toBe('2026-10-01 18:00')
    expect(col(child, 'Title')).toBe('اكتب النص')
    expect(col(child, 'Parent task')).toBe('Launch 🚀')
    expect(col(child, 'Status')).toBe('Done')
    expect(col(child, 'Completed')).toBe('2026-10-02 19:15')
    expect(col(child, 'Project')).toBe('')
  })
})

describe('ics text and folding', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(icsText('a\\b; c, d\ne')).toBe('a\\\\b\\; c\\, d\\ne')
  })
  it('folds at 75 octets without splitting a UTF-8 character', () => {
    const line = 'SUMMARY:' + 'مرحبا 🌿 '.repeat(20)
    const folded = icsFold(line)
    const physical = folded.split('\r\n')
    expect(physical.length).toBeGreaterThan(1)
    for (const p of physical) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    for (const p of physical.slice(1)) expect(p.startsWith(' ')).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(line) // unfolds back exactly
    expect(icsFold('SHORT:line')).toBe('SHORT:line')
  })
})

describe('calendarIcs', () => {
  const now = new Date('2026-10-17T12:00:00Z')
  const ics = calendarIcs(
    [
      event({ id: 'one', title: 'Dentist, then lunch; maybe' }),
      event({ id: 'day', title: 'Trip', all_day: true, starts_at: '2026-10-20T00:00:00Z', ends_at: '2026-10-22T00:00:00Z', busy: false }),
      event({ id: 'weekly', title: 'Standup', starts_at: '2026-10-05T06:00:00Z', ends_at: '2026-10-05T06:15:00Z', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z', recurrence_exdates: ['2026-10-12T06:00:00.000Z'] }),
      event({ id: 'block', title: 'Write the brief', type: 'task', task_id: 't1' }),
      event({ id: 'google', title: 'From Google', source: 'gcal' }),
      event({ id: 'trashed', title: 'Gone', deleted_at: T }),
    ],
    'Africa/Cairo',
    now,
  )
  const unfolded = ics.replace(/\r\n /g, '')
  const vevent = (uid: string) => unfolded.split('BEGIN:VEVENT').find((b) => b.includes(`UID:${uid}\r\n`)) ?? ''

  it('is a VCALENDAR with CRLF lines', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })
  it('the user’s own events and task blocks; not Google’s, not Trash', () => {
    expect((unfolded.match(/BEGIN:VEVENT/g) ?? []).length).toBe(4)
    expect(vevent('block')).toContain('SUMMARY:Write the brief')
    expect(vevent('google')).toBe('')
    expect(vevent('trashed')).toBe('')
  })
  it('a one-off in UTC with escaped text', () => {
    expect(vevent('one')).toContain('DTSTART:20261017T070000Z\r\nDTEND:20261017T080000Z')
    expect(vevent('one')).toContain('SUMMARY:Dentist\\, then lunch\\; maybe')
    expect(vevent('one')).toContain('DTSTAMP:20261017T120000Z')
  })
  it('an all-day block as dates, the end exclusive; free time is transparent', () => {
    expect(vevent('day')).toContain('DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261022')
    expect(vevent('day')).toContain('TRANSP:TRANSPARENT')
  })
  it('a repeat on the user’s wall clock, with its rule and its skipped start', () => {
    const w = vevent('weekly')
    expect(w).toContain('DTSTART;TZID=Africa/Cairo:20261005T090000') // Cairo is UTC+3 in October 2026
    expect(w).toContain('DTEND;TZID=Africa/Cairo:20261005T091500')
    expect(w).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z')
    expect(w).toContain('EXDATE;TZID=Africa/Cairo:20261012T090000')
  })
})

describe('the .json envelope and file names', () => {
  it('wraps the tables with the app, its version and when', () => {
    const env = exportEnvelope({ tasks: [{ id: 't' }], journal_entries: [] }, '1.2.3', new Date('2026-10-17T10:00:00Z'))
    expect(env).toEqual({ app: "Kai's Flow", version: '1.2.3', exported_at: '2026-10-17T10:00:00.000Z', tables: { tasks: [{ id: 't' }], journal_entries: [] } })
  })
  it('names files by the user’s day', () => {
    const late = new Date('2026-10-16T22:30:00Z') // already the 17th in Cairo
    expect(exportFileName('json', late, 'Africa/Cairo')).toBe('kais-flow-2026-10-17.json')
    expect(exportFileName('csv', late, 'Africa/Cairo')).toBe('kais-flow-tasks-2026-10-17.csv')
    expect(exportFileName('ics', late, 'UTC')).toBe('kais-flow-calendar-2026-10-16.ics')
  })
})
