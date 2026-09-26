-- Migration: 0039_purge_sample_seed.sql
-- Deletes the fabricated sample content that was seeded into real accounts (UX-AUDIT-2026-09-24 U-1).
-- Kai confirmed 2026-09-24: all of it is fake — journal entries, library items, the Forecasting App
-- project, and all six People.
--
-- Sources:
--   0021_journal_library.sql  → 1 book, 3 quotes, 3 notes (fixed ids 1111…–7777…), 3 commentaries on
--                                those quotes, 3 journal entries (Jul 8/9/10, exact seeded bodies)
--   0024_time_entries.sql     → "Forecasting App" project (8888…), its task (9999…), 2 time entries
--   hand seed, 2026-07-17 09:48 (not in any migration) → 6 people (2000…0001–0006), 9 interactions
--                                (3000…, cascade), and the "Family" + "Work" domains only they use
--
-- Safe for every account: all matches are fixed primary keys (so they exist once, globally) or the
-- exact seeded journal text. Idempotent — re-running is a no-op. Kai's own "tetst" task under the
-- fake project survives (tasks.project_id is ON DELETE SET NULL).

-- Activity rows about seeded entities (they'd otherwise feed streaks/Slipping with fake events)
delete from activity_log where entity_id in (
  '99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888',
  '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006',
  '38eba7de-b9fb-4b84-9369-5730721bede3', 'f6d73143-a19c-4d8e-974c-9ca5e4663f2e'
);

-- 0024: the Forecasting App project, its task, its time entries
delete from time_entries
  where project_id = '88888888-8888-8888-8888-888888888888'
     or task_id = '99999999-9999-9999-9999-999999999999';
delete from tasks where id = '99999999-9999-9999-9999-999999999999';
delete from projects where id = '88888888-8888-8888-8888-888888888888';

-- 0021: library
delete from commentary where parent_id in (
  '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111'
);
delete from quotes where id in (
  '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
);
delete from notes where id in (
  '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666',
  '77777777-7777-7777-7777-777777777777'
);
delete from books where id = '11111111-1111-1111-1111-111111111111';

-- 0021: journal entries written "in Kai's voice" — matched on date + seeded opening words
delete from journal_entries where
     (entry_date = '2026-07-10' and body like 'The forecasting build finally clicked this morning%')
  or (entry_date = '2026-07-09' and body like 'A very productive Thursday. Focused on rewriting the navigation component.%')
  or (entry_date = '2026-07-08' and body like 'Had a long day debugging the synchronization issues.%');

-- Hand seed: people (interactions cascade) …
delete from interactions where person_id::text like '20000000-0000-0000-0000-00000000000_';
delete from people where id in (
  '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006'
);

-- … and the two domains only they used. Guarded: skipped if anything real points at them.
delete from domains d
where d.id in ('38eba7de-b9fb-4b84-9369-5730721bede3', 'f6d73143-a19c-4d8e-974c-9ca5e4663f2e')
  and not exists (select 1 from projects where domain_id = d.id)
  and not exists (select 1 from tasks    where domain_id = d.id)
  and not exists (select 1 from areas    where domain_id = d.id)
  and not exists (select 1 from notes    where domain_id = d.id)
  and not exists (select 1 from people   where domain_id = d.id)
  and not exists (select 1 from routines where domain_id = d.id);
