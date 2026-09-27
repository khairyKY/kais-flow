// Every column the client reads from the two searchable tables, minus the search columns
// (0008): `embedding` (vector(384), ~4.5 KB of JSON per row) and `search_tsv`. `select('*')`
// shipped both on every load and refetch — ~10× the useful bytes, the first thing to exhaust the
// free tier's 5 GB/month egress at 100 users. Writes are unaffected: the outbox upserts only the
// columns a row carries. A new column must be added here; columns.test.ts fails until it is.
export const TASK_COLUMNS = [
  'id', 'user_id', 'project_id', 'domain_id', 'area_id', 'milestone_id', 'parent_task_id',
  'title', 'notes', 'status', 'priority', 'labels', 'top3', 'someday', 'paused',
  'due_at', 'scheduled_start', 'scheduled_end', 'duration_min', 'snoozed_until',
  'recurrence_rule', 'reminder_at', 'reminder_sent', 'external_ref',
  'completed_at', 'deleted_at', 'created_at', 'updated_at',
].join(',') as '*' // typed as '*' so supabase-js's select-string parser types rows like select('*')

export const INBOX_COLUMNS = [
  'id', 'user_id', 'kind', 'raw_text', 'transcript', 'ai_parse', 'confidence', 'status',
  'filed_task_id', 'payload', 'snoozed_until', 'external_ref', 'deleted_at', 'created_at', 'updated_at',
].join(',') as '*'
