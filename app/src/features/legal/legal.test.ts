import { describe, expect, it } from 'vitest'
import PRIVACY_HTML from '../../../public/privacy.html?raw'
import { CURRENT, LEGAL_SUMMARY, PRIVACY_VERSION, TERMS_VERSION, outdated } from '../../../../supabase/functions/_shared/legal.ts'

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
