// The rules for organizing domains (Kai 2026-10-06), pure so they're tested (organize.test.ts).
//
// Delete: the domain alone goes to Trash (0051 `deleted_at`, "Moved to Trash · Undo"). Nothing in
// it is touched — its projects, areas, tasks, people, routines and notes keep their domain_id, so
// Undo / Trash → Restore puts everything back; meanwhile every list shows only live domains, so
// they read as "no domain". Composting it (30 days) lets the FKs set them to no domain for good.
//
// Merge: everything filed under the domain moves to the one you pick, then the emptied domain goes
// to Trash the same way (one Undo takes the whole merge back).

/** Every table with a `domain_id` (FK → domains, on delete set null), by its query-cache key. */
export const DOMAIN_TABLES = ['projects', 'areas', 'tasks', 'people', 'routines', 'notes'] as const
export type DomainTable = (typeof DOMAIN_TABLES)[number]

export interface DomainRef {
  id: string
  domain_id?: string | null
}

export interface DomainMove<R extends DomainRef = DomainRef> {
  table: DomainTable
  before: R
  after: R
}

/** The rows a merge of `fromId` into `intoId` rewrites — every row under `fromId`, trashed ones
 * included (so restoring one later lands it in the merged domain). Merging into itself: nothing. */
export function planDomainMerge<R extends DomainRef>(fromId: string, intoId: string, rows: Partial<Record<DomainTable, R[]>>): DomainMove<R>[] {
  if (fromId === intoId) return []
  return DOMAIN_TABLES.flatMap((table) =>
    (rows[table] ?? []).filter((r) => r.domain_id === fromId).map((before) => ({ table, before, after: { ...before, domain_id: intoId } })),
  )
}

/** Only live domains are listed anywhere (pickers, chips, the Organize card, parse-capture). */
export function liveDomains<D extends { deleted_at?: string | null }>(domains: D[]): D[] {
  return domains.filter((d) => !d.deleted_at)
}

/** The swatches a domain can wear — the project page's palette, named for the menu. */
export const DOMAIN_COLORS: { label: string; value: string }[] = [
  { label: 'Terracotta', value: 'var(--acc-terra)' },
  { label: 'Moss', value: 'var(--acc-moss)' },
  { label: 'Lavender', value: 'var(--acc-lavender-deep)' },
  { label: 'Gold', value: 'var(--acc-gold)' },
  { label: 'Hydrangea', value: 'var(--acc-hydrangea)' },
  { label: 'Sage', value: 'var(--acc-sage)' },
  { label: 'Plum', value: '#7a4a52' },
  { label: 'Stone', value: '#8b8471' },
]
