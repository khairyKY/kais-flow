-- 0078 — Resurfacing brings back old journal entries, quotes and notes too (P7e audit A24; PLAN row 20
-- "old entries/quotes", P7 7a: "resurfacing surfaces a journal entry").
--
-- 1. `resurfaced_log.entity_type` also allows 'journal_entry', 'quote' and 'note' (0008 allowed only
--    'task' and 'inbox_item').
-- 2. do_resurface() = 0066's body, every rule kept — one pick per user per day (UTC current_date),
--    weight = days since the thing's last activity_log touch (else since it was made), a snooze holds
--    exactly until snoozed_until, an unacted pick rests 14 days, a let-go ('dismissed') never returns,
--    tasks `todo` and not trashed, inbox items not dismissed or trashed, both older than 3 days — plus:
--    - a journal entry with words in it, written for a day at least 30 days back, not in Trash;
--    - a quote or a library note with words in it, saved at least 14 days ago (neither has a Trash:
--      a deleted one is gone, so it can't be picked).
--    Journal text never leaves the database here: the pick is an id; the app shows it in its own UI.
-- Idempotent (drop/add the check by name, create or replace the function).

alter table resurfaced_log drop constraint if exists resurfaced_log_entity_type_check;
alter table resurfaced_log add constraint resurfaced_log_entity_type_check
  check (entity_type in ('task', 'inbox_item', 'journal_entry', 'quote', 'note'));

create or replace function do_resurface() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  for v_user_id in select id from auth.users order by created_at loop
    if exists (select 1 from resurfaced_log where user_id = v_user_id and shown_on = current_date) then
      continue;
    end if;

    v_entity_type := null;
    v_entity_id := null;

    select entity_type, entity_id into v_entity_type, v_entity_id
    from (
      select
        raw.entity_type,
        raw.entity_id,
        greatest(
          extract(epoch from (now() - coalesce(
            (select max(al.created_at) from activity_log al
             where al.user_id = v_user_id
               and al.entity_type = raw.entity_type and al.entity_id = raw.entity_id),
            raw.created_at
          ))) / 86400,
          1
        ) as weight
      from (
        select 'task'::text as entity_type, id as entity_id, created_at from tasks
        where user_id = v_user_id and created_at < now() - interval '3 days'
          and status = 'todo' and deleted_at is null
        union all
        select 'inbox_item', id, created_at from inbox_items
        where user_id = v_user_id and created_at < now() - interval '3 days'
          and status <> 'dismissed' and deleted_at is null
        union all
        -- "Old entries": a page from at least a month ago. An entry with only a photo or a mood has
        -- no words for the card to show, so it waits.
        select 'journal_entry', id, created_at from journal_entries
        where user_id = v_user_id and entry_date < current_date - 30
          and btrim(body) <> '' and deleted_at is null
        union all
        select 'quote', id, created_at from quotes
        where user_id = v_user_id and created_at < now() - interval '14 days' and btrim(text) <> ''
        union all
        select 'note', id, created_at from notes
        where user_id = v_user_id and created_at < now() - interval '14 days'
          and (btrim(body) <> '' or btrim(coalesce(title, '')) <> '')
      ) raw
      where not exists (
        select 1 from resurfaced_log rl
        where rl.user_id = v_user_id
          and rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id
          and (
            rl.action = 'dismissed'
            -- "Not now · back in N days" means N days (0066).
            or (rl.snoozed_until is not null and rl.snoozed_until > now())
            -- Shown and not acted on: the usual 14-day rest before it can come round again.
            or (rl.snoozed_until is null and rl.shown_on > current_date - 14)
          )
      )
    ) candidates
    order by power(random(), 1.0 / weight) desc
    limit 1;

    if v_entity_type is not null then
      insert into resurfaced_log (user_id, entity_type, entity_id, shown_on)
      values (v_user_id, v_entity_type, v_entity_id, current_date)
      on conflict (user_id, shown_on) do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function do_resurface() from public, anon, authenticated;
