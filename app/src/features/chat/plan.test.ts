import { describe, expect, it } from 'vitest'
import { CHAT_TOOLS, RUNNABLE, claimsAction, looksLikeAction, relevantCitations, restorePlan, stepToCall, type Refs, type Snapshot } from '../../../../supabase/functions/chat/plan.ts'
import { TOOLS } from '../../../../supabase/functions/mcp/server.ts'

// Queue item 5: the chat's steps become the MCP server's own tool calls.
const CAIRO = 'Africa/Cairo'
const sunNoon = new Date('2026-10-25T09:00:00Z') // Sun 25 Oct 2026, 12:00 Cairo
const refs: Refs = {
  t1: { id: '11111111-1111-4111-8111-111111111111', type: 'task' },
  e1: { id: '22222222-2222-4222-8222-222222222222', type: 'calendar_event' },
  i1: { id: '33333333-3333-4333-8333-333333333333', type: 'inbox_item' },
}

describe('stepToCall', () => {
  it("Kai's three gym sessions become three add_event calls on the right days, in his order", () => {
    const steps = [
      { do: 'add_event', title: 'Gym · HC (Session 1, ID 7)', when: 'Mon 7:00–8:15' },
      { do: 'add_event', title: 'Gym · HQ (Session 2, ID 10)', when: 'Wed 5:45–7:00 PM' },
      { do: 'add_event', title: 'Gym · West (Session 3, ID 18)', when: 'Tue 5:45–7:00 PM' },
    ]
    expect(steps.map((s) => stepToCall(s, refs, sunNoon, CAIRO))).toEqual([
      { tool: 'add_event', args: { title: 'Gym · HC (Session 1, ID 7)', start: '2026-10-26T07:00', end: '2026-10-26T08:15' } },
      { tool: 'add_event', args: { title: 'Gym · HQ (Session 2, ID 10)', start: '2026-10-28T17:45', end: '2026-10-28T19:00' } },
      { tool: 'add_event', args: { title: 'Gym · West (Session 3, ID 18)', start: '2026-10-27T17:45', end: '2026-10-27T19:00' } },
    ])
  })

  it('a task with a range gets its time and its length; a reschedule its new time', () => {
    expect(stepToCall({ do: 'add_task', title: 'Write report', when: 'tomorrow 9–10:30' }, refs, sunNoon, CAIRO)).toEqual({
      tool: 'add_task',
      args: { title: 'Write report', due: '2026-10-26T09:00', duration_min: 90 },
    })
    expect(stepToCall({ do: 'reschedule_task', id: '[t1]', when: 'Fri' }, refs, sunNoon, CAIRO)).toEqual({ tool: 'reschedule_task', args: { id: refs.t1.id, when: '2026-10-30' } })
    expect(stepToCall({ do: 'snooze_task', id: 't1', when: 'next week' }, refs, sunNoon, CAIRO)).toEqual({ tool: 'snooze_task', args: { id: refs.t1.id, until: 'next week' } })
  })

  it('refs name items; Trash goes by type, and an event goes through delete_event', () => {
    expect(stepToCall({ do: 'complete_task', id: 'T1' }, refs, sunNoon, CAIRO)).toEqual({ tool: 'complete_task', args: { id: refs.t1.id } })
    expect(stepToCall({ do: 'move_to_trash', id: 'i1' }, refs, sunNoon, CAIRO)).toEqual({ tool: 'move_to_trash', args: { id: refs.i1.id, type: 'inbox_item' } })
    expect(stepToCall({ do: 'move_to_trash', id: 'e1' }, refs, sunNoon, CAIRO)).toEqual({ tool: 'delete_event', args: { id: refs.e1.id } })
    const uuid = '44444444-4444-4444-8444-444444444444'
    expect(stepToCall({ do: 'edit_event', id: uuid, when: 'Thu 6pm' }, refs, sunNoon, CAIRO)).toEqual({ tool: 'edit_event', args: { id: uuid, start: '2026-10-29T18:00' } })
  })

  it('what it cannot do is said, for the model to fix — never guessed', () => {
    expect(stepToCall({ do: 'save_journal_entry', text: 'x' }, refs, sunNoon, CAIRO)).toHaveProperty('error')
    expect(stepToCall({ do: 'save_person', name: 'x' }, refs, sunNoon, CAIRO)).toHaveProperty('error')
    expect(stepToCall({ do: 'complete_task', id: 't9' }, refs, sunNoon, CAIRO)).toEqual({ error: expect.stringContaining('which item "t9"') })
    expect(stepToCall({ do: 'add_event', title: 'Gym', when: 'whenever' }, refs, sunNoon, CAIRO)).toEqual({ error: expect.stringContaining('couldn\'t read the time "whenever"') })
    expect(stepToCall({ do: 'edit_task', id: 't1', when: 'Fri' }, refs, sunNoon, CAIRO)).toEqual({ error: expect.stringContaining('reschedule_task') })
  })
})

