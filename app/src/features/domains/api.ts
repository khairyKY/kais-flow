import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import type { Domain } from '../../lib/types'
import { DOMAIN_TABLES, liveDomains, planDomainMerge, type DomainRef } from './organize'

export function useDomains() {
  return useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const { data, error } = await supabase.from('domains').select('*').order('sort_order')
      if (error) throw error
      return data as Domain[]
    },
    // Trashed domains (0053) stay in the cache for Undo; no list shows them (Trash reads its own).
    select: liveDomains,
  })
}

function nowIso() {
  return new Date().toISOString()
}

export function createDomain(name: string, color: string | null = null): Domain {
  const domains = queryClient.getQueryData<Domain[]>(['domains']) ?? []
  const domain: Domain = {
    id: crypto.randomUUID(),
    name,
    color,
    sort_order: domains.length,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('domains', domain)
  logActivity('domain.created', 'domain', domain.id, { name })
  return domain
}

export function renameDomain(domain: Domain, name: string): void {
  writeRow('domains', { ...domain, name })
  logActivity('domain.renamed', 'domain', domain.id, { name })
}

export function recolorDomain(domain: Domain, color: string): void {
  writeRow('domains', { ...domain, color })
  logActivity('domain.recolored', 'domain', domain.id, { color })
}

export function reorderDomains(ordered: Domain[]): void {
  ordered.forEach((d, i) => {
    if (d.sort_order !== i) writeRow('domains', { ...d, sort_order: i })
  })
}

/** Delete = Trash + "Moved to Trash · Undo", no confirm (Flow Audit §4). What's in it is not
 * touched — it keeps living without a domain until Undo / Restore (rules: ./organize.ts). */
export function deleteDomainWithUndo(domain: Domain): void {
  writeRow('domains', { ...domain, deleted_at: nowIso(), updated_at: nowIso() })
  logActivity('domain.deleted', 'domain', domain.id, { name: domain.name })
  toastUndo('Moved to Trash', () => restoreTrashedDomain(domain))
}

export function restoreTrashedDomain(domain: Domain): void {
  writeRow('domains', { ...domain, deleted_at: null, updated_at: nowIso() })
  logActivity('domain.restored', 'domain', domain.id, {})
}

/** Moves every project / area / task / person / routine / note under `fromId` into `intoId`, then
 * trashes the emptied domain; Undo moves them all back and restores it. Reads the caches — the two
 * places that offer Merge (Settings → Organize, the Tasks Organize card) load projects, areas and
 * tasks first. ponytail: a people / routines / notes cache that never loaded this session isn't
 * moved — those rows stay on the trashed domain and read as "no domain" (Undo still restores them);
 * a server-side merge RPC through the outbox is the upgrade if that ever matters. */
export function mergeDomain(fromId: string, intoId: string): void {
  const domains = queryClient.getQueryData<Domain[]>(['domains']) ?? []
  const from = domains.find((d) => d.id === fromId)
  const into = domains.find((d) => d.id === intoId)
  if (!from || !into || fromId === intoId) return
  const rows = Object.fromEntries(DOMAIN_TABLES.map((t) => [t, queryClient.getQueryData<DomainRef[]>([t]) ?? []]))
  const moves = planDomainMerge(fromId, intoId, rows)
  for (const m of moves) writeRow(m.table, m.after)
  const trashed = { ...from, deleted_at: nowIso(), updated_at: nowIso() }
  writeRow('domains', trashed)
  logActivity('domain.merged', 'domain', fromId, { into: intoId, name: from.name, moved: moves.length })
  toastUndo(`Merged into ${into.name}`, () => {
    for (const m of moves) writeRow(m.table, m.before)
    restoreTrashedDomain(from)
  })
}
