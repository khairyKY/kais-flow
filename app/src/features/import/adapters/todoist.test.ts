import { describe, expect, it } from 'vitest'
import { parseTodoist } from './todoist'
import { parseLooseDate, parseRecurrence } from './shared'

// Hand-written in the shape of Todoist's "Export as a template → CSV" (2025+ columns incl.
// DEADLINE), CRLF like the real download. Neutral invented content.
const csv = [
  'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG',
  'meta,view_style=list,,,,,,,,,,,,',
  'task,Repot the basil @garden @weekend,Terracotta pot from the shed,1,1,Kai (48151623),,Oct 5 2026,en,Africa/Cairo,30,minute,,',
  'task,Buy compost,,4,2,Kai (48151623),,,en,Africa/Cairo,,None,,',
  'note,Get the peat-free one,,,,Kai (48151623),,,,,,,,',
  ',,,,,,,,,,,,,',
  'section,Weekly,,,,,,,,,,,,',
  'task,Water the ferns,,2,1,Kai (48151623),,every monday at 9am,en,Africa/Cairo,15,minute,,',
  'task,Check the seed tray,,3,1,Kai (48151623),,every day,en,,,,,',
  'task,"Order seeds, ""heirloom"" kind",,4,1,Kai (48151623),,tomorrow 18:00,en,Africa/Cairo,,,Oct 9 2026,en',
  'task,Water the ferns,,2,1,Kai (48151623),,,en,,,,,',
].join('\r\n')

// Saturday 3 Oct 2026, 12:00 in Cairo (UTC+3 — Egypt's DST runs to late October).
const NOW = new Date('2026-10-03T09:00:00Z')
const batch = await parseTodoist(csv, 'Garden Projects.csv', NOW)
const [basil, compost, ferns, tray, seeds, ferns2] = batch.tasks

describe('parseTodoist', () => {
  it('one project per file, named after the file', () => {
    expect(batch.projects).toEqual([{ name: 'Garden Projects', external_ref: expect.objectContaining({ source: 'todoist', id: 'project:Garden Projects' }) }])
    expect(batch.tasks.every((t) => t.sourceProjectId === 'project:Garden Projects')).toBe(true)
  })

  it('reads tasks, skips meta/blank rows, folds comments into the task above', () => {
    expect(batch.tasks.map((t) => t.title)).toEqual(['Repot the basil', 'Buy compost', 'Water the ferns', 'Check the seed tray', 'Order seeds, "heirloom" kind', 'Water the ferns'])
    expect(basil.notes).toBe('Terracotta pot from the shed')
    expect(compost.notes).toBe('Get the peat-free one')
  })

  it('@labels leave the title; a section becomes a label', () => {
    expect(basil.labels).toEqual(['garden', 'weekend'])
    expect(ferns.labels).toEqual(['Weekly'])
  })

  it('priority: Todoist 1 (p1) → 1 "!!!", 2 → 2, 3 → 3, 4 (p4) → none', () => {
    expect([basil.priority, ferns.priority, tray.priority, compost.priority]).toEqual([1, 2, 3, null])
  })

  it('INDENT 2 nests under the task above', () => {
    expect(compost.sourceParentId).toBe(basil.external_ref.id)
    expect(basil.sourceParentId).toBeNull()
  })

  it('dates read on Cairo wall clock: date-only → midnight, deadline beats date', () => {
    expect(basil.due_at).toBe('2026-10-04T21:00:00.000Z') // Mon 5 Oct 00:00 Cairo
    expect(seeds.due_at).toBe('2026-10-08T21:00:00.000Z') // DEADLINE Oct 9
    expect(seeds.external_ref.raw.DATE).toBe('tomorrow 18:00')
    expect(compost.due_at).toBeNull()
  })

  it('recurring dates → recurrence_rule + the next occurrence (or today)', () => {
    expect(ferns.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(ferns.due_at).toBe('2026-10-05T06:00:00.000Z') // next Monday 09:00 Cairo
    expect(tray.recurrence_rule).toBe('FREQ=DAILY')
    expect(tray.due_at).toBe('2026-10-02T21:00:00.000Z') // today 00:00 Cairo
  })

  it('duration in minutes', () => {
    expect(basil.duration_min).toBe(30)
    expect(compost.duration_min).toBeNull()
  })

  it('ids are stable across parses and distinct for a repeated title', async () => {
    const again = await parseTodoist(csv, 'Garden Projects.csv', NOW)
    expect(again.tasks.map((t) => t.external_ref.id)).toEqual(batch.tasks.map((t) => t.external_ref.id))
    expect(ferns2.external_ref.id).not.toBe(ferns.external_ref.id)
    expect(new Set(batch.tasks.map((t) => t.external_ref.id)).size).toBe(6)
  })

  it('keeps the whole row in raw', () => {
    expect(basil.external_ref.raw).toMatchObject({ AUTHOR: 'Kai (48151623)', DATE_LANG: 'en', section: null })
  })

  it('rejects a CSV that is not a Todoist export', async () => {
    await expect(parseTodoist('Title,Due\nx,y', 'x.csv', NOW)).rejects.toThrow()
  })
})

describe('parseLooseDate / parseRecurrence', () => {
  it('reads relative and absolute phrases on Cairo time', () => {
    expect(parseLooseDate('tomorrow 18:00', NOW)).toBe('2026-10-04T15:00:00.000Z')
    expect(parseLooseDate('October 5, 2026 9:00 AM', NOW)).toBe('2026-10-05T06:00:00.000Z')
    expect(parseLooseDate('January 10, 2027', NOW)).toBe('2027-01-09T22:00:00.000Z') // winter: UTC+2
    expect(parseLooseDate('2026-10-05', NOW)).toBe('2026-10-04T21:00:00.000Z')
    expect(parseLooseDate('not a date', NOW)).toBeNull()
  })

  it('an overdue "Sep 1" stays this year unless reading forward', () => {
    expect(parseLooseDate('Sep 1', NOW)).toBe('2026-08-31T21:00:00.000Z')
    expect(parseLooseDate('Sep 1', NOW, 'Africa/Cairo', true)).toBe('2027-08-31T21:00:00.000Z')
  })

  it('maps the common repeat phrases', () => {
    expect(parseRecurrence('every day')).toBe('FREQ=DAILY')
    expect(parseRecurrence('every! 2 weeks')).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(parseRecurrence('every other month')).toBe('FREQ=MONTHLY;INTERVAL=2')
    expect(parseRecurrence('every mon, fri at 8am')).toBe('FREQ=WEEKLY;BYDAY=MO,FR')
    expect(parseRecurrence('every weekday')).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(parseRecurrence('every week on tuesday when done')).toBe('FREQ=WEEKLY;BYDAY=TU')
    expect(parseRecurrence('yearly')).toBe('FREQ=YEARLY')
    expect(parseRecurrence('every 3rd friday')).toBeNull()
  })
})
