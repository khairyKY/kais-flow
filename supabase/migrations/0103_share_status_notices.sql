-- Partner sharing P2: "Status from the Now card" and "Notices" (v1.6.6; design-export/Partner sharing P2 flows.html flows 4 and 5,
-- Kai's picks of 2026-11-17). Built on 0100's circles, grants and masks; nothing in 0100 is redefined here (other P2 builders hold
-- 0101, 0102 and 0104 and replace nothing of mine either).
--
-- STATUS. A short line next to a person's name on the other side's Her day card and lane. Opt-in per connection
-- (circle_members.status_on, off until the owner turns it on); shown only when the lower of the two levels is Details; never a place.
--   share_status      ONE row per user (no client grants; written by the functions below): own words + when they clear, the Focus round
--                     this user's device is in (until + task), and `auto` ("From the Now card").
--   Auto words are derived HERE from the current block, not sent by a device: "Focusing until 3" (a Focus round),
--   "At the gym" / "In class" / "At work" (the block's AREA, by keyword - never its title), else "Busy until 3". A Private block
--   (itself, its task, its series, its Time block) gives NO words and blanks the Focus words too. Own words win while alive.
--   A status never lives past 24 hours: own words and Focus are clamped on write (trigger) AND checked on read; a block older than
--   24 hours says nothing. Default clear = tonight at the person's quiet hours (inside quiet hours: when they end).
--   A REPEATING block (one row + a rule: Kai's classes, his gym) is expanded by the owner's app, which already knows the occurrence it is in
--   (the Now card): it tells the server only WHICH series row and the occurrence's start and end (share_status_block); the words, the area and
--   the Private check are still made here, from the row, at read time (a series turned Private blanks it at once). The block lapses at its end
--   and by 24 hours. ponytail: needs the owner's app open (a closed app can't say it is in a class); a SQL/edge rrule would not.
--
-- NOTICES. "Reem added Dinner, Fri 8 PM." A generic pipeline: a KIND plus a MASKED payload. share_notice_emit() is the one door:
--   the caller hands the detail payload (what Titles and Details may see) and the busy payload (what Busy may see); the function
--   stores, per recipient, only the payload that recipient's level allows. A recipient's per-kind switch (circle_members.notice_prefs,
--   every kind Off until chosen) decides whether anything is stored at all. Later kinds (shared events, shared lists) call the same function.
--   P1 events wired now: a native calendar event/Time block/task block added by a connected person (not Google/subscribed imports,
--   not Private, never while paused). A Private item never notifies; an item turned Private (or trashed) before its notice went out
--   takes the notice with it.
--   Grouping: one notice per kind and person per 5 minutes (a burst folds into n). Quiet hours HOLD a notice (release_at moves to
--   when they end) in the app and for push alike; push goes out through notify (kind 'share_notice', a 5-minute cron) as ONE
--   line per person per tick. In-app: one strip on Today, gone when dismissed or after a day.
--   share_notices holds only masked payloads, so a Private or too-detailed word is never at rest; only the recipient may read or dismiss it.

-- ---------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------
create or replace function share_zone(p_user uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select n.name from app_settings s join pg_timezone_names n on n.name = s.timezone where s.user_id = p_user), 'Africa/Cairo')
$$;
revoke all on function share_zone(uuid) from public, anon, authenticated;

-- "3:30" / "3": the wall-clock time on a person's own clock, no AM/PM (the design's words: "Focusing until 3:30").
create or replace function share_clock(p_at timestamptz, p_zone text) returns text language sql stable as
$$ select regexp_replace(to_char(p_at at time zone p_zone, 'FMHH12:MI'), ':00$', '') $$;

