-- WA-1 punch 1/3 (public gate): app_settings' primary key was `id boolean check (id)` —
-- a GLOBAL singleton, one row for the entire table. The first account owned it forever:
-- any second account's settings upsert hit the pk conflict, RLS blocked the DO UPDATE on
-- someone else's row, and the write dead-lettered — so a fresh account could never persist
-- `onboarded_at` (or any setting) and onboarding re-ran on every refresh.
-- One row per *user*: the pk moves to user_id (every write already carries it via
-- `default auth.uid()`, and supabase-js upsert conflicts on the pk — no client change needed).
alter table app_settings drop constraint app_settings_pkey;
alter table app_settings add primary key (user_id);
