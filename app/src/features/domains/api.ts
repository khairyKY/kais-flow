import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import type { Domain, Project, Task } from '../../lib/types'

export function useDomains() {
  return useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const { data, error } = await supabase.from('domains').select('*').order('sort_order')
      if (error) throw error
      return data as Domain[]
    },
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
}

export function reorderDomains(ordered: Domain[]): void {
  ordered.forEach((d, i) => {
    if (d.sort_order !== i) writeRow('domains', { ...d, sort_order: i })
  })
}

/** Re-points every project/task under `fromId` to `intoId`, then deletes the now-empty domain. */
export function mergeDomain(fromId: string, intoId: string): void {
  const projects = queryClient.getQueryData<Project[]>(['projects']) ?? []
  for (const p of projects) {
    if (p.domain_id === fromId) writeRow('projects', { ...p, domain_id: intoId })
  }
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  for (const t of tasks) {
    if (t.domain_id === fromId) writeRow('tasks', { ...t, domain_id: intoId })
  }
  const domains = queryClient.getQueryData<Domain[]>(['domains']) ?? []
  const fromDomain = domains.find((d) => d.id === fromId)
  if (fromDomain) {
    writeRow('domains', fromDomain, 'delete')
    logActivity('domain.merged', 'domain', fromId, { into: intoId })
  }
}
