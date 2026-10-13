import { describe, expect, it } from 'vitest'
import { goneEntries, idFolders, photosToSweep, PHOTO_GRACE_MS, type Listed } from '../../../../supabase/functions/capture-image/journal.ts'

// capture-image's journal sweep, its pure half (Deno isn't on this machine; the app's vitest runs it).
// The one rule that matters: a photo goes only when its entry row is gone for good.

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const LIVE = '20000000-0000-4000-8000-000000000001'
const TRASHED = '20000000-0000-4000-8000-000000000002'
const COMPOSTED = '20000000-0000-4000-8000-000000000003'
const NOW = Date.parse('2026-10-13T08:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const folder = (name: string): Listed => ({ name, id: null, created_at: null })
const photo = (name: string, uploadedDaysAgo: number): Listed => ({ name, id: `obj-${name}`, created_at: ago(uploadedDaysAgo) })

/** The sweep end to end for one user, as capture-image runs it — minus the IO. */
function sweep(uid: string, listing: Record<string, Listed[]>, rows: { id: string; user_id: string; deleted_at: string | null }[]) {
  const entries = idFolders(listing[uid] ?? [])
  return goneEntries(uid, entries, rows).flatMap((e) => photosToSweep(uid, e, listing[`${uid}/${e}`] ?? [], NOW))
}

describe('journal photo sweep', () => {
  const listing = {
    [A]: [folder(LIVE), folder(TRASHED), folder(COMPOSTED)],
    [`${A}/${LIVE}`]: [photo('p1.jpg', 90)],
    [`${A}/${TRASHED}`]: [photo('p2.jpg', 90)],
    [`${A}/${COMPOSTED}`]: [photo('p3.jpg', 90), photo('p4.jpg', 45)],
  }

  it('entry in Trash < 30 days → photo kept; live entry → kept; composted entry → its photos go', () => {
    const rows = [
      { id: LIVE, user_id: A, deleted_at: null },
      { id: TRASHED, user_id: A, deleted_at: ago(10) },
    ]
    expect(sweep(A, listing, rows)).toEqual([`${A}/${COMPOSTED}/p3.jpg`, `${A}/${COMPOSTED}/p4.jpg`])
  })

  it('an entry in Trash past 30 days that compost has not reached yet still keeps its photos', () => {
    const rows = [
      { id: LIVE, user_id: A, deleted_at: null },
      { id: TRASHED, user_id: A, deleted_at: ago(45) },
      { id: COMPOSTED, user_id: A, deleted_at: ago(31) },
    ]
    expect(sweep(A, listing, rows)).toEqual([])
  })

  it('a photo uploaded under 30 days ago stays even with no row (its entry may still be in an outbox)', () => {
    const fresh = { [A]: [folder(COMPOSTED)], [`${A}/${COMPOSTED}`]: [photo('new.jpg', 2), photo('edge.jpg', 29.9)] }
    expect(sweep(A, fresh, [])).toEqual([])
    expect(photosToSweep(A, COMPOSTED, [{ name: 'x.jpg', id: 'o', created_at: new Date(NOW - PHOTO_GRACE_MS - 1).toISOString() }], NOW)).toEqual([`${A}/${COMPOSTED}/x.jpg`])
    expect(photosToSweep(A, COMPOSTED, [{ name: 'x.jpg', id: 'o', created_at: new Date(NOW - PHOTO_GRACE_MS).toISOString() }], NOW)).toEqual([])
  })

  it('scoped by user: a row counts only for its own user, and one user never reaches into another folder', () => {
    // B has the same entry id in their own folder but no row of their own; A's row doesn't keep it.
    const both = { [B]: [folder(LIVE)], [`${B}/${LIVE}`]: [photo('b.jpg', 90)] }
    expect(sweep(B, both, [{ id: LIVE, user_id: A, deleted_at: null }])).toEqual([`${B}/${LIVE}/b.jpg`])
    expect(sweep(B, both, [{ id: LIVE, user_id: B, deleted_at: null }])).toEqual([])
    // Every path starts with the user's own folder.
    expect(sweep(A, listing, []).every((p) => p.startsWith(`${A}/`))).toBe(true)
  })

  it('only id-named folders and plain files: nothing odd in the bucket is touched', () => {
    expect(idFolders([folder(A), folder('avatars'), folder('..'), { name: B, id: 'obj', created_at: ago(90) }])).toEqual([A])
    expect(goneEntries('not-a-user', [LIVE], [])).toEqual([])
    expect(goneEntries(A, ['notes', LIVE], [])).toEqual([LIVE])
    // An uppercase id could never match the lowercase row Postgres returns — skipped, not "gone".
    expect(idFolders([folder(A.toUpperCase())])).toEqual([])
    expect(goneEntries(A, ['ABCDEF00-0000-4000-8000-00000000000C'], [])).toEqual([])
    expect(goneEntries(A.toUpperCase(), [LIVE], [])).toEqual([])
    // A sub-folder and an object with no timestamp inside a gone entry are left alone.
    expect(photosToSweep(A, COMPOSTED, [folder('sub'), { name: 'odd.jpg', id: 'o', created_at: null }, { name: 'bad.jpg', id: 'o', created_at: 'not a date' }], NOW)).toEqual([])
  })
})