-- When the person's quiet hours (app_settings 0048, on by default 22:30-07:00 on their clock) next end, if `p_at` is inside them; else p_at.
create or replace function share_quiet_end(p_user uuid, p_at timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s app_settings; v_zone text := share_zone(p_user); v_from time; v_to time; v_local timestamp; v_t time; v_inside boolean;
begin
  select * into s from app_settings where user_id = p_user;
  if s.quiet_hours_on is false then return p_at; end if;
  v_from := coalesce(s.quiet_from, '22:30'); v_to := coalesce(s.quiet_to, '07:00');
  v_local := p_at at time zone v_zone; v_t := v_local::time;
  v_inside := case when v_from <= v_to then v_t >= v_from and v_t < v_to else v_t >= v_from or v_t < v_to end;
  if not v_inside then return p_at; end if;
  return ((v_local::date + case when v_from > v_to and v_t >= v_from then 1 else 0 end) + v_to) at time zone v_zone;
end $$;
revoke all on function share_quiet_end(uuid, timestamptz) from public, anon, authenticated;

-- "Tonight, at your quiet hours": the next quiet-hours start; inside quiet hours, when they end. Never past 24 hours (the caller clamps).
create or replace function share_tonight(p_user uuid) returns timestamptz
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s app_settings; v_zone text := share_zone(p_user); v_end timestamptz; v_c timestamptz;
begin
  v_end := share_quiet_end(p_user, now());
  if v_end > now() then return v_end; end if;
  select * into s from app_settings where user_id = p_user;
  v_c := ((now() at time zone v_zone)::date + coalesce(s.quiet_from, '22:30'::time)) at time zone v_zone;
  if v_c <= now() then v_c := v_c + interval '1 day'; end if;
  return v_c;
end $$;
revoke all on function share_tonight(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- per connection: "Show my status to Reem" and the per-kind notice switches (mine, on my own member row)
-- ---------------------------------------------------------------------------------------------
alter table circle_members add column if not exists status_on boolean not null default false;
alter table circle_members add column if not exists notice_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(notice_prefs) = 'object');
-- (no column grant: circle_members stays readable only through share_connections / the functions below)

create or replace function share_status_on_set(p_circle uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update circle_members set status_on = coalesce(p_on, false) where circle_id = p_circle and user_id = auth.uid();
  if not found then raise exception 'not in this circle' using errcode = '42501'; end if;
  perform share_bump(auth.uid());
end $$;

-- A kind is a lower-case word ('added' now; 'event' and 'list' by the P2 builders). The mode is off / in_app / push; off removes the key.
create or replace function share_notice_pref_set(p_circle uuid, p_kind text, p_mode text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_kind is null or p_kind !~ '^[a-z][a-z_]{0,31}$' then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_mode is null or p_mode not in ('off', 'in_app', 'push') then raise exception 'bad mode' using errcode = '22023'; end if;
  update circle_members
     set notice_prefs = case when p_mode = 'off' then notice_prefs - p_kind else notice_prefs || jsonb_build_object(p_kind, p_mode) end
   where circle_id = p_circle and user_id = auth.uid();
  if not found then raise exception 'not in this circle' using errcode = '42501'; end if;
end $$;

-- Mine, per connection: the status switch and the notice switches. (share_connections() is 0100's and stays as it is.)
create or replace function share_notice_settings() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('circle_id', m.circle_id, 'status_on', m.status_on, 'notice_prefs', m.notice_prefs) order by m.created_at), '[]'::jsonb)
  from circle_members m where m.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------------------------
-- STATUS
-- ---------------------------------------------------------------------------------------------
create table if not exists share_status (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  auto boolean not null default true,
  words text check (words is null or char_length(words) between 1 and 40),
  words_set_at timestamptz,
  words_until timestamptz,
  focus_until timestamptz,
  focus_set_at timestamptz,
  focus_task_id uuid,
  block_event_id uuid,            -- the repeating series row the device says it is in (its occurrence: block_starts..block_ends)
  block_starts timestamptz,
  block_ends timestamptz,
  block_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table share_status enable row level security;
revoke all on table share_status from anon, authenticated;   -- only the functions below touch it

-- Never past 24 hours, whoever wrote it (a psql row, a later builder's function): the clamp is on the row itself.
create or replace function share_status_clamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.words is null then new.words_until := null; new.words_set_at := null; end if;
  if new.words is not null then
    new.words_set_at := coalesce(new.words_set_at, now());
    new.words_until := least(coalesce(new.words_until, new.words_set_at + interval '24 hours'), new.words_set_at + interval '24 hours');
  end if;
  if new.focus_until is null then new.focus_set_at := null; new.focus_task_id := null; end if;
  if new.block_event_id is null then new.block_starts := null; new.block_ends := null; new.block_set_at := null; end if;
  if new.block_event_id is not null then
    new.block_set_at := coalesce(new.block_set_at, now());
    new.block_ends := least(new.block_ends, new.block_set_at + interval '24 hours');
  end if;
  if new.focus_until is not null then
    new.focus_set_at := coalesce(new.focus_set_at, now());
    new.focus_until := least(new.focus_until, new.focus_set_at + interval '24 hours');
  end if;
  return new;
end $$;
drop trigger if exists share_status_clamp on share_status;
create trigger share_status_clamp before insert or update on share_status for each row execute function share_status_clamp();

-- A change of status tells the other side to look again (the masked answer is re-asked; nothing of it is in the ping).
create or replace function share_status_ping() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin perform share_bump(new.user_id); return null; end $$;
revoke all on function share_status_ping() from public, anon, authenticated;
drop trigger if exists share_status_ping on share_status;
create trigger share_status_ping after insert or update on share_status for each row execute function share_status_ping();

-- What a person's status says right now: {words, source 'words'|'auto', until} or null. Internal: no level or connection is checked here.
create or replace function share_status_core(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s share_status; v_zone text := share_zone(p_owner); v_now timestamptz := now(); b record; v_has boolean; v_kind text; v_words text;
begin
  select * into s from share_status where user_id = p_owner;
  -- 1. own words, while alive (never past 24 hours of being set)
  if s.words is not null and s.words_until > v_now and s.words_set_at > v_now - interval '24 hours' then
    return jsonb_build_object('words', s.words, 'source', 'words', 'until', least(s.words_until, s.words_set_at + interval '24 hours'));
  end if;
  if not coalesce(s.auto, true) then return null; end if;

  -- 2. the current block (a one-off native block, or the occurrence of a repeating one the owner's app named; started within a day), a Private one
  --    first: it gives no words at all
  select x.* into b from (
    select e.starts_at, e.ends_at, a.name as area,
           (e.private or coalesce(t.private, false) or coalesce(sr.private, false)
              or exists (select 1 from calendar_events sl where sl.id = t.slot_id and sl.private)) as masked
    from calendar_events e
    left join tasks t on t.id = e.task_id
    left join calendar_events sr on sr.id = e.series_id
    left join areas a on a.id = e.area_id
    where e.user_id = p_owner and e.deleted_at is null and e.source = 'native' and not e.all_day and e.recurrence_rule is null and coalesce(e.busy, true)
      and e.starts_at <= v_now and e.ends_at > v_now and e.starts_at > v_now - interval '24 hours'
      and (e.task_id is null or (t.deleted_at is null and t.status <> 'cancelled'))
    union all
    select s.block_starts, s.block_ends, a.name, e.private
    from calendar_events e
    left join areas a on a.id = e.area_id
    where e.id = s.block_event_id and e.user_id = p_owner and e.deleted_at is null and e.source = 'native' and e.recurrence_rule is not null
      and s.block_starts <= v_now and s.block_ends > v_now and s.block_starts > v_now - interval '24 hours' and s.block_set_at > v_now - interval '24 hours'
  ) x order by x.masked desc, x.starts_at desc limit 1;
  v_has := found;
  if v_has then
    if b.masked then return null; end if;
  end if;

  -- 3. a Focus round on this person's device (a Private task, or one inside a Private Time block, says nothing)
  if s.focus_until is not null and s.focus_until > v_now and s.focus_set_at > v_now - interval '24 hours' then
    if s.focus_task_id is not null and exists (
      select 1 from tasks t where t.id = s.focus_task_id and t.user_id = p_owner
        and (t.private or exists (select 1 from calendar_events sl where sl.id = t.slot_id and sl.private))
    ) then return null; end if;
    return jsonb_build_object('words', 'Focusing until ' || share_clock(s.focus_until, v_zone), 'source', 'auto', 'until', s.focus_until);
  end if;

  -- 4. the block's kind, from its Area by keyword (never its title)
  if v_has then
    v_kind := case
      when b.area ~* '\m(gym|fitness|workout|sport|training)' then 'gym'
      when b.area ~* '\m(class|school|stud(y|ies)|univers|college|lecture|course|exam|lab)' then 'class'
      when b.area ~* '\m(work|office|job)' then 'work' end;
    v_words := case v_kind when 'gym' then 'At the gym' when 'class' then 'In class' when 'work' then 'At work'
                 else 'Busy until ' || share_clock(b.ends_at, v_zone) end;
    return jsonb_build_object('words', v_words, 'source', 'auto', 'until', least(b.ends_at, b.starts_at + interval '24 hours'));
  end if;
  return null;
end $$;
revoke all on function share_status_core(uuid) from public, anon, authenticated;

-- The gate, in one place (the widget builder's function calls this one too): a connection, the lower level is Details, no pause,
-- and the owner turned status on for this person.
create or replace function share_status_for_viewer(p_owner uuid, p_viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_level text; v_paused timestamptz; v_on boolean;
begin
  if p_owner is null or p_viewer is null or p_owner = p_viewer then return null; end if;
  select share_lower(g1.level, g2.level), c.paused_until, om.status_on into v_level, v_paused, v_on
  from circles c
  join circle_members om on om.circle_id = c.id and om.user_id = p_owner
  join share_grants g1 on g1.circle_id = c.id and g1.owner_id = p_owner and g1.viewer_id = p_viewer
  join share_grants g2 on g2.circle_id = c.id and g2.owner_id = p_viewer and g2.viewer_id = p_owner
  limit 1;
  if v_level is distinct from 'details' or not coalesce(v_on, false) or (v_paused is not null and v_paused > now()) then return null; end if;
  return share_status_core(p_owner);
end $$;
revoke all on function share_status_for_viewer(uuid, uuid) from public, anon, authenticated;
grant execute on function share_status_for_viewer(uuid, uuid) to service_role;

-- The app: another person's status for me (null = none, whatever the reason: nothing says why).
create or replace function share_status_of(p_owner uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp as
$$ select share_status_for_viewer(p_owner, auth.uid()) $$;

-- Mine: my switches and what each person would see right now (the Now card's "Reem sees ... · auto").
create or replace function share_status_mine() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'auto', coalesce((select s.auto from share_status s where s.user_id = auth.uid()), true),
    'words', (select case when s.words_until > now() and s.words_set_at > now() - interval '24 hours' then s.words end from share_status s where s.user_id = auth.uid()),
    'words_until', (select case when s.words_until > now() and s.words_set_at > now() - interval '24 hours' then s.words_until end from share_status s where s.user_id = auth.uid()),
    'now', share_status_core(auth.uid()))
$$;

-- Own words and when they clear: 'hour', 'tonight' (the default: your quiet hours) or 'manual' (24 hours at most). No words = cleared.
create or replace function share_status_set(p_words text default null, p_clear text default 'tonight') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_words text := nullif(btrim(coalesce(p_words, '')), ''); v_until timestamptz;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_clear is null or p_clear not in ('hour', 'tonight', 'manual') then raise exception 'bad clear' using errcode = '22023'; end if;
  if v_words is not null and char_length(v_words) > 40 then raise exception 'too long' using errcode = '22023'; end if;
  if v_words is not null then
    v_until := least(case p_clear when 'hour' then now() + interval '1 hour' when 'tonight' then share_tonight(v_uid) else now() + interval '24 hours' end, now() + interval '24 hours');
  end if;
  insert into share_status (user_id, words, words_set_at, words_until) values (v_uid, v_words, case when v_words is not null then now() end, v_until)
  on conflict (user_id) do update set words = excluded.words, words_set_at = excluded.words_set_at, words_until = excluded.words_until;
end $$;

-- The owner's app is in an occurrence of a REPEATING block: which series row, and the occurrence's start and end. Only that, never words: the
-- server finds the area, the Private flag and the words itself. Null (or anything it can't use: not mine, not repeating, not native, trashed,
-- already over, longer than a day) clears it.
create or replace function share_status_block(p_event uuid default null, p_starts timestamptz default null, p_ends timestamptz default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_ok uuid;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_event is not null then
    select e.id into v_ok from calendar_events e
     where e.id = p_event and e.user_id = v_uid and e.source = 'native' and e.recurrence_rule is not null and e.deleted_at is null;
  end if;
  if v_ok is null or p_starts is null or p_ends is null or p_ends <= now() or p_ends <= p_starts or p_ends - p_starts > interval '24 hours' then
    update share_status set block_event_id = null where user_id = v_uid;
    return;
  end if;
  insert into share_status (user_id, block_event_id, block_starts, block_ends, block_set_at) values (v_uid, v_ok, p_starts, p_ends, now())
  on conflict (user_id) do update set block_event_id = excluded.block_event_id, block_starts = excluded.block_starts, block_ends = excluded.block_ends, block_set_at = excluded.block_set_at;
end $$;

-- "From the Now card": on by default; off = only own words are ever said.
create or replace function share_status_auto(p_on boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  insert into share_status (user_id, auto) values (auth.uid(), coalesce(p_on, true))
  on conflict (user_id) do update set auto = excluded.auto;
end $$;

-- The device's Focus round: until when, on which task. null (or a time already past) = the round is over.
create or replace function share_status_focus(p_until timestamptz, p_task uuid default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_task uuid;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_until is null or p_until <= now() then
    update share_status set focus_until = null where user_id = v_uid;
    return;
  end if;
  select t.id into v_task from tasks t where t.id = p_task and t.user_id = v_uid;
  insert into share_status (user_id, focus_until, focus_set_at, focus_task_id) values (v_uid, least(p_until, now() + interval '24 hours'), now(), v_task)
  on conflict (user_id) do update set focus_until = excluded.focus_until, focus_set_at = excluded.focus_set_at, focus_task_id = excluded.focus_task_id;
end $$;

revoke all on function share_status_on_set(uuid, boolean), share_notice_pref_set(uuid, text, text), share_notice_settings(), share_status_of(uuid), share_status_mine(),
  share_status_set(text, text), share_status_auto(boolean), share_status_focus(timestamptz, uuid), share_status_block(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function share_status_on_set(uuid, boolean), share_notice_pref_set(uuid, text, text), share_notice_settings(), share_status_of(uuid), share_status_mine(),
  share_status_set(text, text), share_status_auto(boolean), share_status_focus(timestamptz, uuid), share_status_block(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- NOTICES
-- ---------------------------------------------------------------------------------------------
create table if not exists share_notices (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]{0,31}$'),
  mode text not null check (mode in ('in_app', 'push')),
  group_key text not null,
  -- The MASKED payload, already at this recipient's level: { verb, what?, at? }. Rendered as "<name> <verb> <what>, <at>" by notify/copy.ts.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  n integer not null default 1,
  refs uuid[] not null default '{}',                 -- the items it is about, so a turned-Private or trashed item can take its notice back
  created_at timestamptz not null default now(),
  window_end timestamptz not null,                   -- created_at + 5 minutes: more of the same kind from the same person join until then
  release_at timestamptz not null,                   -- when it may be seen or sent: window_end, or when quiet hours end
  pushed_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz not null default now() + interval '1 day'
);
create index if not exists share_notices_recipient on share_notices (recipient_id, release_at) where dismissed_at is null;
create index if not exists share_notices_group on share_notices (recipient_id, circle_id, kind, group_key, window_end);
create index if not exists share_notices_refs on share_notices using gin (refs);
alter table share_notices enable row level security;
drop policy if exists share_notices_select on share_notices;
create policy share_notices_select on share_notices for select using (recipient_id = auth.uid());
drop policy if exists share_notices_dismiss on share_notices;
create policy share_notices_dismiss on share_notices for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke all on table share_notices from anon, authenticated;
grant select (id, circle_id, actor_id, kind, payload, n, created_at, release_at, expires_at, dismissed_at) on table share_notices to authenticated;
grant update (dismissed_at) on table share_notices to authenticated;

-- THE DOOR. p_detail is what Titles and Details may see, p_busy what Busy only may see; each recipient gets only the one their
-- level allows, and only when they switched this kind on. Not for the app's roles. Returns how many people were told.
create or replace function share_notice_emit(p_actor uuid, p_kind text, p_group text, p_detail jsonb, p_busy jsonb, p_ref uuid default null, p_skip_busy boolean default false) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_mode text; v_payload jsonb; v_id uuid; v_told int := 0; v_end timestamptz := now() + interval '5 minutes';
begin
  for r in
    select c.id as circle_id, m2.user_id as recipient, m2.notice_prefs as prefs, share_lower(g1.level, g2.level) as lvl
    from circle_members m1
    join circles c on c.id = m1.circle_id and (c.paused_until is null or c.paused_until <= now())
    join circle_members m2 on m2.circle_id = m1.circle_id and m2.user_id <> m1.user_id
    join share_grants g1 on g1.circle_id = c.id and g1.owner_id = p_actor and g1.viewer_id = m2.user_id
    join share_grants g2 on g2.circle_id = c.id and g2.owner_id = m2.user_id and g2.viewer_id = p_actor
    where m1.user_id = p_actor
  loop
    v_mode := r.prefs ->> p_kind;
    v_id := null;
    continue when v_mode is null or v_mode not in ('in_app', 'push');
    continue when p_skip_busy and r.lvl = 'busy';           -- something Busy-only wouldn't even show as a block
    v_payload := case when r.lvl = 'busy' then p_busy else p_detail end;
    -- the same kind from the same person within the 5 minutes folds into one notice
    update share_notices set n = n + 1, payload = v_payload, refs = case when p_ref is null then refs else array_append(refs, p_ref) end
     where id = (select g.id from share_notices g
                  where g.recipient_id = r.recipient and g.circle_id = r.circle_id and g.kind = p_kind and g.group_key = p_group
                    and g.window_end > now() and g.pushed_at is null and g.dismissed_at is null
                  order by g.created_at desc limit 1)
    returning id into v_id;
    if v_id is null then
      insert into share_notices (circle_id, actor_id, recipient_id, kind, mode, group_key, payload, refs, window_end, release_at)
      values (r.circle_id, p_actor, r.recipient, p_kind, v_mode, p_group, v_payload, case when p_ref is null then '{}' else array[p_ref] end, v_end, share_quiet_end(r.recipient, v_end));
    end if;
    v_told := v_told + 1;
  end loop;
  return v_told;
end $$;
revoke all on function share_notice_emit(uuid, text, text, jsonb, jsonb, uuid, boolean) from public, anon, authenticated;

-- A turned-Private or trashed item takes its (not yet dismissed) notices with it.
create or replace function share_notice_retract(p_item uuid) returns void language sql security definer set search_path = public, pg_temp as
$$ delete from share_notices where p_item = any(refs) and dismissed_at is null $$;
revoke all on function share_notice_retract(uuid) from public, anon, authenticated;

-- P1's events: "Reem added Dinner, Fri 8 PM". Titles and Details see the title, Busy only sees "something". Not Google or subscribed
-- imports (a feed lands hundreds), not all that is past, never anything Private (itself, its task, its series).
create or replace function share_notice_event() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then perform share_notice_retract(old.id); return null; end if;
  if tg_op = 'UPDATE' then
    if (new.private and not old.private) or (new.deleted_at is not null and old.deleted_at is null) then perform share_notice_retract(new.id); end if;
    return null;
  end if;
  if new.source <> 'native' or new.deleted_at is not null or new.private or new.ends_at < now() then return null; end if;
  if not exists (select 1 from circle_members m where m.user_id = new.user_id) then return null; end if;
  if exists (select 1 from tasks t where t.id = new.task_id and t.private) or exists (select 1 from calendar_events sr where sr.id = new.series_id and sr.private) then return null; end if;
  perform share_notice_emit(new.user_id, 'added', 'added',
    jsonb_build_object('verb', 'added', 'what', new.title, 'at', new.starts_at),
    jsonb_build_object('verb', 'added', 'what', 'something', 'at', new.starts_at), new.id, not coalesce(new.busy, true));
  return null;
end $$;
revoke all on function share_notice_event() from public, anon, authenticated;
drop trigger if exists calendar_events_share_notice on calendar_events;
create trigger calendar_events_share_notice after insert or update of private, deleted_at or delete on calendar_events for each row execute function share_notice_event();

-- A task turned Private takes the notices of its own blocks back.
create or replace function share_notice_task() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare e uuid;
begin
  for e in select id from calendar_events where task_id = new.id loop perform share_notice_retract(e); end loop;
  return null;
end $$;
revoke all on function share_notice_task() from public, anon, authenticated;
drop trigger if exists tasks_share_notice on tasks;
create trigger tasks_share_notice after update of private on tasks for each row when (new.private and not old.private) execute function share_notice_task();

-- For notify (service role only): the push notices that are due - released, not yet sent, not dismissed, not out of date.
create or replace function share_notices_due(p_limit int default 500)
returns table (id uuid, recipient_id uuid, actor_id uuid, actor_name text, kind text, payload jsonb, n integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.recipient_id, s.actor_id, share_name(s.actor_id), s.kind, s.payload, s.n
  from share_notices s
  where s.mode = 'push' and s.pushed_at is null and s.dismissed_at is null and s.release_at <= now() and s.expires_at > now()
  order by s.recipient_id, s.created_at
  limit p_limit
$$;
create or replace function share_notices_pushed(p_ids uuid[]) returns void language sql security definer set search_path = public, pg_temp as
$$ update share_notices set pushed_at = now() where id = any(p_ids) and pushed_at is null $$;
revoke all on function share_notices_due(int), share_notices_pushed(uuid[]) from public, anon, authenticated;
grant execute on function share_notices_due(int), share_notices_pushed(uuid[]) to service_role;

-- Every 5 minutes: push what is due (the notify function's 'share_notice' kind), as the weekly-review reminder does (0095).
select cron.schedule(
  'share-notices',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'share_notice')
  );
  $$
);
-- A week is as long as anything here is kept (a notice is shown for a day).
select cron.schedule('share-notices-prune', '23 3 * * *', $$delete from public.share_notices where created_at < now() - interval '7 days'$$);
