// A project's status updates (Kai 2026-10-06: "we can't edit/update status logs nor delete them").
// An update is an `activity_log` row (`project.update_logged`, payload {note}), and that log is
// append-only by design (0002 — no update/delete policy; Slipping, streaks and digests read it). So
// an edit or a delete is itself an event on the same project, and the feed is what they resolve to:
//   project.update_edited   {update_id, note}  — the update now reads `note`
//   project.update_deleted  {update_id}        — it leaves the feed
//   project.update_restored {update_id}        — Undo: it's back
// Pure, so it's tested (statusLog.test.ts).

export interface LogRow {
  id: string
  event_type: string
  payload?: Record<string, unknown> | null
  created_at: string
}

export interface StatusUpdate {
  id: string
  note: string
  created_at: string
  edited: boolean
}

export const UPDATE_EVENTS = { logged: 'project.update_logged', edited: 'project.update_edited', deleted: 'project.update_deleted', restored: 'project.update_restored' } as const

/** The feed's updates, newest first: each with its latest note, deleted ones left out. */
export function resolveUpdates(rows: LogRow[]): StatusUpdate[] {
  const updates = new Map<string, StatusUpdate>()
  for (const r of rows) {
    if (r.event_type === UPDATE_EVENTS.logged) updates.set(r.id, { id: r.id, note: String(r.payload?.note ?? ''), created_at: r.created_at, edited: false })
  }
  const gone = new Set<string>()
  // Changes apply in the order they happened (ties keep the log's order).
  const changes = rows.filter((r) => r.event_type !== UPDATE_EVENTS.logged && typeof r.payload?.update_id === 'string')
  changes.sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const c of changes) {
    const id = c.payload!.update_id as string
    const u = updates.get(id)
    if (!u) continue
    if (c.event_type === UPDATE_EVENTS.edited) updates.set(id, { ...u, note: String(c.payload?.note ?? u.note), edited: true })
    else if (c.event_type === UPDATE_EVENTS.deleted) gone.add(id)
    else if (c.event_type === UPDATE_EVENTS.restored) gone.delete(id)
  }
  return [...updates.values()].filter((u) => !gone.has(u.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
}
