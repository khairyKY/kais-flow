import { describe, expect, it } from 'vitest'
import PRIVACY_HTML from '../../../public/privacy.html?raw'
import { CURRENT, LEGAL_NOTES, LEGAL_SUMMARY, PRIVACY_VERSION, TERMS_VERSION, noticeDoc, outdated, unseenNotes } from '../../../../supabase/functions/_shared/legal.ts'

describe('legal versions (docs/LEGAL.md)', () => {
  it('asks for both when there is no agreement at all (accounts from before 0083)', () => {
    expect(outdated([])).toEqual(['terms', 'privacy'])
  })

  it('asks only for what is older than the current version', () => {
    expect(outdated([{ document: 'terms', version: '2026-01-01' }, { document: 'privacy', version: PRIVACY_VERSION }])).toEqual(['terms'])
    expect(outdated([{ document: 'terms', version: TERMS_VERSION }, { document: 'privacy', version: PRIVACY_VERSION }])).toEqual([])
  })

  it('an old agreement next to a current one still counts as agreed', () => {
    const rows = [{ document: 'terms', version: '2020-01-01' }, { document: 'terms', version: TERMS_VERSION }, { document: 'privacy', version: '2999-01-01' }]
    expect(outdated(rows)).toEqual([])
  })

  it('versions are days, so they compare as text; the notice has 2–4 lines', () => {
    for (const v of Object.values(CURRENT)) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(LEGAL_SUMMARY.length).toBeGreaterThanOrEqual(2)
    expect(LEGAL_SUMMARY.length).toBeLessThanOrEqual(4)
  })

  it("the app's /privacy copy was regenerated for this version (site/tools/app-privacy.mjs)", () => {
    const [y, m, d] = PRIVACY_VERSION.split('-').map(Number)
    const day = `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`
    expect(PRIVACY_HTML).toContain(`updated ${day}`)
  })
})

describe('informational updates (legal.ts LEGAL_NOTES, 0093)', () => {
  const note = LEGAL_NOTES[0]
  const before = '2026-01-01T00:00:00Z'

  it('are days, one plain line, and never change what has to be agreed to', () => {
    for (const n of LEGAL_NOTES) {
      expect(n.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(n.line.length).toBeGreaterThan(10)
    }
    // Agreeing is still judged on the two versions alone: a dismissed note is not an agreement.
    expect(outdated([{ document: noticeDoc(note), version: note.id }])).toEqual(['terms', 'privacy'])
  })

  it('show once per account: an older account sees it until its dismissal row exists', () => {
    expect(unseenNotes([], before)).toEqual(LEGAL_NOTES)
    expect(unseenNotes([{ document: noticeDoc(note), version: note.id }], before)).toEqual([])
  })

  it('a dismissal is per note and per document', () => {
    expect(unseenNotes([{ document: 'terms_notice', version: note.id }], before)).toEqual(LEGAL_NOTES)
    expect(unseenNotes([{ document: noticeDoc(note), version: '2000-01-01' }], before)).toEqual(LEGAL_NOTES)
  })

  it('an account made on or after the change never sees it', () => {
    expect(unseenNotes([], `${note.id}T08:00:00Z`)).toEqual([])
    expect(unseenNotes([], '2999-01-01T00:00:00Z')).toEqual([])
  })
})

