import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import type { JournalEntry } from '../../lib/types'

export function useJournalEntries() {
  return useQuery({
    queryKey: ['journal_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('entry_date', { ascending: false })
      if (error) throw error
      return data as JournalEntry[]
    },
    select: (entries) => entries.filter((e) => !e.deleted_at),
  })
}

function nowIso() {
  return new Date().toISOString()
}

export function upsertJournalEntry(
  entry: Partial<JournalEntry> & { entry_date: string; body: string },
  isNew: boolean
): JournalEntry {
  const finalEntry: JournalEntry = {
    id: entry.id || crypto.randomUUID(),
    user_id: entry.user_id || '', // Handled by DB default auth.uid()
    body: entry.body,
    entry_date: entry.entry_date,
    mood: entry.mood ?? null,
    transcript: entry.transcript ?? null,
    media_paths: entry.media_paths ?? [],
    gratitude: entry.gratitude ?? [],
    created_at: entry.created_at || nowIso(),
    updated_at: nowIso(),
  }

  writeRow('journal_entries', finalEntry)
  logActivity(
    isNew ? 'journal.created' : 'journal.updated',
    'journal_entry',
    finalEntry.id,
    { entry_date: finalEntry.entry_date }
  )
  return finalEntry
}

export function deleteJournalEntry(entry: JournalEntry): void {
  writeRow('journal_entries', { ...entry, deleted_at: new Date().toISOString() })
  logActivity('journal.deleted', 'journal_entry', entry.id, {})
}

export function restoreJournalEntry(entry: JournalEntry): void {
  writeRow('journal_entries', { ...entry, deleted_at: null })
  logActivity('journal.restored', 'journal_entry', entry.id, {})
}
