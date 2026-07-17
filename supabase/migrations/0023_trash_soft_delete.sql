-- Migration: 0023_trash_soft_delete.sql
-- Add deleted_at columns for soft-delete support and completion_summary for pressed projects

ALTER TABLE tasks ADD COLUMN deleted_at timestamptz;
ALTER TABLE inbox_items ADD COLUMN deleted_at timestamptz;
ALTER TABLE calendar_events ADD COLUMN deleted_at timestamptz;
ALTER TABLE journal_entries ADD COLUMN deleted_at timestamptz;
ALTER TABLE projects ADD COLUMN completion_summary text;

-- Create indexes on deleted_at
CREATE INDEX tasks_deleted_at_idx ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX inbox_items_deleted_at_idx ON inbox_items(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX calendar_events_deleted_at_idx ON calendar_events(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX journal_entries_deleted_at_idx ON journal_entries(deleted_at) WHERE deleted_at IS NOT NULL;
