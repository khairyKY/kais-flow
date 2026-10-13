-- 0066 — Resurfacing keeps its word (2026-10-12 product audit).
--
-- "From a while ago" offers "Not now · back in 2 / 5 / 10 days" and writes snoozed_until on the
-- resurfaced_log row (0059). But do_resurface also skipped anything SHOWN in the last 14 days, so a
-- 2-day snooze came back after 14 — the copy promised what the server didn't do. Now a snoozed row
-- holds the item exactly until snoozed_until; the 14-day rest applies only to rows nobody acted on.
-- Same body as 0062 otherwise (status = 'todo', weights, one pick per user per day).

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
      ) raw
      where not exists (
        select 1 from resurfaced_log rl
        where rl.user_id = v_user_id
          and rl.entity_type = raw.entity_type and rl.entity_id = raw.entity_id
          and (
            rl.action = 'dismissed'
            -- "Not now · back in N days" means N days: a snoozed row holds the item exactly until
            -- its snoozed_until, then lets it come back (it used to be held 14 days whatever N said).
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
