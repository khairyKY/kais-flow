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
        // D-1: a date now holds many rows; `created_at` is the entry's timestamp, so the
        // day reads back in the order it was written (and callers doing `.find(same date)`
        // — e.g. EveningRitual — land on the day's first entry, not an arbitrary one).
        .order('created_at', { ascending: true })
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
  // R4 (2026-07-20): `user_id` used to default to '' with the note "Handled by DB default
  // auth.uid()" — but sending the column explicitly *overrides* that default, and Postgres
  // rejects '' as a uuid ("invalid input syntax for type uuid"). Every journal write failed
  // permanently, and because a rejected entry sat at the head of the outbox it also blocked
  // every write queued behind it. Omit the column so the DB default actually applies.
  const finalEntry: JournalEntry = {
    id: entry.id || crypto.randomUUID(),
    ...(entry.user_id ? { user_id: entry.user_id } : {}),
    body: entry.body,
    entry_date: entry.entry_date,
    mood: entry.mood ?? null,
    transcript: entry.transcript ?? null,
    media_paths: entry.media_paths ?? [],
    gratitude: entry.gratitude ?? [],
    // PostgREST upsert replaces the whole row, so omitting this used to NULL it — i.e. any
    // edit that raced a delete silently resurrected the entry out of Trash. Carry it.
    deleted_at: entry.deleted_at ?? null,
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

/** Returns the row as written, so the Journal page can hold it (see `holdRow`). */
export function deleteJournalEntry(entry: JournalEntry): JournalEntry {
  const row = { ...entry, deleted_at: new Date().toISOString() }
  writeRow('journal_entries', row)
  logActivity('journal.deleted', 'journal_entry', entry.id, {})
  return row
}

export function restoreJournalEntry(entry: JournalEntry): JournalEntry {
  const row = { ...entry, deleted_at: null }
  writeRow('journal_entries', row)
  logActivity('journal.restored', 'journal_entry', entry.id, {})
  return row
}
