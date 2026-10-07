import { describe, expect, it } from 'vitest'
import { aiFill, aiPlace, taskFromParse, type AiFields } from './aiFill'
import { parseCommand } from '../command-bar/parseCommand'
import type { ParseResult } from './parseSchema'

const WORK = 'd-work'
const SITE = { id: 'p-site', domain_id: WORK }
const known = { projects: [SITE], domainIds: [WORK, 'd-home'] }
const ai = (over: Partial<ParseResult> = {}): ParseResult => ({
  kind: 'task',
  cleaned_text: 'Call the bank about the mortgage',
  title: 'Call the bank about the mortgage',
  description: null,
  domain_id: null,
  project_id: null,
  due_at: null,
  duration_min: null,
  priority: null,
  reminder_offset_min: null,
  confidence: 0.9,
  ...over,
})
const task = (over: Partial<AiFields> = {}): AiFields => ({
  title: 'Call the bank asap about the mortgage',
  notes: null,
  due_at: null,
  priority: null,
  duration_min: null,
  project_id: null,
  domain_id: null,
  reminder_at: null,
  ...over,
})
const TYPED = 'Call the bank asap about the mortgage'

describe('aiFill — the AI only fills what is still empty', () => {
  it('fills the empties: priority from "asap", duration, notes, a reminder off the date — and tidies the title', () => {
    const r = aiFill(task({ due_at: '2026-10-08T12:00:00.000Z' }), ai({ priority: 1, duration_min: 60, description: 'Ask about the fixed rate', reminder_offset_min: 15 }), known, TYPED)
    expect(r.filled).toEqual(['priority', 'duration', 'reminder', 'notes'])
    expect(r.patch).toEqual({
      priority: 1,
      duration_min: 60,
      reminder_at: '2026-10-08T11:45:00.000Z',
      notes: 'Ask about the fixed rate',
      title: 'Call the bank about the mortgage',
    })
  })

  it('an explicit token beats the AI: the typed `!`, `30m`, `#tag` and date stay as typed', () => {
    const p = parseCommand('Call the bank tomorrow 3pm ! 30m #site', [], [{ id: 'p-site', name: 'Site', domain_id: WORK } as never], { zone: 'cairo' })
    const created = task({ title: p.title, due_at: p.dueAt, priority: p.priority, duration_min: p.durationMin, project_id: p.projectId, domain_id: p.domainId })
    const r = aiFill(created, ai({ due_at: '2026-10-20T08:00:00Z', priority: 1, duration_min: 90, project_id: null, domain_id: 'd-home' }), known, p.title)
    expect(p.priority).toBe(3)
    expect(r.patch).toEqual({})
    expect(r.filled).toEqual([])
  })

  it('never overwrites what the person changed since, and keeps a renamed title', () => {
    const r = aiFill(task({ title: 'Ring the bank', priority: 2, notes: 'my own note' }), ai({ priority: 1, description: 'AI note', duration_min: 30 }), known, TYPED)
    expect(r.patch).toEqual({ duration_min: 30 })
  })

  it('leaves the title as typed when the AI pulled nothing out of it', () => {
    expect(aiFill(task(), ai(), known, TYPED)).toEqual({ patch: {}, filled: [] })
  })

  it('ignores what it can’t trust: made-up ids, a priority off the 1–3 scale, nonsense dates and durations', () => {
    const r = aiFill(task(), ai({ project_id: 'p-ghost', domain_id: 'd-ghost', priority: 4, due_at: 'next-ish', duration_min: -5 }), known, TYPED)
    expect(r).toEqual({ patch: {}, filled: [] })
  })
})

describe('aiPlace', () => {
  it('a project brings its own domain; a lone domain must exist; unsure = nowhere', () => {
    expect(aiPlace(ai({ project_id: 'p-site', domain_id: 'd-home' }), known)).toEqual({ project_id: 'p-site', domain_id: WORK })
    expect(aiPlace(ai({ domain_id: 'd-home' }), known)).toEqual({ project_id: null, domain_id: 'd-home' })
    expect(aiPlace(ai({ project_id: 'p-site', confidence: 0.5 }), known)).toEqual({ project_id: null, domain_id: null })
  })
})

describe('taskFromParse — a capture the AI files by itself', () => {
  it('takes every property it read, the description as notes; typed `!` / `30m` still win', () => {
    const t = taskFromParse(ai({ title: 'Email Priya the slides', description: 'For Friday’s board meeting', priority: 2, duration_min: 15, due_at: '2026-10-08T06:00:00Z', project_id: 'p-site' }), known, { priority: 1 })
    expect(t).toEqual({
      title: 'Email Priya the slides',
      domainId: WORK,
      projectId: 'p-site',
      dueAt: '2026-10-08T06:00:00.000Z',
      reminderOffsetMin: null,
      durationMin: 15,
      priority: 1,
      notes: 'For Friday’s board meeting',
    })
  })
})
