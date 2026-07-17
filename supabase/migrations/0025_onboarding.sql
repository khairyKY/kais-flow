-- Migration: 0025_onboarding.sql
-- N6: first-run onboarding. Additive columns on the app_settings singleton — no new table,
-- one row per user already exists (or defaults client-side per lib/settings.ts).

alter table app_settings
  add column if not exists display_name text,
  add column if not exists workspace_name text not null default 'Personal',
  add column if not exists seed_avatar text,
  add column if not exists onboarded_at timestamptz;
