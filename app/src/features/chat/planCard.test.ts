import { describe, expect, it } from 'vitest'
import { describe as describeStep, historyText, outcomeHeader, outcomeLine, planHeader, planLines } from './planCard'
import { parseMarkdown, inlineParts } from './markdown'

// Queue item 5: the card shows what WILL happen, from the tools' own dry run; the report what DID.
const gym = [
  { tool: 'add_event', args: { title: 'Gym · HC (Session 1, ID 7)', start: '2026-10-26T07:00', end: '2026-10-26T08:15' } },
  { tool: 'add_event', args: { title: 'Gym · HQ (Session 2, ID 10)', start: '2026-10-28T17:45', end: '2026-10-28T19:00' } },
  { tool: 'add_event', args: { title: 'Gym · West (Session 3, ID 18)', start: '2026-10-27T17:45', end: '2026-10-27T19:00' } },
]
// add_event's answer (mcp/tools.ts eventOut): wall-clock strings on the user's clock.
const previews = [
  { added: { id: 'a', title: 'Gym · HC (Session 1, ID 7)', start: '2026-10-26 07:00', end: '2026-10-26 08:15' }, timezone: 'Africa/Cairo' },
  { added: { id: 'b', title: 'Gym · HQ (Session 2, ID 10)', start: '2026-10-28 17:45', end: '2026-10-28 19:00' }, timezone: 'Africa/Cairo' },
  { added: { id: 'c', title: 'Gym · West (Session 3, ID 18)', start: '2026-10-27 17:45', end: '2026-10-27 19:00' }, timezone: 'Africa/Cairo' },
]

describe('the confirmation card', () => {
  it("Kai's gym plan: one title, a line per session with its own day and time, on his 12-hour clock", () => {
    expect(planHeader(gym, previews)).toBe('Add 3 events')
    expect(planLines(gym, previews, false)).toEqual([
      'Mon 26 Oct · 7:00–8:15 AM · Gym · HC (Session 1, ID 7)',
      'Wed 28 Oct · 5:45–7:00 PM · Gym · HQ (Session 2, ID 10)',
      'Tue 27 Oct · 5:45–7:00 PM · Gym · West (Session 3, ID 18)',
    ])
    expect(planLines(gym.slice(0, 1), previews, true)).toEqual(['Mon 26 Oct · 07:00–08:15 · Gym · HC (Session 1, ID 7)'])
  })

  it('mixed steps carry their verb; tasks read their block or due date; all-day events their days', () => {
    const calls = [
      { tool: 'add_task', args: { title: 'Report' } },
      { tool: 'complete_task', args: { id: 't1' } },
      { tool: 'add_event', args: { title: 'Trip' } },
    ]
    const out = [
      { added: { id: 't', title: 'Report', due: '2026-10-26 09:00' }, calendar_block: '2026-10-26 09:00–10:30' },
      { done: { id: 't1', title: 'Call the bank', due: '2026-10-25 09:00' } },
      { added: { id: 'e', title: 'Trip', start: '2026-10-30', end: '2026-11-01', all_day: true } },
    ]
    expect(planHeader(calls)).toBe('3 changes')
    expect(planLines(calls, out, false)).toEqual(['Add task · Mon 26 Oct · 9:00–10:30 AM · Report', 'Complete · due Sun 25 Oct 9:00 AM · Call the bank', 'Add event · Fri 30 Oct – Sun 1 Nov · all day · Trip'])
    expect(planHeader([{ tool: 'add_event', args: {} }], [{ added: { title: 'Deep work', kind: 'time_block', start: '2026-10-26 09:00', end: '2026-10-26 11:00' } }])).toBe('Add a Time block')
    expect(planHeader([{ tool: 'complete_task', args: {} }, { tool: 'complete_task', args: {} }])).toBe('Complete · 2')
  })

  it('a filed Inbox item is described from one level down', () => {
    expect(describeStep({ filed: { as: 'task', task: { title: 'Renew hosting', due: '2026-10-26' } } }, { tool: 'file_inbox_item', args: {} }, false)).toBe('due Mon 26 Oct · Renew hosting')
  })
})

describe('the honest report', () => {
  it('says what each tool did, and refusals word for word', () => {
    const outcomes = [
      { ...gym[0], ok: true, output: previews[0], undo: { tool: 'delete_event', args: { id: 'a' } } },
      { ...gym[1], ok: false, error: '"end" must be after "start".' },
    ]
    expect(outcomeLine(outcomes[0], false)).toBe('Added event · Mon 26 Oct · 7:00–8:15 AM · Gym · HC (Session 1, ID 7)')
    expect(outcomeLine(outcomes[1], false)).toBe('Couldn\'t add event “Gym · HQ (Session 2, ID 10)”: "end" must be after "start".')
    // an edit's call carries only an id: the card's preview names it
    const refused = { tool: 'reschedule_task', args: { id: 't1', when: '2026-10-30T16:00' }, ok: false, error: 'No task with id t1.' }
    expect(outcomeLine(refused, false, { rescheduled: { title: 'Dentist', due: '2026-10-30 16:00' } })).toBe('Couldn\'t move “Dentist”: No task with id t1.')
    expect(outcomeHeader(outcomes)).toBe('1 of 2 done')
    expect(outcomeHeader([outcomes[0]])).toBe('Done')
    expect(outcomeHeader([outcomes[1]])).toBe('Nothing changed')
  })

  it('what the model reads back never says done unless the app ran it', () => {
    expect(historyText('pending', ['A'])).toBe("Proposed — not done yet, waiting for the user's OK:\n- A")
    expect(historyText('cancelled', ['A'])).toContain('nothing changed')
    expect(historyText('done', ['Added event · A'])).toBe('The user confirmed. What the app did:\n- Added event · A')
    expect(historyText('undone', ['A'])).toContain('undid')
  })
})

describe('markdown in the bubble (no raw pipes)', () => {
  it('reads a table, lists, a heading and paragraphs', () => {
    const text = 'Here you go:\n\n| Day | Time |\n|---|---|\n| Mon | 7:00 |\n| Tue | 5:45 PM |\n\n- one\n- **two**\n\n1. first\n2. second\n\n## Note\nline one\nline two'
    expect(parseMarkdown(text)).toEqual([
      { type: 'p', lines: ['Here you go:'] },
      { type: 'table', head: ['Day', 'Time'], rows: [['Mon', '7:00'], ['Tue', '5:45 PM']] },
      { type: 'ul', items: ['one', '**two**'] },
      { type: 'ol', items: ['first', 'second'] },
      { type: 'h', text: 'Note' },
      { type: 'p', lines: ['line one', 'line two'] },
    ])
  })

  it('a lone pipe is just text; inline marks become parts, never HTML', () => {
    expect(parseMarkdown('A | B')).toEqual([{ type: 'p', lines: ['A | B'] }])
    expect(inlineParts('**Gym** at *7*, `ID 7` <b>x</b> snake_case_name')).toEqual([
      { t: 'b', s: 'Gym' },
      { t: 'text', s: ' at ' },
      { t: 'i', s: '7' },
      { t: 'text', s: ', ' },
      { t: 'code', s: 'ID 7' },
      { t: 'text', s: ' <b>x</b> snake_case_name' },
    ])
  })
})