describe('the tools the chat may reach', () => {
  it('every step and every read is a real MCP tool; never a journal or people one', () => {
    const names = new Set(TOOLS.map((t) => t.name))
    for (const t of CHAT_TOOLS) if (t.function.name !== 'propose') expect(names.has(t.function.name)).toBe(true)
    for (const tool of RUNNABLE) {
      expect(names.has(tool)).toBe(true)
      expect(TOOLS.find((t) => t.name === tool)?.scope).toBeUndefined()
    }
    expect([...RUNNABLE].some((t) => /journal|person|people|interaction/.test(t))).toBe(false)
  })

  it('stays small: the free plan allows 8K tokens a minute', () => {
    expect(JSON.stringify(CHAT_TOOLS).length).toBeLessThan(6000) // ≈ 1.6K tokens
  })
})

describe('restorePlan — one Undo for the whole batch', () => {
  const snap = (tasks: Record<string, unknown>[], events: Record<string, unknown>[] = []): Snapshot => ({
    tasks: new Map(tasks.map((r) => [r.id as string, r])),
    calendar_events: new Map(events.map((r) => [r.id as string, r])),
    inbox_items: new Map(),
    notes: new Map(),
  })
  it('every row the batch changed or removed comes back exactly; every row it made goes, blocks before tasks', () => {
    const dentist = { id: 'd', title: 'Dentist', due_at: '2026-10-26T13:00:00Z', project_id: null, status: 'todo' }
    const bank = { id: 'b', title: 'Call the bank', status: 'todo' }
    const old = { id: 'x', title: 'Old', status: 'todo' }
    const before = snap([dentist, bank, old], [{ id: 'blk', task_id: 'd', starts_at: '2026-10-26T13:00:00Z' }])
    const after = snap(
      [{ ...dentist, due_at: '2026-10-30T13:00:00Z', project_id: 'p1' }, { ...bank, status: 'done' }, { id: 'n', title: 'New', status: 'todo' }],
      [{ id: 'blk', task_id: 'd', starts_at: '2026-10-30T13:00:00Z' }, { id: 'blk2', task_id: 'n', starts_at: '2026-10-27T09:00:00Z' }],
    )
    const r = restorePlan(before, after)
    expect(r.put).toEqual([{ table: 'tasks', row: dentist }, { table: 'tasks', row: bank }, { table: 'tasks', row: old }, { table: 'calendar_events', row: { id: 'blk', task_id: 'd', starts_at: '2026-10-26T13:00:00Z' } }])
    expect(r.drop).toEqual([{ table: 'calendar_events', id: 'blk2' }, { table: 'tasks', id: 'n' }])
  })
  it('an untouched batch has nothing to undo', () => {
    const rows = [{ id: 'a', title: 'A' }]
    expect(restorePlan(snap(rows), snap(rows.map((r) => ({ ...r }))))).toEqual({ put: [], drop: [] })
  })
})

describe('honesty and noise', () => {
  it('tells an action from a question', () => {
    expect(looksLikeAction('Schedule three gym sessions: Mon 7:00–8:15 …')).toBe(true)
    expect(looksLikeAction('can you move the dentist to Friday')).toBe(true)
    expect(looksLikeAction('add milk to my list')).toBe(true)
    expect(looksLikeAction("What's on today?")).toBe(false)
    expect(looksLikeAction('How do I move a task to tomorrow?')).toBe(false)
  })

  it('catches the model claiming what only the card may say', () => {
    expect(claimsAction("I've added the three training sessions to your calendar.")).toBe(true)
    expect(claimsAction('I have scheduled your gym sessions.')).toBe(true)
    expect(claimsAction('Your sessions have been added.')).toBe(true)
    expect(claimsAction('You have three things today: the report, gym and a call.')).toBe(false)
    expect(claimsAction('Which day should session 2 be on?')).toBe(false)
  })

  it('reference chips only for what the answer talks about', () => {
    const hits = [
      { title: 'Gym session' },
      { title: 'Ask manager about leave' },
      { title: 'Notebook: Week 43' },
      { title: 'Quarterly report' },
      { title: 'Quarterly report' },
    ]
    expect(relevantCitations('Your quarterly report is due Friday — want me to block time?', hits)).toEqual([{ title: 'Quarterly report' }])
    expect(relevantCitations("Here's the plan for the week.", hits)).toEqual([])
  })
})
