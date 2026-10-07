-- Migration: 0055_top3_order.sql
-- Kai 2026-10-07: "Just give me a button for making something the goal of the day", and order the
-- Top 3 — the same on the phone and the computer. The goal used to live in each device's
-- localStorage (today/goalStore.ts), so the phone and the PC could each crown a different pick.
--
-- tasks.top3_rank: the position in Today's Top 3, 1 = the goal of the day. Null = no place chosen
-- (an old build's star, or a row starred before this): those sort after the ranked ones, in Today's
-- own order. Only read while the task is in Today's Top 3, so a stale rank on an unstarred row is
-- harmless. No check constraint and no unique index: the cap of 3 stays client-side (an outbox
-- write queued offline by an older build would otherwise be parked as "couldn't be saved" — the
-- reason given in 0052), and two devices renumbering at once must not reject each other's rows.
alter table tasks add column if not exists top3_rank smallint;

-- app_settings.weekend_days: which weekdays are the user's weekend, 0 = Sunday … 6 = Saturday
-- (JavaScript's getDay). "This weekend" in the Plan menu and the date picker lands on the first
-- day of it. Default Sat + Sun, what "This weekend" meant until now.
alter table app_settings add column if not exists weekend_days smallint[] not null default '{0,6}';
