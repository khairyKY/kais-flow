import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import type { Area, Task } from '../../lib/types'

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('areas').select('*').order('sort_order')
      if (error) throw error
      return data as Area[]
    },
  })
}

function nowIso() {
  return new Date().toISOString()
}

export function createArea(name: string, domainId: string | null = null, color: string | null = null): Area {
  const areas = queryClient.getQueryData<Area[]>(['areas']) ?? []
  const area: Area = {
    id: crypto.randomUUID(),
    domain_id: domainId,
    name,
    color,
    description: null,
    sort_order: areas.length,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('areas', area)
  logActivity('area.created', 'area', area.id, { name })
  return area
}

export function renameArea(area: Area, name: string): void {
  writeRow('areas', { ...area, name })
  logActivity('area.renamed', 'area', area.id, { name })
}

export function recolorArea(area: Area, color: string): void {
  writeRow('areas', { ...area, color })
}

export function reorderAreas(ordered: Area[]): void {
  ordered.forEach((a, i) => {
    if (a.sort_order !== i) writeRow('areas', { ...a, sort_order: i })
  })
}

export function mergeArea(fromId: string, intoId: string): void {
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  for (const t of tasks) {
    if (t.area_id === fromId) writeRow('tasks', { ...t, area_id: intoId })
  }
  const areas = queryClient.getQueryData<Area[]>(['areas']) ?? []
  const fromArea = areas.find((a) => a.id === fromId)
  if (fromArea) {
    writeRow('areas', fromArea, 'delete')
    logActivity('area.merged', 'area', fromId, { into: intoId, name: fromArea.name })
  }
}
