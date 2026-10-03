import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import type { Area, Task } from '../../lib/types'

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('areas').select('*').order('sort_order')
      if (error) throw error
      return data as Area[]
    },
    // Trashed areas (0044) stay in the cache for Undo; no list shows them (Trash reads its own).
    select: (areas) => areas.filter((a) => !a.deleted_at),
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

/** Kai 2026-10-03 (Projects ⋯ / right-click → Delete): to Trash, no confirm, "Moved to Trash ·
 * Undo". Its tasks keep their area_id while it rests there, so Undo or Trash → Restore puts
 * everything back; only composting it (30 days) lets them go, to no area (migration 0044). */
export function deleteAreaWithUndo(area: Area): void {
  writeRow('areas', { ...area, deleted_at: nowIso(), updated_at: nowIso() })
  logActivity('area.deleted', 'area', area.id, { name: area.name })
  toastUndo('Moved to Trash', () => restoreTrashedArea(area))
}

export function restoreTrashedArea(area: Area): void {
  writeRow('areas', { ...area, deleted_at: null, updated_at: nowIso() })
  logActivity('area.restored', 'area', area.id, {})
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
