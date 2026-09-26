import { describe, expect, it } from 'vitest'
import { describeActivity, plural, NO_NAMES, type ActivityNames } from './describe'
import type { ActivityLogEntry } from '../../lib/types'

const PERSON = '11111111-1111-4111-8111-111111111111'
const INBOX = '22222222-2222-4222-8222-222222222222'
const ROUTINE = '33333333-3333-4333-8333-333333333333'
const TASK = '44444444-4444-4444-8444-444444444444'
const PROJECT = '55555555-5555-4555-8555-555555555555'
const JOURNAL = '66666666-6666-4666-8666-666666666666'
const RANDOM = '77777777-7777-4777-8777-777777777777'

function entry(event_type: string, entity_type: string, entity_id: string, payload: Record<string, unknown> | null = {}): ActivityLogEntry {
  return { id: RANDOM, event_type, entity_type, entity_id, payload, created_at: '2026-09-26T09:14:00Z' }
}

const NAMES: ActivityNames = {
  ...NO_NAMES,
  person: (id) => (id === PERSON ? 'Salma' : undefined),
  inbox: (id) => (id === INBOX ? 'basil seeds for the balcony' : undefined),
  routine: (id) => (id === ROUTINE ? 'Morning pages' : undefined),
  task: (id) => (id === TASK ? { title: 'Send the invoice', project_id: PROJECT } : undefined),
  project: (id) => (id === PROJECT ? 'Shaheen website' : undefined),
}

describe('describeActivity — the four audit mislabels (2026-09-26)', () => {
  it('a new person is "added", not an interaction', () => {
    const line = describeActivity(entry('people.created', 'people', PERSON, { name: 'Salma' }), NAMES)
    expect(line.text).toBe('Added "Salma" to People')
    expect(line.text).not.toMatch(/interaction/i)
    expect(line.category).toBe('people')
  })

  it('a capture names what was captured, never "inbox item"', () => {
    const line = describeActivity(entry('inbox.captured', 'inbox_item', INBOX, { kind: 'text' }), NAMES)
    expect(line.text).toBe('Captured "basil seeds for the balcony"')
    expect(line.details).toBe('quick capture')
    // Unknown item (e.g. since deleted): calm copy, no placeholder in quotes.
    expect(describeActivity(entry('inbox.captured', 'inbox_item', RANDOM, { kind: 'voice' }), NAMES).text).toBe('Captured a thought to the Inbox')
  })

  it('a journal save says what happened, never "journal" in quotes', () => {
    expect(describeActivity(entry('journal.updated', 'journal_entry', JOURNAL, { entry_date: '2026-09-26' })).text).toBe('Kept writing in the journal')
    expect(describeActivity(entry('journal.created', 'journal_entry', JOURNAL, { entry_date: '2026-09-26' })).text).toBe('Wrote a journal entry')
  })

  it("the evening line is noted without its words (S8) — even on rows written before the payload dropped them", () => {
    const now = describeActivity(entry('journal.line_added', 'ritual', RANDOM, { date: '2026-09-26', entity_key: '2026-09-26' }))
    expect(now.text).toBe("Added a line to today's journal")
    expect(now.details).toBe('evening ritual')
    const legacy = describeActivity(entry('journal.line_added', 'ritual', RANDOM, { text: 'the fig tree finally fruited' }))
    expect(legacy.text).toBe("Added a line to today's journal")
    expect(`${legacy.text} ${legacy.details}`).not.toContain('fig tree')
  })

  it('a new routine is planted, not "updated"', () => {
    const line = describeActivity(entry('routine.created', 'routine', ROUTINE, { name: 'Evening stretch', time_of_day: 'evening' }), NAMES)
    expect(line.text).toBe('Planted a new routine — "Evening stretch"')
    expect(line.details).toBe('evening')
    expect(line.text).not.toMatch(/updated/i)
  })
})

describe('describeActivity — names come from the lists when the payload has none', () => {
  it('an interaction names the person (entity_id is the person) and shows the summary', () => {
    const line = describeActivity(entry('people.interaction_logged', 'people', PERSON, { summary: 'coffee, talked jasmine' }), NAMES)
    expect(line.text).toBe('Logged an interaction with "Salma"')
    expect(line.details).toBe('coffee, talked jasmine')
    expect(line.href).toBe(`/people/${PERSON}`)
  })

  it('a routine check names the routine (the payload only carries the date)', () => {
    const line = describeActivity(entry('routine.checked', 'routine', ROUTINE, { date: '2026-09-26' }), NAMES)
    expect(line.text).toBe('Kept the streak on "Morning pages"')
    expect(line.details).toBe('the vine grew a leaf') // no invented streak day
  })

  it('a completed task shows its project from the task, not the (empty) payload', () => {
    const line = describeActivity(entry('task.completed', 'task', TASK, {}), NAMES)
    expect(line.text).toBe('Completed "Send the invoice"')
    expect(line.details).toBe('Shaheen website · dropped a petal')
    expect(line.href).toBe(`/projects/${PROJECT}?focus=${TASK}`)
  })

  it('a filed inbox note names the task and where it went', () => {
    const line = describeActivity(entry('inbox.filed', 'inbox_item', INBOX, { task_id: TASK }), NAMES)
    expect(line.text).toBe('Filed "Send the invoice" to Shaheen website')
  })

  it("a milestone event names the milestone, with the project underneath", () => {
    const line = describeActivity(entry('project.milestone_completed', 'project', PROJECT, { milestone_id: 'm1', title: 'Pricing page' }), NAMES)
    expect(line.text).toBe('Reached the milestone "Pricing page"')
    expect(line.details).toBe('Shaheen website')
  })
})

