import { describe, expect, it } from 'vitest'
import { ARTICLES, SECTIONS, searchArticles } from './articles'

describe('the Guide (Tour and Help Guide 14i)', () => {
  it('eleven articles, 3–6 one-line steps each, every one in a section', () => {
    expect(ARTICLES).toHaveLength(11)
    for (const a of ARTICLES) {
      expect(a.steps.length, a.slug).toBeGreaterThanOrEqual(3)
      expect(a.steps.length, a.slug).toBeLessThanOrEqual(6)
      expect(SECTIONS, a.slug).toContain(a.section)
      for (const s of a.steps) expect(s.text.includes('\n'), s.text).toBe(false)
    }
    expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(11)
  })

  it('search finds the design’s examples, every word, ignoring case and bold marks', () => {
    const slugs = (q: string) => searchArticles(ARTICLES, q).map((a) => a.slug)
    expect(slugs('swipe')).toContain('gestures')
    expect(slugs('IMPORT')).toContain('import')
    expect(slugs('streak')).toEqual(['routines'])
    expect(slugs('undo trash')).toContain('gestures')
    expect(slugs('#project')).toEqual(['capture'])
    expect(slugs('zzz')).toEqual([])
    expect(slugs('  ')).toHaveLength(11)
  })
})
