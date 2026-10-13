// Journal photos (0060: `journal/<uid>/<entry>/<photo>.jpg`) outlived their entry: compost_expired()
// hard-deletes an entry 30 days after Trash (Trash's "Delete forever" at once), and a SQL delete on
// storage.objects would leave the file behind. capture-image's hourly sweep removes them through the
// Storage API. This is its pure half — which listed objects may go — so the app's vitest holds it to
// the rules (app/src/features/journal/journalSweep.test.ts):
//   - only a photo whose entry row is GONE. A row in Trash is still a row: its photos stay until the
//     row itself is deleted, whatever its deleted_at says.
//   - only `<uid>/<entry>/<file>` with ids for both folders, and the row is looked up for that uid.
//   - only a photo uploaded more than 30 days ago. A composted entry's photos are always older (they
//     went up before the entry went to Trash, 30+ days before compost), so this never delays compost;
//     it shields a photo whose brand-new entry row is still on its way through a device's outbox.
// No Deno APIs here (the read.ts pattern).

/** A Storage list item: a file has an id and a created_at; a folder has neither. */
export interface Listed {
  name: string
  id: string | null
  created_at: string | null
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const PHOTO_GRACE_MS = 30 * 86_400_000

/** The folders in a listing named by an id: users at the bucket root, entries under a user. */
export function idFolders(items: Listed[]): string[] {
  return items.filter((i) => i.id === null && ID.test(i.name)).map((i) => i.name)
}

/** The entry folders under `uid` with no journal row of that user's. `rows` = every row the database
 * holds for those ids, trashed or not (the query must not filter on deleted_at). */
export function goneEntries(uid: string, entries: string[], rows: { id: string; user_id: string }[]): string[] {
  if (!ID.test(uid)) return []
  const kept = new Set(rows.filter((r) => r.user_id === uid).map((r) => r.id))
  return entries.filter((e) => ID.test(e) && !kept.has(e))
}

/** The files to delete in a gone entry's folder, as object paths: files only, past the grace. */
export function photosToSweep(uid: string, entry: string, items: Listed[], now: number): string[] {
  return items
    .filter((i) => i.id !== null && i.created_at !== null && !i.name.includes('/') && Date.parse(i.created_at) < now - PHOTO_GRACE_MS)
    .map((i) => `${uid}/${entry}/${i.name}`)
}
