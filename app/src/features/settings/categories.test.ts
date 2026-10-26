import { describe, expect, it } from 'vitest'
import { anchorTarget, CATS, GROUPS, inSettings, matches } from './categories'

describe('settings categories', () => {
  it('the groups list every category once', () => {
    expect(GROUPS.flat().sort()).toEqual(CATS.map((c) => c.id).sort())
  })

  it('old anchors land on their new category', () => {
    expect(anchorTarget('#settings-Sound')).toBe('notify')
    expect(anchorTarget('#settings-Advanced')).toBe('integrations/capture-key')
    expect(anchorTarget('#settings-Legal')).toBe('privacy')
    expect(anchorTarget('#settings-Nope')).toBeNull()
    expect(anchorTarget('#elsewhere')).toBeNull()
  })

  it('the one-page Settings paths (not the importer)', () => {
    expect(['/settings', '/settings/notify', '/settings/integrations/google'].every(inSettings)).toBe(true)
    expect(['/settings/import', '/settingsx', '/today'].some(inSettings)).toBe(false)
  })

  it('search matches word starts across label, help and keywords', () => {
    expect(matches('dark', 'Theme', 'Auto follows your system', 'dark light night mode')).toBe(true)
    expect(matches('quiet hours', 'Quiet hours')).toBe(true)
    expect(matches('ours', 'Quiet hours')).toBe(false)
    expect(matches('AI', 'File captures for me', undefined, 'AI')).toBe(true)
    expect(matches('calendar & time', 'Calendar and time')).toBe(true)
    expect(matches('   ', 'Theme')).toBe(false)
    expect(matches('déjà', 'Deja vu')).toBe(true)
  })
})
