import { describe, expect, it } from 'vitest'
import { matchTicks, similarity, words, type TickLine } from './ticks'

// 11l's page (Paper Capture.dc.html): Saturday's Notebook page, photographed at night.
const TASKS = [
  { id: 'hw', title: 'GCI homework 1 — NumPy' },
  { id: 'survey', title: 'Do GCI lecture 2’s survey' },
  { id: 'skim', title: 'Skim OS lectures 1 + 2' },
  { id: 'join', title: 'Join all the Google Classrooms' },
  { id: 'shower', title: 'Shower + breakfast' },
  { id: 'omar', title: 'Reply to Omar' },
  { id: 'milk', title: 'Buy milk' },
  { id: 'plants', title: 'Water the plants' },
]
let i = 0
const line = (text: string, checked: boolean | null): TickLine => ({ key: `0:${i++}`, text, checked })
const PAGE = [
  line('Sat 3 Oct — woke 7 · slept 6', null),
  line('TASKS', null),
  line('✶ GCI homework 1', true),
  line('GCI lecture 2 survey', true),
  line('Skim OS lectures 1 + 2', false),
  line('Join the Google Classrooms', false),
  line('Shower + breakfast', true),
  line('Reply to Omer', true), // misspelt
  line('Buy milk', true),
  line('Water the plants', false),
  line('→ call Omar back re Thursday', null),
  line('what happened: met Omar at the café', null),
]
const PRINTED = ['SAT · 3 OCT   woke __ · slept __', 'TASKS', 'HABITS', '☐ Qur’an   ☐ rep   ☐ move   ☐ read', 'NOTES', '+  what happened', '−  what got in the way']

describe('ticks: matching a photo of the page back to its tasks', () => {
  const r = matchTicks(PAGE, TASKS, PRINTED)

  it('the five ticked lines → five tasks, in page order, abbreviations and a misspelling included', () => {
    expect(r.ticked.map((m) => m.task.id)).toEqual(['hw', 'survey', 'shower', 'omar', 'milk'])
  })

  it('the unticked ones are matched but left as they are', () => {
    expect(r.open.map((m) => m.task.id)).toEqual(['skim', 'join', 'plants'])
  })

  it('new scribbles are what remains — not the page’s own print', () => {
    expect(r.fresh.map((l) => l.text)).toEqual(['→ call Omar back re Thursday', 'what happened: met Omar at the café'])
  })

  it('one line per task: two lines that both look like "Buy milk" tick it once', () => {
    const two = matchTicks([line('Buy milk', true), line('buy milk!', true)], TASKS)
    expect(two.ticked).toHaveLength(1)
    expect(two.fresh).toHaveLength(1)
  })

  it('an unrelated line matches nothing; a model that reports no boxes ticks nothing', () => {
    expect(similarity('Buy bread', 'Buy milk')).toBeLessThan(0.6)
    const none = matchTicks(PAGE.map((l) => ({ ...l, checked: null })), TASKS, PRINTED)
    expect(none.ticked).toEqual([])
    expect(none.open).toHaveLength(8)
  })

  it('words: glyphs, punctuation and possessives fold away; Arabic keeps its letters', () => {
    expect(words('☑ ✶ Do GCI lecture 2’s survey!')).toEqual(['do', 'gci', 'lecture', '2', 'survey'])
    expect(words('اقرأ  الكتاب')).toEqual(['اقرأ', 'الكتاب'])
  })
})
