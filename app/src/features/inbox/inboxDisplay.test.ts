import { describe, expect, it } from 'vitest'
import { ageLabel, backLabel, captureLink, capturedLabel, cardShape, confidenceWord, dayWord, defaultDraft, dismissedAgo, draftText, dueLabel, dueShort, githubHeading, githubUrl, inboxSummary, isToday, mentionedPerson, snoozedOf, suggestedPlace, suggestedTitle } from './inboxDisplay'
import type { Domain, Project } from '../../lib/types'
import { linkLabel, taskLink } from '../../lib/links'

describe('isToday', () => {
  it('matches the current calendar day', () => {
    expect(isToday(new Date().toISOString())).toBe(true)
  })
  it('rejects a day in the past', () => {
    expect(isToday(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe(false)
  })
})

describe('dismissedAgo', () => {
  it('renders recent dismissals in hours', () => {
    expect(dismissedAgo(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe('2h ago')
  })
  it('rounds up to at least 1h so "just now" never reads as 0h ago', () => {
    expect(dismissedAgo(new Date().toISOString())).toBe('1h ago')
  })
  it('switches to a weekday name after 24h', () => {
    const eightDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(dismissedAgo(eightDaysAgo)).not.toMatch(/ago/)
  })
})

// Punch 7 — the filing toast's date half. Cairo is UTC+2/+3, so a fixed `now` is passed in
// rather than trusting the runner's clock.
describe('dayWord', () => {
  const now = new Date('2026-08-01T09:00:00Z') // 11:00 Cairo
  it('names the same Cairo day "Today"', () => {
    expect(dayWord('2026-08-01T20:00:00Z', now)).toBe('Today')
  })
  it('names the next Cairo day "Tomorrow"', () => {
    expect(dayWord('2026-08-02T06:00:00Z', now)).toBe('Tomorrow')
  })
  it('spells out anything further off', () => {
    expect(dayWord('2026-08-05T06:00:00Z', now)).toBe('Wed, Aug 5')
  })
  it('reads late-evening UTC as the Cairo day it actually falls on', () => {
    // 23:30 UTC on the 1st is 01:30 Cairo on the 2nd — "Tomorrow", not "Today".
    expect(dayWord('2026-08-01T23:30:00Z', now)).toBe('Tomorrow')
  })
})

describe('githubUrl', () => {
  it('passes only github.com pages through as links', () => {
    expect(githubUrl('https://github.com/acme/app/issues/7')).toBe('https://github.com/acme/app/issues/7')
    expect(githubUrl('https://github.com.evil.example/x')).toBeNull()
    expect(githubUrl('javascript:alert(1)')).toBeNull()
    expect(githubUrl(undefined)).toBeNull()
    expect(githubUrl(42)).toBeNull()
  })
})

// ── Inbox t3 (Inbox.dc.html 3a/3b). Cairo is UTC+3 in October 2026 until the 29th. ──
const NOW = new Date('2026-10-12T07:00:00Z') // Mon 12 Oct, 10:00 Cairo
const cap = (raw_text: string, ai_parse: Record<string, unknown> | null = null) => ({ raw_text, ai_parse })

describe('inboxSummary', () => {
  const at = (iso: string) => ({ created_at: iso })
  it('reads "3 to sort · 2 from GitHub · oldest is 1 day old" (3a)', () => {
    const three = [at('2026-10-12T06:00:00Z'), at('2026-10-11T18:00:00Z'), at('2026-10-12T05:00:00Z')]
    expect(inboxSummary(three, 2, NOW)).toBe('3 to sort · 2 from GitHub · oldest is 1 day old')
  })
  it("counts the oldest in calendar days on the user's clock, not 24h blocks", () => {
    // 21:30 UTC on the 11th is 00:30 Cairo on the 12th — today, though it is 9.5 hours old.
    expect(inboxSummary([at('2026-10-11T21:30:00Z')], 0, NOW)).toBe('1 to sort · oldest is from today')
    expect(inboxSummary([at('2026-10-09T08:00:00Z')], 0, NOW)).toBe('1 to sort · oldest is 3 days old')
  })
  it('the phone drops the oldest (3b); GitHub alone reads "Nothing to sort"', () => {
    expect(inboxSummary([at('2026-10-09T08:00:00Z')], 2, NOW, false)).toBe('1 to sort · 2 from GitHub')
    expect(inboxSummary([], 2, NOW)).toBe('Nothing to sort · 2 from GitHub')
  })
  it('is empty at Inbox zero (the zero card says it)', () => {
    expect(inboxSummary([], 0, NOW)).toBe('')
  })
})

describe('confidenceWord', () => {
  it('words, not percentages: 87% is "high confidence" (3a)', () => {
    expect(confidenceWord(0.87)).toBe('high confidence')
    expect(confidenceWord(0.85)).toBe('high confidence')
  })
  it('a read above the auto-file line but not sure of itself is "medium"; below it, "low"', () => {
    expect(confidenceWord(0.8)).toBe('medium confidence')
    expect(confidenceWord(0.75)).toBe('medium confidence')
    expect(confidenceWord(0.44)).toBe('low confidence')
  })
  it('no read, no word', () => {
    expect(confidenceWord(null)).toBeNull()
    expect(confidenceWord(undefined)).toBeNull()
  })
})

describe('cardShape + suggestedTitle', () => {
  it("a confident read with a tidier title is a suggestion, filed under the AI's short title", () => {
    const c = cap('Call Omar re: pricing Saturday 3pm', { kind: 'task', title: 'Call Omar about pricing', cleaned_text: 'Call Omar about pricing Saturday 3pm', confidence: 0.87 })
    expect(cardShape(c)).toBe('suggested')
    expect(suggestedTitle(c)).toBe('Call Omar about pricing')
  })
  it('a confident read that only places it is still a suggestion', () => {
    expect(cardShape(cap('renew hosting', { kind: 'task', title: 'renew hosting', confidence: 0.9, project_id: 'p1' }))).toBe('suggested')
  })
  it('below the auto-file line the card asks (3a card 2)', () => {
    expect(cardShape(cap('that thing salma said', { kind: 'note', title: 'Salma balcony plants', confidence: 0.44 }))).toBe('unsure')
  })
  it('nothing to decide but File is the compact row (3a card 3): no read, or a read that only confirms the words', () => {
    expect(cardShape(cap('renew hosting before the 15th'))).toBe('plain')
    expect(cardShape(cap('renew hosting before the 15th', { kind: 'task', title: 'renew hosting before the 15th', confidence: 0.9, due_at: '2026-10-14T06:00:00Z' }))).toBe('plain')
  })
  it('falls back to the cleaned text, then the words as captured', () => {
    expect(suggestedTitle(cap('um buy milk', { cleaned_text: 'Buy milk', confidence: 0.9 }))).toBe('Buy milk')
    expect(suggestedTitle(cap('buy milk', { title: '  ', confidence: 0.9 }))).toBe('buy milk')
  })
})

describe('mentionedPerson', () => {
  const people = [{ name: 'Salma Hassan' }, { name: 'Omar' }, { name: 'Al' }, { name: 'سلمى' }]
  it('finds a first name in any case, as a whole word', () => {
    expect(mentionedPerson('that thing salma said about the balcony plants', people)?.name).toBe('Salma Hassan')
    expect(mentionedPerson('Call OMAR re: pricing', people)?.name).toBe('Omar')
  })
  it('never matches inside another word', () => {
    expect(mentionedPerson('buy almonds and salmon', people)).toBeUndefined()
  })
  it('reads Arabic names too', () => {
    expect(mentionedPerson('اتصل بـ سلمى غدا', people)?.name).toBe('سلمى')
  })
})

describe('suggestedPlace + defaultDraft', () => {
  const projects = [
    { id: 'p1', name: 'Forecasting App', domain_id: 'd1', status: 'active', type: 'standard' },
    { id: 'p2', name: 'Old', domain_id: null, status: 'archived', type: 'standard' },
  ] as Project[]
  const domains = [{ id: 'd1', name: 'Freelance', color: null, sort_order: 0, created_at: '', updated_at: '' }] as Domain[]
  it("names the AI's project from the user's own list", () => {
    expect(suggestedPlace({ project_id: 'p1' }, projects, domains)).toEqual({ kind: 'project', id: 'p1', domainId: 'd1', name: 'Forecasting App' })
  })
  it('an archived or made-up project falls back to its domain, then to no place', () => {
    expect(suggestedPlace({ project_id: 'p2', domain_id: 'd1' }, projects, domains)).toEqual({ kind: 'domain', id: 'd1', name: 'Freelance' })
    expect(suggestedPlace({ project_id: 'nope' }, projects, domains).kind).toBe('none')
  })
  it('a note suggests the journal; a day-only due stays day-only', () => {
    const d = defaultDraft(cap('idea: paper mode', { kind: 'note', confidence: 0.9, due_at: '2026-10-14T06:00:00Z', has_time: false }), projects, domains)
    expect(d).toMatchObject({ to: 'journal', dueAt: '2026-10-14T06:00:00Z', timed: false, text: null })
  })
  it('a task files its short title; a note keeps the whole capture; an edit wins', () => {
    const c = cap('Call Omar re: pricing Saturday 3pm', { kind: 'task', title: 'Call Omar about pricing', confidence: 0.9 })
    const d = defaultDraft(c, projects, domains)
    expect(draftText(c, d)).toBe('Call Omar about pricing')
    expect(draftText(c, { ...d, to: 'journal' })).toBe('Call Omar re: pricing Saturday 3pm')
    expect(draftText(c, { ...d, text: 'Call Omar' })).toBe('Call Omar')
  })
})

describe('capturedLabel / dueLabel / dueShort / ageLabel', () => {
  it('captured: a time today, "yesterday", a weekday this week, else the date (user\'s clock)', () => {
    expect(capturedLabel('2026-10-12T06:14:00Z', NOW)).toBe('09:14')
    expect(capturedLabel('2026-10-11T18:14:00Z', NOW)).toBe('yesterday')
    expect(capturedLabel('2026-10-08T18:14:00Z', NOW)).toBe('Thu 21:14')
    expect(capturedLabel('2026-10-07T09:00:00Z', NOW, false)).toBe('Wed')
    expect(capturedLabel('2026-07-09T09:00:00Z', NOW)).toBe('9 Jul')
  })
  it('the date field: "Sat 17 Oct · 15:00", "Sat 15:00" on a phone, named days, day-only without a time', () => {
    expect(dueLabel('2026-10-17T12:00:00Z', true, NOW)).toBe('Sat 17 Oct · 15:00')
    expect(dueLabel('2026-10-17T12:00:00Z', true, NOW, true)).toBe('Sat 15:00')
    expect(dueLabel('2026-10-13T06:00:00Z', true, NOW)).toBe('Tomorrow · 09:00')
    expect(dueLabel('2026-10-12T12:00:00Z', false, NOW)).toBe('Today')
  })
  it('the compact row\'s "due Wed 14"', () => {
    expect(dueShort('2026-10-14T06:00:00Z', NOW)).toBe('Wed 14')
    expect(dueShort('2026-10-13T06:00:00Z', NOW)).toBe('tomorrow')
    expect(dueShort('2026-11-03T06:00:00Z', NOW)).toBe('Tue 3 Nov')
  })
  it('GitHub age never goes negative on clock skew', () => {
    expect(ageLabel('2026-10-12T07:01:00Z', NOW)).toBe('today')
  })
  it('GitHub age: "3 days" / "3d", "1 day", "today"', () => {
    expect(ageLabel('2026-10-09T06:00:00Z', NOW)).toBe('3 days')
    expect(ageLabel('2026-10-09T06:00:00Z', NOW, true)).toBe('3d')
    expect(ageLabel('2026-10-11T06:00:00Z', NOW)).toBe('1 day')
    expect(ageLabel('2026-10-12T06:00:00Z', NOW)).toBe('today')
  })
})

describe('githubHeading', () => {
  it('names the repo when every issue shares it', () => {
    expect(githubHeading([{ payload: { repo: 'Shaheen/website' } }, { payload: { repo: 'Shaheen/website' } }])).toBe('From GitHub · Shaheen/website')
    expect(githubHeading([{ payload: { repo: 'a/b' } }, { payload: { repo: 'c/d' } }])).toBe('From GitHub')
    expect(githubHeading([{ payload: null }])).toBe('From GitHub')
  })
})

// Snoozed captures were in neither Waiting nor Dismissed (product audit, Inbox row): the Snoozed view.
describe('snoozedOf / backLabel', () => {
  const now = new Date('2026-10-12T07:00:00Z') // 10:00 Cairo
  const row = (id: string, over: object) => ({ id, status: 'pending' as const, snoozed_until: null as string | null, deleted_at: null as string | null, ...over })
  it('keeps pending captures snoozed past now, soonest back first', () => {
    const items = [
      row('later', { snoozed_until: '2026-10-19T06:00:00Z' }),
      row('soon', { snoozed_until: '2026-10-13T06:00:00Z' }),
      row('waking', { snoozed_until: '2026-10-12T06:00:00Z' }), // already back in Waiting
      row('waiting', {}),
      row('dismissed', { status: 'dismissed', snoozed_until: '2026-10-20T06:00:00Z' }),
      row('trashed', { snoozed_until: '2026-10-20T06:00:00Z', deleted_at: '2026-10-11T06:00:00Z' }),
    ]
    expect(snoozedOf(items, now).map((i) => i.id)).toEqual(['soon', 'later'])
  })
  it("says when it comes back, on the user's clock", () => {
    expect(backLabel('2026-10-13T06:00:00Z', now)).toBe('back Tomorrow · 09:00')
    expect(backLabel('2026-10-19T06:00:00Z', now)).toBe('back Mon 19 Oct · 09:00')
  })
})

describe('captureLink (P7e A19)', () => {
  it('the endpoint url, else the first link in the words; a GitHub issue keeps its own', () => {
    expect(captureLink({ kind: 'text', raw_text: 'look https://example.com/a, later', payload: null })).toBe('https://example.com/a')
    expect(captureLink({ kind: 'text', raw_text: 'x', payload: { url: 'https://example.org/b' } })).toBe('https://example.org/b')
    expect(captureLink({ kind: 'github_issue', raw_text: 'https://github.com/a/b/issues/1', payload: null })).toBeNull()
    expect(captureLink({ kind: 'text', raw_text: 'no link', payload: { url: 'javascript:void(0)' } })).toBeNull()
  })
  it('reads as its site, a GitHub issue as "View issue"; a task link is http(s) only', () => {
    expect(linkLabel('https://www.example.com/a')).toBe('example.com')
    expect(linkLabel('https://github.com/acme/app/issues/7')).toBe('View issue')
    expect(taskLink({ external_ref: { source: 'link', id: '1', url: 'https://example.com' } })).toBe('https://example.com')
    expect(taskLink({ external_ref: { source: 'link', id: '1', url: 'javascript:x' } })).toBeNull()
    expect(taskLink({ external_ref: null })).toBeNull()
  })
})
