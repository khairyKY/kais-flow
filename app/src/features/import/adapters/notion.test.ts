import { describe, expect, it } from 'vitest'
import { parseCsv, csvToBatch, guessMapping } from './csv'

// Notion: a database exported as "Markdown & CSV" — the CSV starts with a BOM, dates read
// "October 5, 2026" (+ time, or a "→" range), relations read "Name (https://www.notion.so/…)",
// multi-selects are comma-joined, checkboxes are Yes/No. Hand-written, invented content.
const csv = '﻿' + [
  'Name,Assignee,Created time,Date,Done,Priority,Project,Status,Tags',
  'Repot the basil,Kai,"October 1, 2026 9:12 AM","October 5, 2026",No,High,Garden (https://www.notion.so/Garden-1a2b3c4d5e6f),In progress,"garden, weekend"',
  'File the taxes,Kai,"September 20, 2026 8:00 AM","October 12, 2026 9:00 AM",No,Medium,,Not started,admin',
  'Order seeds → heirloom,Kai,"September 2, 2026 8:00 AM","September 10, 2026 → September 12, 2026",Yes,Low,Garden (https://www.notion.so/Garden-1a2b3c4d5e6f),Done,',
  ',Kai,"September 2, 2026 8:00 AM",,No,,,,',
].join('\n')

const NOW = new Date('2026-10-03T09:00:00Z')
const rows = parseCsv(csv)
const mapping = guessMapping(rows[0])
const batch = await csvToBatch(rows, mapping, 'notion', NOW)
const [basil, taxes, seeds] = batch.tasks

describe('Notion database CSV', () => {
  it('Notion-aware defaults: Name/Date/Done/Priority/Project/Tags; Created time and the 2nd done-ish column left alone', () => {
    expect(rows[0][0]).toBe('Name') // BOM gone
    expect(mapping).toEqual({ 0: 'title', 3: 'due', 4: 'done', 5: 'priority', 6: 'project', 8: 'labels' })
  })

  it('a Status-only database maps Status → done', async () => {
    const r = parseCsv('Task name,Status,Due\nA,Done,\nB,In progress,')
    const m = guessMapping(r[0])
    expect(m).toEqual({ 0: 'title', 1: 'done', 2: 'due' })
    expect((await csvToBatch(r, m, 'notion', NOW)).tasks.map((t) => t.done)).toEqual([true, false])
  })

  it('reads rows as tasks, skipping untitled ones, source notion', () => {
    expect(batch.tasks.map((t) => t.title)).toEqual(['Repot the basil', 'File the taxes', 'Order seeds → heirloom'])
    expect(batch.source).toBe('notion')
    expect(basil.external_ref.source).toBe('notion')
  })

  it('relations lose their URL and become projects', () => {
    expect(batch.projects.map((p) => p.name)).toEqual(['Garden'])
    expect(basil.sourceProjectId).toBe('Garden')
    expect(taxes.sourceProjectId).toBeNull()
  })

  it('dates: plain day → Cairo midnight, with a time → that Cairo time, a range → its start', () => {
    expect(basil.due_at).toBe('2026-10-04T21:00:00.000Z')
    expect(taxes.due_at).toBe('2026-10-12T06:00:00.000Z')
    expect(seeds.due_at).toBe('2026-09-09T21:00:00.000Z')
  })

  it('checkbox, priority and multi-select', () => {
    expect([basil.done, taxes.done, seeds.done]).toEqual([false, false, true])
    expect([basil.priority, taxes.priority, seeds.priority]).toEqual([1, 2, 3])
    expect(basil.labels).toEqual(['garden', 'weekend'])
  })

  it('keeps the whole row (incl. unmapped Status/Assignee) in raw', () => {
    expect(basil.external_ref.raw).toMatchObject({ Status: 'In progress', Assignee: 'Kai' })
  })
})
