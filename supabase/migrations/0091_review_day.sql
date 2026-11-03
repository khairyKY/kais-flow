-- Migration: 0091_review_day.sql
-- The weekly review's day and time (Kai 2026-11-03): until now the review was fixed to the first day of the
-- weekend. review_day = the weekday (0 = Sunday ... 6 = Saturday) Today prompts it on, review_time = the
-- wall-clock time (the user's timezone) from which it is prompted that day. Both null = how it was: the first
-- day of the weekend (weekend_days), all day. On the settings row like the other synced settings, so every
-- device (and notify, if it ever reminds about the review) reads the same. Read by app/src/lib/weekend.ts
-- reviewWhen; written only once the fetched row has the keys (settingSynced, the 0058 pattern).
-- Additive and idempotent - every step can re-run.
alter table app_settings add column if not exists review_day smallint;
alter table app_settings add column if not exists review_time time;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_review_day_weekday') then
    alter table app_settings add constraint app_settings_review_day_weekday check (review_day is null or review_day between 0 and 6);
  end if;
end $$;
