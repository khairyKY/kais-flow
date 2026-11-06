import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeRow = vi.hoisted(() => vi.fn())
vi.mock('../../lib/outbox', () => ({ writeRow }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/AuthProvider', () => ({ signOut: vi.fn(), useAuth: vi.fn() }))

const { queryClient } = await import('../../lib/queryClient')
const { agreeToCurrent, dismissNote } = await import('./api')
const { CURRENT, LEGAL_NOTES, noticeDoc } = await import('../../../../supabase/functions/_shared/legal.ts')

beforeEach(() => {
  writeRow.mockClear()
  queryClient.clear()
})

describe('agreeToCurrent', () => {
  it('writes one row per document still owed, at the current version', () => {
    queryClient.setQueryData(['consents'], [])
    agreeToCurrent(['terms', 'privacy'])
    expect(writeRow.mock.calls.map(([, r]) => [r.document, r.version])).toEqual([['terms', CURRENT.terms], ['privacy', CURRENT.privacy]])
  })

  it('writes nothing for what another device already agreed to (a second tap, an open card)', () => {
    queryClient.setQueryData(['consents'], [{ id: 'a', document: 'terms', version: CURRENT.terms, accepted_at: '' }])
    agreeToCurrent(['terms', 'privacy'])
    expect(writeRow.mock.calls.map(([, r]) => r.document)).toEqual(['privacy'])
    writeRow.mockClear()
    queryClient.setQueryData(['consents'], [{ id: 'a', document: 'terms', version: CURRENT.terms, accepted_at: '' }, { id: 'b', document: 'privacy', version: CURRENT.privacy, accepted_at: '' }])
    agreeToCurrent(['terms', 'privacy'])
    expect(writeRow).not.toHaveBeenCalled()
  })
})

describe('dismissNote', () => {
  it('is one consents row named for the note', () => {
    dismissNote(LEGAL_NOTES[0])
    expect(writeRow).toHaveBeenCalledTimes(1)
    expect(writeRow.mock.calls[0][0]).toBe('consents')
    expect(writeRow.mock.calls[0][1]).toMatchObject({ document: noticeDoc(LEGAL_NOTES[0]), version: LEGAL_NOTES[0].id })
  })
})
