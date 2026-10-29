-- Consent records are insert-only (legal review 2026-10-29, finding C8:
-- docs/log/2026-10-29-0231-legal-review-handoff.md). 0083 let a person UPDATE their own `consents` rows
-- (the outbox wrote with upsert), so a record of what was agreed to, and when, could be rewritten.
--
-- 1 · No UPDATE for the app: the policy and the grant go. The outbox now writes this table with
--     ON CONFLICT DO NOTHING (lib/outbox.ts INSERT_ONLY), which needs INSERT only, so a retried write
--     that already landed is a no-op, not a rejection.
-- 2 · A trigger refuses UPDATE for every role, the service role included: a row is history, never edited.
--     DELETE stays possible only through the account's own deletion (the FK's on delete cascade); the
--     app has no DELETE grant (0083).
-- 3 · The server stamps `accepted_at` on insert, so the time on record is the server's, not the device's.

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists consents_update_own on consents;
revoke update on table consents from authenticated;

-- 2 ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function consents_refuse_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'consents are insert-only' using errcode = '42501';
end;
$$;
revoke execute on function consents_refuse_update() from public, anon, authenticated;

drop trigger if exists consents_no_update on consents;
create trigger consents_no_update before update on consents
  for each row execute function consents_refuse_update();

-- 0083's set_updated_at trigger never fires usefully now; drop it so the table says what it is.
drop trigger if exists set_consents_updated_at on consents;

-- 3 ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function consents_stamp_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.accepted_at := now();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function consents_stamp_insert() from public, anon, authenticated;

drop trigger if exists consents_stamp on consents;
create trigger consents_stamp before insert on consents
  for each row execute function consents_stamp_insert();
