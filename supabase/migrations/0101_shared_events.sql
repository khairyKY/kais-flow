-- Shared events and Free together (v1.6.6, partner sharing P2; design-export/Partner sharing P2 flows.html, flows 1 and 2,
-- Kai's picks 2026-11-17). The first place where one person's action changes another person's rows, so every rule is on the
-- server and nothing here widens anyone's access to anyone's other rows:
--
--   * A shared event is TWO ordinary calendar_events rows, one per person, each owned by its person (user_id = auth.uid(), the
--     same RLS as ever), joined by `shared_id`. Everything that already reads an event (the grid, reminders, Google, the feed,
--     the widget, the MCP) sees it with no change. NO new policy: a person still can't select or write the other's row.
--   * The link columns (shared_id, shared_circle, shared_with, share_status, share_peer_status, share_edited_by) can be set by
--     the security-definer functions here and by nothing else: a BEFORE trigger puts them back on every client write.
--   * Making one (shared_event_create), answering one (shared_event_respond) and "Delete for both" (shared_event_delete_both)
--     are RPCs: each checks that the caller is a member of the circle, that the other person is the circle's other member and
--     that the connection is current (not paused, not left). Editing is the owner's plain write to their own copy (offline-able,
--     through the outbox): an AFTER trigger copies title / time / all-day to the other copy, only while the connection is
--     current. "Remove from mine" is a plain delete of one's own copy: the trigger unlinks it and tells the other copy
--     ("Reem can't go"). Nothing else of the other copy is ever touched.
--   * Leaving (the circle goes) turns every copy into a plain event of its own person; an invite nobody answered goes.
--   * Free together (shared_free_together) returns WINDOWS only: both calendars' busy time (a Private item counts as busy,
--     like it is a Busy block) taken out of each person's own 08:00-22:30, gaps of an hour or more. Never a row, never a title.
--   * An unanswered proposal stays on both calendars until it starts, then share_events_expire (cron, every 5 minutes) drops it.
--
-- Column meanings (all null on an ordinary event):
--   shared_id           the id both copies share
--   shared_circle       the circle it lives in (no FK: the circle's delete trigger clears these first)
--   shared_with         the other person
--   share_status        my answer: 'invited' (a proposal I haven't answered, drawn dashed) | 'accepted'; the maker is 'accepted'
--   share_peer_status   the other person's answer: 'invited' | 'accepted' | 'declined' ("Reem can't go")
--   share_edited_by     who made the last change to title / time (both copies carry it)

alter table calendar_events
  add column if not exists shared_id uuid,
  add column if not exists shared_circle uuid,
  add column if not exists shared_with uuid,
  add column if not exists share_status text check (share_status in ('invited', 'accepted')),
  add column if not exists share_peer_status text check (share_peer_status in ('invited', 'accepted', 'declined')),
  add column if not exists share_edited_by uuid;
create index if not exists calendar_events_shared_id_idx on calendar_events (shared_id) where shared_id is not null;
create index if not exists calendar_events_shared_circle_idx on calendar_events (shared_circle) where shared_circle is not null;

-- ---------------------------------------------------------------------------------------------
-- The one switch the functions here flip for themselves: inside it the guard trigger lets the link columns be written.
-- Transaction-local, so it can't outlive the call; a client can't set a setting through PostgREST.
-- ---------------------------------------------------------------------------------------------
create or replace function share_ctx() returns boolean language sql stable as
$$ select coalesce(current_setting('kf.share', true), '') = '1' $$;

create or replace function share_ctx_set(p_on boolean) returns void language plpgsql as
$$ begin perform set_config('kf.share', case when p_on then '1' else '' end, true); end $$;
revoke all on function share_ctx_set(boolean) from public, anon, authenticated;

-- A connection that is current: both are members of the circle and it is not paused.
create or replace function share_active(p_circle uuid, p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from circles c
    where c.id = p_circle and (c.paused_until is null or c.paused_until <= now())
      and exists (select 1 from circle_members m where m.circle_id = c.id and m.user_id = p_a)
      and exists (select 1 from circle_members m where m.circle_id = c.id and m.user_id = p_b)
  )
$$;
revoke all on function share_active(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function share_zone(p_user uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select s.timezone from app_settings s where s.user_id = p_user and exists (select 1 from pg_timezone_names n where n.name = s.timezone)), 'Africa/Cairo')
$$;
revoke all on function share_zone(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The guard: no client write can make, move or forge a link.
-- ---------------------------------------------------------------------------------------------
create or replace function share_cal_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if share_ctx() then return new; end if;
  if tg_op = 'INSERT' then
    new.shared_id := null; new.shared_circle := null; new.shared_with := null;
    new.share_status := null; new.share_peer_status := null; new.share_edited_by := null;
    return new;
  end if;
  new.shared_id := old.shared_id; new.shared_circle := old.shared_circle; new.shared_with := old.shared_with;
  new.share_status := old.share_status; new.share_peer_status := old.share_peer_status; new.share_edited_by := old.share_edited_by;
  if old.shared_id is null then return new; end if;
  -- A plain delete of my copy is "Remove from mine" (or "Decline"): the other copy hears it, mine becomes a plain event in Trash.
  if old.deleted_at is null and new.deleted_at is not null then
    perform share_ctx_set(true);
    update calendar_events s set share_peer_status = 'declined' where s.shared_id = old.shared_id and s.id <> old.id and s.user_id <> old.user_id;
    perform share_ctx_set(false);
    new.shared_id := null; new.shared_circle := null; new.shared_with := null;
    new.share_status := null; new.share_peer_status := null; new.share_edited_by := null;
    return new;
  end if;
  new.private := false; -- both of you are on it: nothing about it is Private
  if (new.title, new.starts_at, new.ends_at, new.all_day) is distinct from (old.title, old.starts_at, old.ends_at, old.all_day) then
    new.share_edited_by := old.user_id;
  end if;
  return new;
end $$;
revoke all on function share_cal_guard() from public, anon, authenticated;
drop trigger if exists calendar_events_share_guard on calendar_events;
create trigger calendar_events_share_guard before insert or update on calendar_events for each row execute function share_cal_guard();

-- Either person edits, it changes for both: title, time and all-day go to the other copy, and a restore brings the other
-- copy back too ("Delete for both" then Undo). Only while the connection is current: a pause keeps each side's own edits.
create or replace function share_cal_sync() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare sib calendar_events;
begin
  if share_ctx() or new.shared_id is null then return null; end if;
  if (new.title, new.starts_at, new.ends_at, new.all_day) is not distinct from (old.title, old.starts_at, old.ends_at, old.all_day)
     and not (old.deleted_at is not null and new.deleted_at is null) then return null; end if;
  select * into sib from calendar_events x where x.shared_id = new.shared_id and x.id <> new.id and x.user_id <> new.user_id and x.user_id = new.shared_with limit 1;
  if sib.id is null or not share_active(new.shared_circle, new.user_id, sib.user_id) then return null; end if;
  perform share_ctx_set(true);
  update calendar_events set title = new.title, starts_at = new.starts_at, ends_at = new.ends_at, all_day = new.all_day,
    share_edited_by = coalesce(new.share_edited_by, new.user_id),
    deleted_at = case when old.deleted_at is not null and new.deleted_at is null then null else deleted_at end
  where id = sib.id;
  perform share_ctx_set(false);
  return null;
end $$;
revoke all on function share_cal_sync() from public, anon, authenticated;
drop trigger if exists calendar_events_share_sync on calendar_events;
create trigger calendar_events_share_sync after update on calendar_events for each row when (new.shared_id is not null) execute function share_cal_sync();

-- A copy deleted for good while still on the other's calendar: the other copy says so.
create or replace function share_cal_before_delete() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if share_ctx() or old.shared_id is null or old.deleted_at is not null then return old; end if;
  perform share_ctx_set(true);
  update calendar_events s set share_peer_status = 'declined' where s.shared_id = old.shared_id and s.id <> old.id and s.user_id <> old.user_id;
  perform share_ctx_set(false);
  return old;
end $$;
revoke all on function share_cal_before_delete() from public, anon, authenticated;
drop trigger if exists calendar_events_share_before_delete on calendar_events;
create trigger calendar_events_share_before_delete before delete on calendar_events for each row when (old.shared_id is not null) execute function share_cal_before_delete();

-- When the circle goes (one of you disconnected, or an account was deleted): each keeps a plain copy of their own.
-- A proposal nobody answered was never on the invited person's calendar for real, so that copy goes.
create or replace function share_cal_unlink() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform share_ctx_set(true);
  delete from calendar_events where shared_circle = old.id and share_status = 'invited';
  update calendar_events set shared_id = null, shared_circle = null, shared_with = null, share_status = null, share_peer_status = null, share_edited_by = null
  where shared_circle = old.id;
  perform share_ctx_set(false);
  return old;
end $$;
revoke all on function share_cal_unlink() from public, anon, authenticated;
drop trigger if exists circles_share_unlink on circles;
create trigger circles_share_unlink before delete on circles for each row execute function share_cal_unlink();

-- ---------------------------------------------------------------------------------------------
-- Busy time of one person, as a multirange, for Free together. Repeating events are expanded here (the app's
-- _shared/series.ts does the same for the client): DAILY, WEEKLY (BYDAY), MONTHLY (day of the month, or an nth weekday like
-- 2SU / -1FR) and YEARLY, with INTERVAL, COUNT and UNTIL, on the owner's wall clock. A rule it can't read counts as a one-off,
-- like series.ts. Counts: timed, live, busy, and not an invitation the owner hasn't answered.
-- ---------------------------------------------------------------------------------------------
create or replace function share_expand(p_rule text, p_starts timestamptz, p_ends timestamptz, p_exdates text[], p_zone text, p_from timestamptz, p_to timestamptz)
returns setof tstzrange language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_freq text := upper(substring(p_rule from '(?i)(?:^|;)FREQ=([A-Z]+)'));
  v_int int := coalesce(nullif(substring(p_rule from '(?i)(?:^|;)INTERVAL=([0-9]+)'), '')::int, 1);
  v_count int := nullif(substring(p_rule from '(?i)(?:^|;)COUNT=([0-9]+)'), '')::int;
  v_until_raw text := substring(p_rule from '(?i)(?:^|;)UNTIL=([0-9TZ]+)');
  v_byday text := upper(substring(p_rule from '(?i)(?:^|;)BYDAY=([-+0-9A-Za-z,]+)'));
  v_bymd int := nullif(substring(p_rule from '(?i)(?:^|;)BYMONTHDAY=(-?[0-9]+)'), '')::int;
  v_anchor timestamp := p_starts at time zone p_zone;
  v_a date := (p_starts at time zone p_zone)::date;
  v_tod time := (p_starts at time zone p_zone)::time;
  v_dur interval := p_ends - p_starts;
  v_until timestamptz; v_d date; v_first date; v_last date; v_n int := 0; v_hit boolean; v_occ timestamptz;
  v_days text[]; v_tok text; v_ord int; v_wd int; v_dom int; v_dim int; v_ex timestamptz[];
begin
  if v_freq not in ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY') or v_int < 1 then
    return next tstzrange(p_starts, p_ends); return;
  end if;
  if v_until_raw is not null then
    if length(v_until_raw) = 8 then v_until := ((to_date(v_until_raw, 'YYYYMMDD') + 1)::timestamp at time zone p_zone);
    else v_until := to_timestamp(replace(v_until_raw, 'Z', ''), 'YYYYMMDD"T"HH24MISS') at time zone 'UTC'; end if;
  end if;
  begin v_ex := coalesce(p_exdates, '{}')::timestamptz[]; exception when others then v_ex := '{}'; end;
  v_days := case when v_byday is null then '{}' else string_to_array(v_byday, ',') end;
  v_last := (p_to at time zone p_zone)::date;
  -- with COUNT the n-th occurrence depends on every one before it: walk from the start; otherwise start near the window
  v_first := case when v_count is not null then v_a else greatest(v_a, ((p_from - v_dur) at time zone p_zone)::date - 1) end;
  if v_last - v_first > 4000 then v_first := v_last - 4000; end if;
  v_d := v_first;
  while v_d <= v_last loop
    v_hit := false;
    if v_d >= v_a then
      v_wd := extract(isodow from v_d)::int;
      v_dom := extract(day from v_d)::int;
      if v_freq = 'DAILY' then
        v_hit := (v_d - v_a) % v_int = 0;
      elsif v_freq = 'WEEKLY' then
        v_hit := (((v_d - (extract(isodow from v_d)::int - 1)) - (v_a - (extract(isodow from v_a)::int - 1))) / 7) % v_int = 0
          and (case when cardinality(v_days) = 0 then v_wd = extract(isodow from v_a)::int
               else exists (select 1 from unnest(v_days) t where substring(t from '[A-Z]{2}$') = (array['MO','TU','WE','TH','FR','SA','SU'])[v_wd]) end);
      elsif v_freq = 'MONTHLY' then
        if ((extract(year from v_d)::int * 12 + extract(month from v_d)::int) - (extract(year from v_a)::int * 12 + extract(month from v_a)::int)) % v_int = 0 then
          v_dim := extract(day from (date_trunc('month', v_d) + interval '1 month - 1 day'))::int;
          if cardinality(v_days) > 0 then
            v_hit := false;
            foreach v_tok in array v_days loop
              v_ord := coalesce(nullif(substring(v_tok from '^[-+]?[0-9]+'), '')::int, 0);
              if substring(v_tok from '[A-Z]{2}$') = (array['MO','TU','WE','TH','FR','SA','SU'])[v_wd]
                 and (v_ord = 0 or (v_ord > 0 and (v_dom - 1) / 7 + 1 = v_ord) or (v_ord < 0 and (v_dim - v_dom) / 7 + 1 = -v_ord)) then v_hit := true; end if;
            end loop;
          elsif v_bymd is not null then
            v_hit := v_dom = case when v_bymd < 0 then v_dim + v_bymd + 1 else v_bymd end;
          else
            v_hit := v_dom = extract(day from v_a)::int;
          end if;
        end if;
      else -- YEARLY
        v_hit := (extract(year from v_d)::int - extract(year from v_a)::int) % v_int = 0
          and extract(month from v_d) = extract(month from v_a) and extract(day from v_d) = extract(day from v_a);
      end if;
    end if;
    if v_hit then
      v_occ := (v_d + v_tod) at time zone p_zone;
      if v_until is not null and v_occ >= v_until then exit; end if;
      v_n := v_n + 1;
      if v_count is not null and v_n > v_count then exit; end if;
      if not (v_occ = any(v_ex)) and v_occ < p_to and v_occ + v_dur > p_from then
        return next tstzrange(v_occ, v_occ + v_dur);
      end if;
    end if;
    v_d := v_d + 1;
  end loop;
end $$;
revoke all on function share_expand(text, timestamptz, timestamptz, text[], text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function share_busy(p_user uuid, p_from timestamptz, p_to timestamptz) returns tstzmultirange
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_zone text := share_zone(p_user); v_out tstzmultirange;
begin
  select coalesce(range_agg(r), '{}'::tstzmultirange) into v_out from (
    select tstzrange(e.starts_at, e.ends_at) as r
    from calendar_events e left join tasks t on t.id = e.task_id
    where e.user_id = p_user and e.deleted_at is null and e.busy and not e.all_day and e.recurrence_rule is null
      and e.share_status is distinct from 'invited'
      and (e.task_id is null or (t.deleted_at is null and t.status <> 'cancelled'))
      and e.starts_at < p_to and e.ends_at > p_from and e.ends_at > e.starts_at
    union all
    select x.r
    from calendar_events e
    left join tasks t on t.id = e.task_id
    cross join lateral share_expand(e.recurrence_rule, e.starts_at, e.ends_at, e.recurrence_exdates, v_zone, p_from, p_to) x(r)
    where e.user_id = p_user and e.deleted_at is null and e.busy and not e.all_day and e.recurrence_rule is not null
      and e.share_status is distinct from 'invited'
      and (e.task_id is null or (t.deleted_at is null and t.status <> 'cancelled'))
      and e.ends_at > e.starts_at
  ) q;
  return v_out;
end $$;
revoke all on function share_busy(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 08:00-22:30 on each day of a person's own clock.
create or replace function share_day_windows(p_zone text, p_from timestamptz, p_to timestamptz) returns tstzmultirange language sql stable as $$
  select coalesce(range_agg(tstzrange((g.d + time '08:00') at time zone p_zone, (g.d + time '22:30') at time zone p_zone)), '{}'::tstzmultirange)
  from generate_series(((p_from at time zone p_zone)::date - 1)::timestamp, ((p_to at time zone p_zone)::date + 1)::timestamp, interval '1 day') g(d)
$$;
revoke all on function share_day_windows(text, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The mask learns about shared events: an invitation I haven't answered is not on my calendar for real (not shown, not busy),
-- and a shared event the viewer is on is the viewer's own block already (never drawn a second time in the lane). share_day_data
-- gains the viewer; the view link has none (null), so it shows the owner's accepted events like any other.
-- ---------------------------------------------------------------------------------------------
drop function if exists share_day_data(uuid, text, timestamptz, timestamptz);
create or replace function share_day_data(p_owner uuid, p_level text, p_from timestamptz, p_to timestamptz, p_viewer uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_zone text; v_today date; v_blocks jsonb; v_top jsonb := '[]'::jsonb; v_tasks jsonb := '[]'::jsonb;
begin
  if p_level not in ('busy', 'titles', 'details') then raise exception 'bad level' using errcode = '22023'; end if;
  p_to := least(p_to, p_from + interval '70 days');
  select s.timezone into v_zone from app_settings s where s.user_id = p_owner;
  if v_zone is null or not exists (select 1 from pg_timezone_names n where n.name = v_zone) then v_zone := 'Africa/Cairo'; end if;
  v_today := (now() at time zone v_zone)::date;

  -- The blocks: events, Time blocks, task blocks, Google and subscribed events. Masked = no title, no kind: at Busy only,
  -- or for anything Private (itself, its task, or the series it was dragged out of). A task block of a deleted or cancelled task is not there.
  select coalesce(jsonb_agg(x.b order by x.s, x.i), '[]'::jsonb) into v_blocks from (
    select e.starts_at as s, e.id as i, jsonb_strip_nulls(jsonb_build_object(
      'id', e.id, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'all_day', e.all_day,
      'title', case when m.masked then null else e.title end,
      'kind', case when m.masked then null else case when e.source = 'native' then e.type else 'external' end end,
      'masked', m.masked,
      'recurrence_rule', e.recurrence_rule,
      'recurrence_exdates', case when e.recurrence_rule is not null then to_jsonb(e.recurrence_exdates) end
    )) as b
    from calendar_events e
    left join tasks t on t.id = e.task_id
    left join calendar_events sr on sr.id = e.series_id
    cross join lateral (select (p_level = 'busy' or e.private or coalesce(t.private, false) or coalesce(sr.private, false)) as masked) m
    where e.user_id = p_owner and e.deleted_at is null
      and (e.task_id is null or (t.deleted_at is null and t.status <> 'cancelled'))
      and e.starts_at < p_to and (e.ends_at > p_from or e.recurrence_rule is not null)
      and (e.busy or not m.masked)
      and e.share_status is distinct from 'invited'
      and (p_viewer is null or e.shared_with is distinct from p_viewer)
    order by e.starts_at, e.id
    limit 2000
  ) x;

  if p_level = 'details' then
    -- Today's Top 3, the app's rule (supabase/functions/_shared/today.ts): open picks dated today or earlier, plus the picks
    -- finished today that kept a place; the goal first. A Private task, or a task inside a Private Time block, is never here.
    select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'title', y.title, 'notes', y.notes, 'done', y.done, 'goal', y.goal) order by y.ord, y.rank, y.created_at), '[]'::jsonb) into v_top from (
      select t.id, t.title, t.notes, (t.status = 'done') as done, (t.top3_rank = 1) as goal, t.created_at, coalesce(t.top3_rank, 9999) as rank,
        case when t.top3_rank = 1 then 0 when t.status = 'todo' then 1 else 2 end as ord
      from tasks t
      where t.user_id = p_owner and not t.private and t.deleted_at is null
        and not exists (select 1 from calendar_events b where b.id = t.slot_id and (b.private or b.deleted_at is not null))
        and (
          (t.top3 and t.status = 'todo' and not t.someday and not coalesce(t.paused, false)
            and (t.snoozed_until is null or t.snoozed_until <= now())
            and (coalesce(t.due_at, t.scheduled_start) is null or (coalesce(t.due_at, t.scheduled_start) at time zone v_zone)::date <= v_today))
          or (t.status = 'done' and t.top3_rank is not null and (t.completed_at at time zone v_zone)::date = v_today)
        )
      limit 5
    ) y;
    -- The rest of today's tasks: open, due today, not a pick.
    select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'title', z.title, 'notes', z.notes) order by z.due_at, z.created_at), '[]'::jsonb) into v_tasks from (
      select t.id, t.title, t.notes, t.due_at, t.created_at
      from tasks t
      where t.user_id = p_owner and not t.private and t.deleted_at is null and t.status = 'todo' and not t.someday and not coalesce(t.paused, false)
        and t.due_at is not null and (t.due_at at time zone v_zone)::date = v_today
        and (t.snoozed_until is null or t.snoozed_until <= now())
        and not (t.top3 and (t.due_at at time zone v_zone)::date <= v_today)
        and not exists (select 1 from calendar_events b where b.id = t.slot_id and (b.private or b.deleted_at is not null))
      limit 20
    ) z;
  end if;

  return jsonb_build_object('level', p_level, 'zone', v_zone, 'now', now(), 'blocks', v_blocks, 'top3', v_top, 'tasks', v_tasks);
end $$;
revoke all on function share_day_data(uuid, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- What a signed-in viewer may read of another person: nothing unless a connection says so, at the LOWER of the two levels,
-- and nothing while it is paused. The answer for "no connection", "not you" and "paused" never carries a block.
create or replace function shared_day(p_owner uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_viewer uuid := auth.uid(); v_level text; v_paused timestamptz; v_circle uuid;
begin
  if v_viewer is null or p_owner is null or p_owner = v_viewer or p_from is null or p_to is null then return jsonb_build_object('level', null); end if;
  select c.id, c.paused_until, share_lower(g1.level, g2.level) into v_circle, v_paused, v_level
  from circles c
  join share_grants g1 on g1.circle_id = c.id and g1.owner_id = p_owner and g1.viewer_id = v_viewer
  join share_grants g2 on g2.circle_id = c.id and g2.owner_id = v_viewer and g2.viewer_id = p_owner
  limit 1;
  if v_circle is null then return jsonb_build_object('level', null); end if;
  if v_paused is not null and v_paused > now() then return jsonb_build_object('level', null, 'paused_until', v_paused); end if;
  return share_day_data(p_owner, v_level, p_from, p_to, v_viewer);
end $$;

-- ---------------------------------------------------------------------------------------------
-- The RPCs. Each one: signed in, a member of the circle, the other person is the circle's other member, the connection is
-- current (not paused, not left). They answer with a result the app can show; they never return a row of the other person.
-- ---------------------------------------------------------------------------------------------

-- Make a shared event (or a proposal from Free together): my copy (accepted, with my colour) and an invited copy for them.
-- `p_id` is the id the app already shows, so a retry of the same call finds the first one and answers it again.
create or replace function shared_event_create(p_id uuid, p_circle uuid, p_title text, p_starts_at timestamptz, p_ends_at timestamptz, p_all_day boolean default false, p_color text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v uuid := auth.uid(); v_partner uuid; v_sid uuid := gen_random_uuid(); v_title text := btrim(coalesce(p_title, '')); v_prior calendar_events;
begin
  if v is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_id is null or p_circle is null then raise exception 'bad request' using errcode = '22023'; end if;
  if v_title = '' or length(v_title) > 300 then raise exception 'bad title' using errcode = '22023'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '31 days' or p_ends_at <= now() then raise exception 'bad time' using errcode = '22023'; end if;
  select m2.user_id into v_partner
  from circles c
  join circle_members m1 on m1.circle_id = c.id and m1.user_id = v
  join circle_members m2 on m2.circle_id = c.id and m2.user_id <> v
  where c.id = p_circle and c.kind = 'pair';
  if v_partner is null then raise exception 'not connected' using errcode = '42501'; end if;
  if not share_active(p_circle, v, v_partner) then return jsonb_build_object('ok', false, 'error', 'paused'); end if;
  select * into v_prior from calendar_events e where e.id = p_id;
  if v_prior.id is not null then
    if v_prior.user_id = v and v_prior.shared_circle = p_circle and v_prior.shared_id is not null then
      return jsonb_build_object('ok', true, 'shared_id', v_prior.shared_id, 'event_id', v_prior.id);
    end if;
    raise exception 'id taken' using errcode = '23505';
  end if;
  perform share_ctx_set(true);
  insert into calendar_events (id, user_id, title, starts_at, ends_at, all_day, type, source, color, shared_id, shared_circle, shared_with, share_status, share_peer_status, share_edited_by) values
    (p_id, v, v_title, p_starts_at, p_ends_at, coalesce(p_all_day, false), 'event', 'native', p_color, v_sid, p_circle, v_partner, 'accepted', 'invited', v),
    (gen_random_uuid(), v_partner, v_title, p_starts_at, p_ends_at, coalesce(p_all_day, false), 'event', 'native', null, v_sid, p_circle, v, 'invited', 'accepted', v);
  perform share_ctx_set(false);
  return jsonb_build_object('ok', true, 'shared_id', v_sid, 'event_id', p_id);
end $$;

-- Answer a proposal. Accept: both copies say so. Decline: the same as "Remove from mine" - the invited copy is gone, the other
-- copy reads "can't go".
create or replace function shared_event_respond(p_event uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := auth.uid(); me calendar_events;
begin
  if v is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into me from calendar_events e where e.id = p_event and e.user_id = v and e.shared_id is not null and e.deleted_at is null;
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if p_accept then
    if me.share_status = 'accepted' then return jsonb_build_object('ok', true); end if;
    if not share_active(me.shared_circle, v, me.shared_with) then return jsonb_build_object('ok', false, 'error', 'paused'); end if;
    perform share_ctx_set(true);
    update calendar_events set share_status = 'accepted' where id = me.id;
    update calendar_events set share_peer_status = 'accepted' where shared_id = me.shared_id and user_id = me.shared_with;
    perform share_ctx_set(false);
    return jsonb_build_object('ok', true);
  end if;
  perform share_ctx_set(true);
  update calendar_events set share_peer_status = 'declined' where shared_id = me.shared_id and user_id = me.shared_with;
  if me.share_status = 'invited' then delete from calendar_events where id = me.id;
  else update calendar_events set deleted_at = now(), shared_id = null, shared_circle = null, shared_with = null, share_status = null, share_peer_status = null, share_edited_by = null where id = me.id;
  end if;
  perform share_ctx_set(false);
  return jsonb_build_object('ok', true);
end $$;

-- "Delete for both": both copies go to their own person's Trash, together. Undo (a restore of either copy) brings both back while
-- the connection is current.
create or replace function shared_event_delete_both(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v uuid := auth.uid(); me calendar_events;
begin
  if v is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into me from calendar_events e where e.id = p_event and e.user_id = v and e.shared_id is not null and e.deleted_at is null;
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if not share_active(me.shared_circle, v, me.shared_with) then return jsonb_build_object('ok', false, 'error', 'paused'); end if;
  perform share_ctx_set(true);
  update calendar_events set deleted_at = now() where shared_id = me.shared_id and deleted_at is null and user_id in (v, me.shared_with);
  perform share_ctx_set(false);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Free together: when are we both free? WINDOWS only. Each person's own 08:00-22:30, minus both calendars' busy time (a Private
-- item is busy, exactly as it is a Busy block in the lane), gaps of an hour or more, from now on, at most 14 days.
-- The same answer at every level: Busy is all it needs. Nothing paused, nothing unconnected, nobody else gets one.
-- ---------------------------------------------------------------------------------------------
create or replace function shared_free_together(p_partner uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v uuid := auth.uid(); v_circle uuid; v_paused timestamptz; zv text; zp text; v_free tstzmultirange; v_win jsonb;
begin
  if v is null or p_partner is null or p_partner = v or p_from is null or p_to is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  select c.id, c.paused_until into v_circle, v_paused
  from circles c
  join share_grants g1 on g1.circle_id = c.id and g1.owner_id = p_partner and g1.viewer_id = v
  join share_grants g2 on g2.circle_id = c.id and g2.owner_id = v and g2.viewer_id = p_partner
  limit 1;
  if v_circle is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  if v_paused is not null and v_paused > now() then return jsonb_build_object('ok', false, 'error', 'paused', 'paused_until', v_paused); end if;
  p_from := greatest(p_from, now());
  p_to := least(p_to, p_from + interval '14 days');
  zv := share_zone(v); zp := share_zone(p_partner);
  if p_to <= p_from then return jsonb_build_object('ok', true, 'zone', zv, 'partner_zone', zp, 'windows', '[]'::jsonb); end if;
  v_free := ((share_day_windows(zv, p_from, p_to) * share_day_windows(zp, p_from, p_to)) - share_busy(v, p_from, p_to) - share_busy(p_partner, p_from, p_to))
    * tstzmultirange(tstzrange(p_from, p_to));
  select coalesce(jsonb_agg(jsonb_build_object('starts_at', lower(r), 'ends_at', upper(r)) order by lower(r)), '[]'::jsonb) into v_win
  from unnest(v_free) r where upper(r) - lower(r) >= interval '1 hour';
  return jsonb_build_object('ok', true, 'zone', zv, 'partner_zone', zp, 'windows', v_win);
end $$;

revoke all on function shared_event_create(uuid, uuid, text, timestamptz, timestamptz, boolean, text), shared_event_respond(uuid, boolean), shared_event_delete_both(uuid), shared_free_together(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function shared_event_create(uuid, uuid, text, timestamptz, timestamptz, boolean, text), shared_event_respond(uuid, boolean), shared_event_delete_both(uuid), shared_free_together(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- No answer: a proposal stays dashed on both calendars until it starts, then it drops (both copies). Cron, every 5 minutes.
-- ---------------------------------------------------------------------------------------------
create or replace function share_events_expire() returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  perform share_ctx_set(true);
  delete from calendar_events c where c.shared_id in (select e.shared_id from calendar_events e where e.share_status = 'invited' and e.shared_id is not null and (case when e.all_day then e.ends_at else e.starts_at end) <= now());
  get diagnostics n = row_count;
  perform share_ctx_set(false);
  return n;
end $$;
revoke all on function share_events_expire() from public, anon, authenticated;

select cron.unschedule('share-events-expire') where exists (select 1 from cron.job where jobname = 'share-events-expire');
select cron.schedule('share-events-expire', '*/5 * * * *', $$select share_events_expire()$$);
