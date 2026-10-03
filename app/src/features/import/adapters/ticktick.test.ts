import { describe, expect, it } from 'vitest'
import { parseTickTick } from './ticktick'

// Hand-written in the shape of TickTick's web backup (Settings → Account → Backup & Restore):
// the metadata preamble (incl. the quoted multi-line Status legend), then the real header.
// Neutral invented content.
const H = '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"'
const row = (cells: string[]) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')
const t = (o: Record<string, string>) => row([
  o.folder ?? '', o.list ?? 'Inbox', o.title, o.kind ?? 'TEXT', o.tags ?? '', o.content ?? '', o.checklist ?? 'N',
  o.start ?? '', o.due ?? '', '', o.repeat ?? '', o.priority ?? '0', o.status ?? '0', '2026-09-30T08:00:00+0000',
  o.completed ?? '', '-1099511627776', o.tz ?? 'Africa/Cairo', o.allDay ?? 'false', 'false', '', '', 'list', o.id, o.parent ?? '',
])
const csv = [
  '"Date: 2026-10-03+0000"',
  '"Version: 7.1"',
  '"Status: \n0 Normal\n1 Completed\n2 Archived"',
  H,
  t({ folder: 'Home', list: 'Garden', title: 'Repot the basil', tags: 'garden,weekend', content: 'Terracotta pot', start: '2026-10-04T21:00:00+0000', due: '2026-10-04T21:00:00+0000', priority: '5', allDay: 'true', id: '64f0a1' }),
  t({ folder: 'Home', list: 'Garden', title: 'Buy compost', id: '64f0a2', parent: '64f0a1' }),
  t({ title: 'Call the nursery', tags: 'calls', start: '2026-10-05T07:00:00+0000', due: '2026-10-05T07:30:00+0000', priority: '3', id: '64f0a3' }),
  t({ folder: 'Home', list: 'Garden', title: 'Water the ferns', start: '2026-10-05T06:00:00+0000', due: '2026-10-05T06:00:00+0000', repeat: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', priority: '1', id: '64f0a4' }),
  t({ folder: 'Home', list: 'Garden', title: 'Seed tray checklist', kind: 'CHECKLIST', content: '▪Fill trays\n▫Sow seeds', checklist: 'Y', status: '2', completed: '2026-09-20T15:12:00+0000', id: '64f0a5' }),
  t({ title: 'Garden ideas', kind: 'NOTE', tags: 'ideas', content: 'Espalier the pear tree along the south wall', id: '64f0a6' }),
  t({ list: 'Work', title: 'Quarterly review', start: '2026-10-07T07:00:00+0000', due: '2026-10-07T07:00:00+0000', status: '1', completed: '2026-10-02T10:00:00+0000', tz: 'America/Los_Angeles', allDay: 'true', id: '64f0a7' }),
].join('\r\n')

const batch = await parseTickTick(csv)
const [basil, compost, nursery, ferns, tray, review] = batch.tasks

describe('parseTickTick', () => {
  it('skips the metadata preamble and finds the header', () => {
    expect(batch.tasks.map((x) => x.title)).toEqual(['Repot the basil', 'Buy compost', 'Call the nursery', 'Water the ferns', 'Seed tray checklist', 'Quarterly review'])
  })

  it('lists become projects; Inbox stays project-less', () => {
    expect(batch.projects.map((p) => p.name)).toEqual(['Garden', 'Work'])
    expect(basil.sourceProjectId).toBe('project:Garden')
    expect(nursery.sourceProjectId).toBeNull()
  })

  it('NOTE items become notes, not tasks', () => {
    expect(batch.notes).toEqual([expect.objectContaining({ title: 'Garden ideas', body: 'Espalier the pear tree along the south wall', tags: ['ideas'] })])
  })

  it('all-day dates land on that calendar day (its own zone), at Cairo midnight', () => {
    expect(basil.due_at).toBe('2026-10-04T21:00:00.000Z') // Mon 5 Oct, Cairo
    expect(review.due_at).toBe('2026-10-06T21:00:00.000Z') // Wed 7 Oct in Los Angeles → 7 Oct, Cairo
  })

  it('a timed start < due becomes a scheduled block with a duration', () => {
    expect(nursery).toMatchObject({ scheduled_start: '2026-10-05T07:00:00.000Z', scheduled_end: '2026-10-05T07:30:00.000Z', duration_min: 30, due_at: '2026-10-05T07:00:00.000Z' })
    expect(ferns.scheduled_start).toBeNull()
    expect(ferns.due_at).toBe('2026-10-05T06:00:00.000Z')
  })

  it('priority 5/3/1/0 → 1/2/3/none; tags → labels', () => {
    expect([basil.priority, nursery.priority, ferns.priority, compost.priority]).toEqual([1, 2, 3, null])
    expect(basil.labels).toEqual(['garden', 'weekend'])
  })

  it('repeat RRULE carries over; parentId nests', () => {
    expect(ferns.recurrence_rule).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO')
    expect(compost.sourceParentId).toBe('64f0a1')
  })

  it('status 1 and 2 (archived) are done with their completed time; checklists read as markdown', () => {
    expect(tray).toMatchObject({ done: true, completed_at: '2026-09-20T15:12:00.000Z', notes: '- [x] Fill trays\n- [ ] Sow seeds' })
    expect(review.done).toBe(true)
    expect(basil).toMatchObject({ done: false, completed_at: null })
  })

  it('taskId is the idempotency key; the whole row survives in raw', () => {
    expect(basil.external_ref).toMatchObject({ source: 'ticktick', id: '64f0a1' })
    expect(basil.external_ref.raw).toMatchObject({ 'Folder Name': 'Home', Order: '-1099511627776' })
  })

  it('rejects a file without the TickTick header', async () => {
    await expect(parseTickTick('Title,Due\nx,y')).rejects.toThrow()
  })
})
