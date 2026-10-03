import { describe, expect, it } from 'vitest'
import { parseMarkdown, type MarkdownOptions } from './markdown'

// A two-file Obsidian vault, hand-written: front matter, headings, Obsidian Tasks emoji,
// a tab-indented subtask, a cancelled task, fenced code, wikilinks, tags, plain prose.
const garden = [
  '---',
  'tags: [garden]',
  '- [ ] not a task, front matter',
  '---',
  '# Garden',
  '',
  'Spring plan for the back beds.',
  'Mostly perennials this year.',
  '',
  '## This week',
  '- [ ] Repot the basil 📅 2026-10-05 #garden ⏫',
  '- [x] Order seeds ✅ 2026-09-28 📅 2026-09-27',
  '- [ ] Water the ferns 🔁 every week ⏳ 2026-10-05 🔼',
  '\t- [ ] Check the drip line [[Irrigation|drip system]]',
  '- [-] Build a greenhouse ❌ 2026-09-01',
  '',
  '```md',
  '- [ ] not a task, inside code',
  '```',
  '',
  '## Someday',
  '* [ ] Plant a pear tree #trees/fruit 🔽 ➕ 2026-09-02',
  '- plain bullet, not a task',
  '- [ ] Fix issue #12',
].join('\r\n')
const daily = ['# Saturday', '1. [ ] Call the nursery 🛫 2026-10-04 #calls', 'Met Omar at the market; neem oil for the aphids.'].join('\n')
const files = [{ path: 'Vault/Garden.md', text: garden }, { path: 'Vault/Daily/2026-10-03.md', text: daily }]

const NOW = new Date('2026-10-03T09:00:00Z')
const opts = (o: Partial<MarkdownOptions> = {}): MarkdownOptions => ({ projectFrom: 'heading', paragraphsToInbox: true, ...o })
const batch = await parseMarkdown(files, opts(), NOW)
const byTitle = (title: string) => batch.tasks.find((t) => t.title === title)!

describe('parseMarkdown', () => {
  it('finds checkbox lines only — not front matter, code, or plain bullets', () => {
    expect(batch.tasks.map((t) => t.title)).toEqual([
      'Repot the basil', 'Order seeds', 'Water the ferns', 'Check the drip line drip system',
      'Build a greenhouse', 'Plant a pear tree', 'Fix issue #12', 'Call the nursery',
    ])
  })

  it('📅 due (Cairo midnight), ⏳/🛫 stand in when there is no 📅', () => {
    expect(byTitle('Repot the basil').due_at).toBe('2026-10-04T21:00:00.000Z')
    expect(byTitle('Water the ferns').due_at).toBe('2026-10-04T21:00:00.000Z')
    expect(byTitle('Call the nursery').due_at).toBe('2026-10-03T21:00:00.000Z')
    expect(byTitle('Order seeds').due_at).toBe('2026-09-26T21:00:00.000Z')
  })

  it('[x] and [-] are done with their ✅/❌ day', () => {
    expect(byTitle('Order seeds')).toMatchObject({ done: true, completed_at: '2026-09-27T21:00:00.000Z' })
    expect(byTitle('Build a greenhouse')).toMatchObject({ done: true, completed_at: '2026-08-31T21:00:00.000Z' })
    expect(byTitle('Repot the basil').done).toBe(false)
  })

  it('🔁 → recurrence, priority emoji → 1/2/3, #tags → labels (#12 stays text)', () => {
    expect(byTitle('Water the ferns').recurrence_rule).toBe('FREQ=WEEKLY')
    expect([byTitle('Repot the basil').priority, byTitle('Water the ferns').priority, byTitle('Plant a pear tree').priority]).toEqual([1, 2, 3])
    expect(byTitle('Plant a pear tree').labels).toEqual(['trees/fruit'])
    expect(byTitle('Fix issue #12').labels).toEqual([])
  })

  it('an indented task is a subtask of the one above', () => {
    expect(byTitle('Check the drip line drip system').sourceParentId).toBe(byTitle('Water the ferns').external_ref.id)
    expect(byTitle('Water the ferns').sourceParentId).toBeNull()
  })

  it('projects from headings, or file names, or nothing', async () => {
    expect(batch.projects.map((p) => p.name)).toEqual(['This week', 'Someday', 'Saturday'])
    expect(byTitle('Plant a pear tree').sourceProjectId).toBe('project:Someday')
    const byFile = await parseMarkdown(files, opts({ projectFrom: 'file' }), NOW)
    expect(byFile.projects.map((p) => p.name)).toEqual(['Garden', '2026-10-03'])
    expect((await parseMarkdown(files, opts({ projectFrom: 'none' }), NOW)).projects).toEqual([])
  })

  it('paragraphs → Inbox notes only on opt-in', async () => {
    expect(batch.inbox.map((i) => i.raw_text)).toEqual([
      'Spring plan for the back beds.\nMostly perennials this year.',
      '- plain bullet, not a task',
      'Met Omar at the market; neem oil for the aphids.',
    ])
    expect((await parseMarkdown(files, opts({ paragraphsToInbox: false }), NOW)).inbox).toEqual([])
  })

  it('ids are stable, file-scoped, and survive a date edit', async () => {
    const edited = await parseMarkdown([{ ...files[0], text: garden.replace('📅 2026-10-05', '📅 2026-10-09') }, files[1]], opts(), NOW)
    expect(edited.tasks.map((t) => t.external_ref.id)).toEqual(batch.tasks.map((t) => t.external_ref.id))
    expect(byTitle('Repot the basil').external_ref.raw).toMatchObject({ file: 'Vault/Garden.md', heading: 'This week' })
  })
})
