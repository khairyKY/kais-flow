-- Migration: 0033_journal_entries_multi.sql
-- D-1 (Kai's ruling, 2026-07-26): the journal is ONE daily page holding UNLIMITED
-- timestamped entries. 0021 put a UNIQUE index on (user_id, entry_date), so a day could
-- hold exactly one row — which is precisely why "+ New entry" could never do anything.
-- Drop the uniqueness. A day is now N rows ordered by `created_at`, and `created_at` IS
-- the entry's timestamp, so no new column is needed.
--
-- Nothing else changes: RLS policy, set_updated_at trigger, realtime publication and the
-- `deleted_at` soft-delete column (0023, feeds the Trash page) are already on this table.

drop index if exists journal_entries_user_date_idx;

-- Same lookup shape, without the uniqueness; created_at trails so a day reads back in
-- entry order straight from the index.
create index if not exists journal_entries_user_date_idx
  on journal_entries (user_id, entry_date, created_at);