describe('describeActivity — edges', () => {
  it('an undone capture reads as going back to the Inbox', () => {
    const line = describeActivity(entry('task.deleted', 'task', RANDOM, { reason: 'capture undo' }), NAMES)
    expect(line.text).toBe('Sent a task back to the Inbox')
    expect(line.category).toBe('inbox')
  })

  it('work logged with no project or task says focus time, with only the recorded minutes', () => {
    const line = describeActivity(entry('project.work_logged', 'project', RANDOM, { note: 'pricing', duration_min: 45 }), NAMES)
    expect(line.text).toBe('Logged focus time')
    expect(line.details).toBe('45m · pricing')
    expect(line.href).toBeNull()
  })

  it('ritual steps read as the step', () => {
    expect(describeActivity(entry('ritual.step_completed', 'ritual', RANDOM, { ritual: 'morning', step: 'top3' })).text).toBe('Morning ritual — pick your Top-3')
    expect(describeActivity(entry('ritual.step_completed', 'ritual', RANDOM, { ritual: 'evening', step: 'seeds' })).text).toBe("Evening ritual — tomorrow's seeds")
  })

  it('a weekly-review verdict names the project and the verdict', () => {
    expect(describeActivity(entry('review.verdict', 'project', PROJECT, { verdict: 'needs a look' }), NAMES).text).toBe('Reviewed "Shaheen website" — needs a look')
    expect(describeActivity(entry('review.verdict', 'project', PROJECT, { verdict: 'reviewed ✓' }), NAMES).text).toBe('Reviewed "Shaheen website"')
  })

  it('a target date reads as a calendar day in every zone', () => {
    expect(describeActivity(entry('project.target_date_changed', 'project', PROJECT, { target_date: '2026-10-03' }), NAMES).details).toBe('Sat 3 Oct')
  })

  it('people rows that point at nothing have no link', () => {
    expect(describeActivity(entry('people.deleted', 'people', PERSON)).href).toBeNull()
    expect(describeActivity(entry('people.interaction_deleted', 'people', RANDOM)).href).toBeNull()
  })

  it('an unknown event never prints its raw name', () => {
    const line = describeActivity(entry('garden.bloom_counted', 'garden', RANDOM))
    expect(line.text).toBe('Bloom counted')
    expect(line.text).not.toContain('.')
  })
})

