-- Resurfacing settles (Kai 2026-10-07: "if I press Later… it's just a loop of snoozing something").
-- The Today card's actions now resolve the pick (Plan… / Done / Let it go / Make it a task), and
-- "Not now" is a real, visible snooze. Three changes:
--
-- 1. `resurfaced_log.snoozed_until timestamptz` — "Not now · back in N days" is written on the row,
--    so phone and PC agree (it was a per-device localStorage ledger, `kf.resurfaceSnoozes`, the
--    planned "MIG-1"). The client only sends it once the fetched row carries the column (the 0058
--    pattern), so it works before this is pushed.
-- 2. `action` gains 'done' (the card's Done on a task). Before this is pushed the client writes
--    'converted' for Done instead.
-- 3. do_resurface() (body from 0035):
--    - no +20 weight for an entity previously marked 'review_later' — that boost made every "Later"
--      bring the thing back *more* often: the loop. Weight is just days since the last touch.
--    - never picks an entity that is still snoozed (snoozed_until > now() on any of its rows; the
--      14-day exclusion already covers the default 2/5/10-day snoozes, this covers longer ones).
--    - never picks an entity that was let go ('dismissed'), a done or trashed task, or a dismissed
--      or trashed inbox item — they used to come back as a card with nothing sensible to do.
--    Everything else (per-user loop, 14-day exclusion, 3-day minimum age, weighted-random order,
--    `on conflict do nothing`, the revoked RPC grant) is unchanged.

alter table resurfaced_log add column if not exists snoozed_until timestamptz;

alter table resurfaced_log drop constraint if exists resurfaced_log_action_check;
alter table resurfaced_log add constraint resurfaced_log_action_check
  check (action in ('pending', 'converted', 'review_later', 'dismissed', 'done'));

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
          and status <> 'done' and deleted_at is null
        union all
        select 'inbox_item', id, created_at from inbox_items
        where user_id = v_user_id and created_at < now() - interval '3 days'
          and status <> 'dismissed' and deleted_at is null
      ) raw
      where not exists (
        select 1 from resurfaced_log rl
        where rl.user_id = v_user_id
          and rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id
          and (rl.shown_on > current_date - 14 or rl.action = 'dismissed' or rl.snoozed_until > now())
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
