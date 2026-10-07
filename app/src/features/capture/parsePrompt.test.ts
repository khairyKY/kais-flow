import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, nowLine } from '../../../../supabase/functions/parse-capture/prompt.ts'

const ctx = {
  domains: [{ id: 'd-work', name: 'Work' }],
  projects: [{ id: 'p-site', name: 'Website', domain_id: 'd-work' }],
  today: '2026-10-04T07:30:00Z', // Sun 4 Oct, 10:30 in Cairo (UTC+3)
  timezone: 'Africa/Cairo',
}

describe('parse-capture prompt (Kai 2026-10-07: every property extracted, no symbols needed)', () => {
  it('reads times on the user clock and answers in UTC', () => {
    // ICU versions punctuate the date differently ("Sunday, 4 October 2026 at 10:30"); the parts are what matter.
    for (const part of ['Sunday', '4 October 2026', '10:30', '(Africa/Cairo, GMT+03:00)']) expect(nowLine(ctx)).toContain(part)
    expect(nowLine(ctx)).toContain('give due_at in UTC')
  })

  it('lists the places it may file into, by id', () => {
    const p = buildSystemPrompt(ctx)
    expect(p).toContain('- d-work: Work')
    expect(p).toContain('- p-site: Website (domain: d-work)')
  })

  it('infers priority from the wording on the app scale (1 = most urgent), matching ! / !! / !!!', () => {
    const p = buildSystemPrompt(ctx)
    for (const word of ['urgent', 'ASAP', 'critical', 'important', 'whenever']) expect(p).toContain(word)
    expect(p).toContain('1 = most urgent')
    expect(p).toContain('A literal "!!!" means 1, "!!" means 2, "!" means 3.')
  })

  it('pulls out a duration and a description, and keeps those words out of the title', () => {
    const p = buildSystemPrompt(ctx)
    expect(p).toContain('"an hour" = 60')
    expect(p).toContain('"quick 15 min call" = 15')
    expect(p).toContain('description: details beyond the title')
    expect(p).toContain('Leave out the words you turn into the fields below')
  })

  it('asks for exactly the keys the app parses, description and has_time included', () => {
    expect(buildSystemPrompt(ctx)).toContain(
      'exactly these keys: kind, cleaned_text, title, description, domain_id, project_id, due_at, has_time, duration_min, priority, reminder_offset_min, confidence.',
    )
  })

  it('says whether a time was given — only a timed task becomes a calendar block, so no invented times', () => {
    const p = buildSystemPrompt(ctx)
    expect(p).toContain('has_time: true when a clock time was said')
    expect(p).toContain('false for a date alone ("tomorrow"')
    expect(p).toContain('never invent a time')
  })
})
