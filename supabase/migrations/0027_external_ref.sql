-- Migration: 0027_external_ref.sql
-- P-IMPORT tier-0: idempotency keys for one-time data imports.
-- external_ref = {source: 'akiflow'|'csv'|..., id: <stable source id>, raw: {...whole source row}}.
-- The partial unique index per table makes re-running an import a no-op instead of a duplicate
-- (the importer skips rows whose (source, id) already exist; the index is the backstop).

ALTER TABLE tasks ADD COLUMN external_ref jsonb;
ALTER TABLE inbox_items ADD COLUMN external_ref jsonb;
ALTER TABLE journal_entries ADD COLUMN external_ref jsonb;
ALTER TABLE notes ADD COLUMN external_ref jsonb;
ALTER TABLE people ADD COLUMN external_ref jsonb;
ALTER TABLE projects ADD COLUMN external_ref jsonb;
-- Deviation from the phase file's six-table list: calendar_events too, because the Akiflow
-- adapter can import events (behind a default-OFF toggle) and they need the same idempotency.
ALTER TABLE calendar_events ADD COLUMN external_ref jsonb;

CREATE UNIQUE INDEX tasks_external_ref_idx ON tasks (user_id, (external_ref->>'source'), (external_ref->>'id')) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX inbox_items_external_ref_idx ON inbox_items (user_id, (external_ref->>'source'), (external_ref->>'id')) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX journal_entries_external_ref_idx ON journal_entries (user_id, (external_ref->>'source'), (external_ref->>'id')) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX notes_external_ref_idx ON notes (user_id, (external_ref->>'source'), (external_ref->>'id')) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX people_external_ref_idx ON people (user_id, (external_ref->>'source'), (external_ref->>'id')) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX projects_external_ref_idx ON projects (user_id, (external_ref->>'source'), (external_ref->>'id')) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX calendar_events_external_ref_idx ON calendar_events (user_id, (external_ref->>'source'), (external_ref->>'id')) WHERE external_ref IS NOT NULL;
