// The captures list query on its own, so the shell can count a ready page (Paper Capture 11d: the Inbox
// badge goes 12 → 13) without loading the paper feature. features/paper/api.ts shares it — same key,
// same queryFn — so its patchCache / writeRow updates move the badge too.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { CaptureRow } from './paperMath'

export async function fetchCaptures(): Promise<CaptureRow[]> {
  const { data, error } = await supabase.from('captures').select('*').is('reviewed_at', null).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data as CaptureRow[]
}

/** Captures not yet reviewed — the Inbox's "ready to review" rows and the results sheet. */
export function useCaptures() {
  return useQuery({ queryKey: ['captures'], queryFn: fetchCaptures, select: (rows) => rows.filter((r) => !r.reviewed_at) })
}

/** Pages read and waiting for review: each is one more thing in the Inbox. */
export function useReadyPages(): number {
  return useQuery({ queryKey: ['captures'], queryFn: fetchCaptures, select: (rows) => rows.filter((r) => !r.reviewed_at && r.status === 'done').length }).data ?? 0
}