// Every event type a logActivity() caller writes (grep of app/src, 2026-09-26). With no names
// known — the worst case — none may fall back to a placeholder or a raw event name.
const WRITTEN: [string, string, Record<string, unknown>][] = [
  ['task.created', 'task', { title: 'x' }], ['task.created', 'task', { recurrence_parent: TASK }], ['task.completed', 'task', {}],
  ['task.reopened', 'task', {}], ['task.deleted', 'task', {}], ['task.deleted', 'task', { reason: 'inbox file undo' }],
  ['task.restored', 'task', {}], ['task.snoozed', 'task', { until: '2026-09-27T09:00:00Z' }], ['task.someday_set', 'task', { someday: true }],
  ['task.someday_set', 'task', { someday: false }], ['task.moved', 'task', { project_id: PROJECT }], ['task.moved', 'task', { project_id: null }],
  ['task.starred', 'task', {}], ['task.unstarred', 'task', {}], ['task.rescheduled', 'task', { due_at: null }], ['task.rescheduled', 'task', { due_at: '2026-09-27T09:00:00Z' }],
  ['task.recurrence_set', 'task', { rule: 'FREQ=WEEKLY' }], ['task.recurrence_set', 'task', { rule: null }], ['task.reminder_set', 'task', { reminder_at: null }],
  ['task.paused', 'task', {}], ['task.resumed', 'task', {}], ['task.skipped', 'task', { next_due_at: '2026-09-28T09:00:00Z' }], ['task.scheduled', 'task', { calendar_event_id: RANDOM }],
  ['capture.autofiled', 'task', { confidence: 0.9 }], ['capture.autofiled', 'task', { confidence: 0.9, source: 'reconnect' }],
  ['inbox.captured', 'inbox_item', { kind: 'text' }], ['inbox.captured', 'inbox_item', { kind: 'voice', offline: true }], ['inbox.captured', 'inbox_item', { kind: 'text', undoneFrom: TASK }],
  ['inbox.filed', 'inbox_item', { task_id: TASK }], ['inbox.dismissed', 'inbox_item', {}], ['inbox.snoozed', 'inbox_item', { until: 'x' }], ['inbox.restored', 'inbox_item', {}], ['inbox.purged', 'inbox_item', {}],
  ['routine.created', 'routine', { name: 'x', time_of_day: 'morning' }], ['routine.created', 'routine', { name: 'x', challenge: true }], ['routine.archived', 'routine', {}],
  ['routine.checked', 'routine', { date: '2026-09-26' }], ['routine.unchecked', 'routine', { date: '2026-09-26' }],
  ['ritual.step_completed', 'ritual', { ritual: 'morning', step: 'overdue', date: '2026-09-26' }],
  ['calendar_event.created', 'calendar_event', { title: 'x', type: 'event' }], ['calendar_event.deleted', 'calendar_event', {}], ['calendar_event.restored', 'calendar_event', {}],
  ['people.created', 'people', { name: 'x' }], ['people.updated', 'people', { name: 'x' }], ['people.deleted', 'people', {}],
  ['people.interaction_logged', 'people', { summary: 'x' }], ['people.interaction_deleted', 'people', {}],
  ['journal.created', 'journal_entry', { entry_date: '2026-09-26' }], ['journal.updated', 'journal_entry', { entry_date: '2026-09-26' }],
  ['journal.deleted', 'journal_entry', {}], ['journal.restored', 'journal_entry', {}], ['journal.line_added', 'ritual', { date: '2026-09-26' }],
  ['project.created', 'project', { name: 'x', domain_id: null, type: 'standard' }], ['project.renamed', 'project', { name: 'x' }], ['project.reparented', 'project', { domain_id: RANDOM }],
  ['project.archived', 'project', {}], ['project.restored', 'project', {}], ['project.color_changed', 'project', { color: '#fff' }],
  ['project.engagement_changed', 'project', { engagement_model: 'Freelance' }], ['project.target_date_changed', 'project', { target_date: null }],
  ['project.milestone_added', 'project', { title: 'x', weight: 1 }], ['project.milestone_completed', 'project', { milestone_id: 'm', title: 'x' }],
  ['project.milestone_uncompleted', 'project', { milestone_id: 'm', title: 'x' }], ['project.milestone_renamed', 'project', { milestone_id: 'm', title: 'x' }],
  ['project.milestone_removed', 'project', { milestone_id: 'm' }], ['project.checklist_item_added', 'project', { title: 'x', type: 'one-shot' }],
  ['project.checklist_item_completed', 'project', { item_id: 'i', title: 'x' }], ['project.checklist_item_uncompleted', 'project', { item_id: 'i', title: 'x' }],
  ['project.checklist_item_removed', 'project', { item_id: 'i' }], ['project.update_logged', 'project', { note: 'x' }], ['project.work_logged', 'project', { note: '', duration_min: 30 }],
  ['area.created', 'area', { name: 'x' }], ['area.renamed', 'area', { name: 'x' }], ['area.merged', 'area', { into: RANDOM, name: 'x' }], ['area.converted', 'area', { new_project_id: PROJECT, name: 'x' }],
  ['domain.created', 'domain', { name: 'x' }], ['domain.renamed', 'domain', { name: 'x' }], ['domain.merged', 'domain', { into: RANDOM }],
  ['domain.swept', 'domain', { week: '2026-W39' }], ['review.verdict', 'project', { verdict: 'park it', week: '2026-W39' }], ['review.week_closed', 'review', { entity_key: 'x' }],
  ['entity.reviewed', 'project', {}], ['resurfaced.converted', 'inbox_item', {}], ['resurfaced.review_later', 'task', { snoozed_days: 3 }], ['resurfaced.dismissed', 'journal_entry', {}],
  ['book.created', 'book', { title: 'x' }], ['book.progress_updated', 'book', { current_page: 12, status: 'reading' }], ['book.deleted', 'book', {}],
  ['note.created', 'note', { title: 'x' }], ['note.updated', 'note', { title: 'x' }], ['note.deleted', 'note', {}],
  ['quote.created', 'quote', { author: 'x', source: 'y' }], ['quote.updated', 'quote', {}], ['quote.deleted', 'quote', {}], ['commentary.created', 'commentary', { parent_type: 'book' }],
  ['onboarding.completed', 'app_settings', { name: 'Mira', workspaceName: 'Nile Studio', seedAvatar: 'cherry/bud' }],
]

describe('describeActivity — every written event type has real copy', () => {
  it.each(WRITTEN)('%s (%s)', (type, entityType, payload) => {
    const line = describeActivity(entry(type, entityType, RANDOM, payload))
    expect(line.text.length).toBeGreaterThan(0)
    expect(line.text).not.toMatch(/"(task|inbox item|item|journal|routine|someone|event|project|entry)"/)
    expect(line.text).not.toMatch(/^Action:|Inbox action:|^Project:|^Calendar:/)
    expect(line.text).not.toContain(type)
    expect(line.text).not.toContain('_')
    expect(line.details).not.toContain('_')
    expect(line.text).not.toMatch(/error/i)
  })
})

describe('plural', () => {
  it('singular only for exactly one', () => {
    expect(plural(1, 'event')).toBe('1 event')
    expect(plural(0, 'event')).toBe('0 events')
    expect(plural(31, 'event')).toBe('31 events')
  })
})
