-- Sharing with people you connect (v1.6.6, partner sharing P1; design-export/Partner sharing flows.html).
-- The first place where one user can see another's data, so every rule below is on the server:
--
--   * NO policy anywhere lets a viewer select the owner's raw rows. tasks and calendar_events stay `user_id = auth.uid()`.
--   * A viewer reads another person only through the security-definer functions here (shared_day), which check the
--     connection, the lower of the two levels, the pause, and return MASKED columns only: a Busy block has no title and no
--     kind; a Private item is a Busy block at every level; journal, health, people and AI chat are not read by any function
--     in this file (they are not in the code at all - supabase/tests/sharing.sh greps the function bodies for it).
--   * The no-account view link (`share_links`, `share-view` function) calls the same share_day_data() the app's lane does.
--
-- N-person ready: a circle is a set of members; a grant is one owner showing one viewer at a level (an ordered pair), so a
-- family circle later is more rows, not a new shape. P1 makes only pair circles (one per two people).
--
--   circles          kind ('pair'), relation (partner | family | friend: a label and the start of the defaults),
--                    paused_until (either side may pause for both; 'infinity' = until turned back on), paused_by
--   circle_members   (circle, user) + show_lane (this member's "Show on my calendar", chosen by the viewer)
--   share_grants     owner_id shows viewer_id at `level`, picked by the owner alone; the effective level either way is the
--                    lower of the two grants ("You see what you show")
--   share_invites    the 8-character code (A-Z and 2-9 without 0/O/1/I), one use, 24 hours, made and cancelled by its creator
--   share_attempts   wrong-code counter (5 wrong tries = 15 minutes); no client grants
--   share_links      the no-account link: token_hash like calendar_feed_links (0096), Busy or Titles only, 30 days, renewable
--   share_pings      ONE row per user with a timestamp: "something you can see changed". The only Realtime table of this
--                    feature; it never holds or carries a task, an event or a title (see the DATA_MODEL note).
--
-- plus `private boolean` on calendar_events and tasks (the Private switch in the item's sheet).

alter table calendar_events add column if not exists private boolean not null default false;
alter table tasks add column if not exists private boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- The level order and the one defaults rule.
-- ---------------------------------------------------------------------------------------------
create or replace function share_rank(l text) returns int language sql immutable as
$$ select case l when 'busy' then 1 when 'titles' then 2 when 'details' then 3 end $$;

create or replace function share_lower(a text, b text) returns text language sql immutable as
$$ select case when share_rank(a) <= share_rank(b) then a else b end $$;

-- Partner = Details, Family = Titles, Friend = Busy only (Kai 2026-10-29).
create or replace function share_default_level(rel text) returns text language sql immutable as
$$ select case rel when 'partner' then 'details' when 'family' then 'titles' else 'busy' end $$;

-- ---------------------------------------------------------------------------------------------
-- circles, circle_members, share_grants
-- ---------------------------------------------------------------------------------------------
create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'pair' check (kind in ('pair', 'group')),
  relation text not null default 'partner' check (relation in ('partner', 'family', 'friend')),
  paused_until timestamptz,
  paused_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  show_lane boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circle_id, user_id)
);
create index if not exists circle_members_user on circle_members (user_id);

create table if not exists share_grants (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null,
  owner_id uuid not null,
  viewer_id uuid not null,
  level text not null check (level in ('busy', 'titles', 'details')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circle_id, owner_id, viewer_id),
  check (owner_id <> viewer_id),
  foreign key (circle_id, owner_id) references circle_members (circle_id, user_id) on delete cascade,
  foreign key (circle_id, viewer_id) references circle_members (circle_id, user_id) on delete cascade
);
create index if not exists share_grants_viewer on share_grants (viewer_id);

-- A pair that has fewer than two members is over: the leaving (or deleted) person's rows go, and so does the circle.
create or replace function share_circle_gc() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from circles c where c.id = old.circle_id and (select count(*) from circle_members m where m.circle_id = c.id) < 2;
  return null;
end $$;
drop trigger if exists circle_members_gc on circle_members;
create trigger circle_members_gc after delete on circle_members for each row execute function share_circle_gc();

create or replace function share_is_member(p_circle uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from circle_members m where m.circle_id = p_circle and m.user_id = auth.uid()) $$;
revoke all on function share_is_member(uuid) from public, anon;
grant execute on function share_is_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- share_pings: the narrow Realtime signal. One row per user, a timestamp only. share_bump(owner) is called by the triggers
-- below after any write the owner's connections could see; the viewers' clients then re-ask shared_day (masked). Nothing
-- of the change is in the row or in the message: not an id, not a title, not who changed what.
-- ---------------------------------------------------------------------------------------------
create table if not exists share_pings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default clock_timestamp()
);

create or replace function share_bump(p_owner uuid) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into share_pings (user_id, at)
  select m2.user_id, max(clock_timestamp())
  from circle_members m1
  join circle_members m2 on m2.circle_id = m1.circle_id and m2.user_id <> m1.user_id
  join circles c on c.id = m1.circle_id
  where m1.user_id = p_owner and (c.paused_until is null or c.paused_until <= now())
    and exists (select 1 from auth.users u where u.id = m2.user_id)
  group by m2.user_id
  on conflict (user_id) do update set at = excluded.at
$;
revoke all on function share_bump(uuid) from public, anon, authenticated;

-- Everyone in a circle, paused or not: for the circle's own changes (a level, a pause, a leave).
create or replace function share_bump_circle(p_circle uuid) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into share_pings (user_id, at)
  select m.user_id, clock_timestamp() from circle_members m
  where m.circle_id = p_circle and exists (select 1 from auth.users u where u.id = m.user_id)
  on conflict (user_id) do update set at = excluded.at
$$;
revoke all on function share_bump_circle(uuid) from public, anon, authenticated;

create or replace function share_ping_item() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A write to something that is and stays Private tells nobody anything.
  if tg_op = 'DELETE' then
    if old.private then return null; end if;
    perform share_bump(old.user_id);
  else
    if new.private and (tg_op = 'INSERT' or old.private) then return null; end if;
    perform share_bump(new.user_id);
  end if;
  return null;
end $$;
revoke all on function share_ping_item() from public, anon, authenticated;
drop trigger if exists calendar_events_share_ping on calendar_events;
create trigger calendar_events_share_ping after insert or update or delete on calendar_events for each row execute function share_ping_item();
drop trigger if exists tasks_share_ping on tasks;
create trigger tasks_share_ping after insert or update or delete on tasks for each row execute function share_ping_item();

create or replace function share_ping_circle() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform share_bump_circle(case when tg_table_name = 'circles' then new.id else new.circle_id end);
  return null;
end $$;
revoke all on function share_ping_circle() from public, anon, authenticated;
-- A leave tells the other side BEFORE the rows go (the cascade would empty the members first).
create or replace function share_ping_circle_leave() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform share_bump_circle(old.id);
  return old;
end $$;
revoke all on function share_ping_circle_leave() from public, anon, authenticated;
drop trigger if exists circles_share_ping on circles;
create trigger circles_share_ping after update on circles for each row execute function share_ping_circle();
drop trigger if exists circles_share_ping_leave on circles;
create trigger circles_share_ping_leave before delete on circles for each row execute function share_ping_circle_leave();
drop trigger if exists share_grants_share_ping on share_grants;
create trigger share_grants_share_ping after insert or update on share_grants for each row execute function share_ping_circle();

-- Who paused; and updated_at. A pause is the circle's, cut both ways.
create or replace function circles_before_update() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.paused_until is distinct from old.paused_until then
    new.paused_by := case when new.paused_until is null then null else auth.uid() end;
  end if;
  return new;
end $$;
drop trigger if exists circles_before_update on circles;
create trigger circles_before_update before update on circles for each row execute function circles_before_update();
drop trigger if exists set_circle_members_updated_at on circle_members;
create trigger set_circle_members_updated_at before update on circle_members for each row execute function set_updated_at();
drop trigger if exists set_share_grants_updated_at on share_grants;
create trigger set_share_grants_updated_at before update on share_grants for each row execute function set_updated_at();

-- RLS + explicit grants (config.toml auto_expose_new_tables is off).
alter table circles enable row level security;
alter table circle_members enable row level security;
alter table share_grants enable row level security;
alter table share_pings enable row level security;

drop policy if exists circles_member_select on circles;
create policy circles_member_select on circles for select using (share_is_member(id));
drop policy if exists circles_member_update on circles;
create policy circles_member_update on circles for update using (share_is_member(id)) with check (share_is_member(id));
drop policy if exists circles_member_delete on circles;
create policy circles_member_delete on circles for delete using (share_is_member(id));

drop policy if exists circle_members_select on circle_members;
create policy circle_members_select on circle_members for select using (share_is_member(circle_id));
drop policy if exists circle_members_update on circle_members;
create policy circle_members_update on circle_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists share_grants_select on share_grants;
create policy share_grants_select on share_grants for select using (share_is_member(circle_id));
-- The owner's own grant, outbox-able (offline "show less"): insert only for a pair already in a circle together (the FKs), and
-- only as the owner. accept creates both grants; this keeps an offline upsert's INSERT half legal.
drop policy if exists share_grants_insert on share_grants;
create policy share_grants_insert on share_grants for insert with check (owner_id = auth.uid());
drop policy if exists share_grants_update on share_grants;
create policy share_grants_update on share_grants for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists share_pings_select on share_pings;
create policy share_pings_select on share_pings for select using (user_id = auth.uid());

revoke all on table circles, circle_members, share_grants, share_pings from anon, authenticated;
grant select on table circles to authenticated;
grant update (relation, paused_until) on table circles to authenticated;
grant delete on table circles to authenticated;
grant select (id, circle_id, user_id, created_at) on table circle_members to authenticated;
grant update (show_lane) on table circle_members to authenticated;
grant select on table share_grants to authenticated;
grant insert (id, circle_id, owner_id, viewer_id, level) on table share_grants to authenticated;
grant update (level) on table share_grants to authenticated;
grant select on table share_pings to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'share_pings') then
    alter publication supabase_realtime add table share_pings;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Invites: the 8-character code. Made by its creator only; accepted through share_invite_accept only.
-- ---------------------------------------------------------------------------------------------
create table if not exists share_invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  relation text not null default 'partner' check (relation in ('partner', 'family', 'friend')),
  expires_at timestamptz not null default now() + interval '24 hours',
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists share_invites_creator on share_invites (created_by);
drop trigger if exists set_share_invites_updated_at on share_invites;
create trigger set_share_invites_updated_at before update on share_invites for each row execute function set_updated_at();
alter table share_invites enable row level security;
drop policy if exists share_invites_owner on share_invites;
create policy share_invites_owner on share_invites for select using (created_by = auth.uid());
drop policy if exists share_invites_cancel on share_invites;
create policy share_invites_cancel on share_invites for update using (created_by = auth.uid() and used_at is null) with check (created_by = auth.uid());
revoke all on table share_invites from anon, authenticated;
grant select on table share_invites to authenticated;
grant update (cancelled_at) on table share_invites to authenticated;

-- Wrong-code counter. Only the functions below touch it.
create table if not exists share_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fails int not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz
);
alter table share_attempts enable row level security;
revoke all on table share_attempts from anon, authenticated;

-- One display name per person: the name they chose in onboarding, else nothing the other side could guess from.
create or replace function share_name(p_user uuid) returns text language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce(nullif(btrim(s.display_name), ''), 'Someone') from (select 1) x left join app_settings s on s.user_id = p_user $$;
revoke all on function share_name(uuid) from public, anon, authenticated;

create or replace function share_code_clean(p_code text) returns text language sql immutable as
$$ select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- A new code: 8 symbols of 32, each from a fresh random byte (256 / 32: no bias). At most five waiting at a time.
create or replace function share_invite_create(p_relation text default 'partner') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_code text; v_row share_invites;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_relation not in ('partner', 'family', 'friend') then raise exception 'bad relation' using errcode = '22023'; end if;
  if (select count(*) from share_invites i where i.created_by = v_uid and i.used_at is null and i.cancelled_at is null and i.expires_at > now()) >= 5 then
    raise exception 'too many waiting invites' using errcode = '54000';
  end if;
  loop
    select string_agg(substr(v_alpha, 1 + (get_byte(uuid_send(gen_random_uuid()), 0) % 32), 1), '') into v_code from generate_series(1, 8);
    exit when not exists (select 1 from share_invites i where i.code = v_code);
  end loop;
  insert into share_invites (created_by, code, relation) values (v_uid, v_code, p_relation) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'code', v_row.code, 'relation', v_row.relation, 'expires_at', v_row.expires_at);
end $$;

-- The wrong-try rule: five wrong codes within 15 minutes block this account for 15 minutes. The functions that count return a
-- result instead of raising, so the count commits.
create or replace function share_guard_blocked(p_uid uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce((select a.blocked_until > now() from share_attempts a where a.user_id = p_uid), false) $$;
revoke all on function share_guard_blocked(uuid) from public, anon, authenticated;

create or replace function share_guard_fail(p_uid uuid) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into share_attempts (user_id, fails, window_start) values (p_uid, 1, now())
  on conflict (user_id) do update set
    fails = case when share_attempts.window_start < now() - interval '15 minutes' or share_attempts.blocked_until <= now() then 1 else share_attempts.fails + 1 end,
    window_start = case when share_attempts.window_start < now() - interval '15 minutes' or share_attempts.blocked_until <= now() then now() else share_attempts.window_start end,
    blocked_until = case
      when share_attempts.window_start < now() - interval '15 minutes' or share_attempts.blocked_until <= now() then null
      when share_attempts.fails + 1 >= 5 then now() + interval '15 minutes'
      else share_attempts.blocked_until end
$$;
revoke all on function share_guard_fail(uuid) from public, anon, authenticated;

-- The invite behind a code, if it is still good: not used, not cancelled, not expired, not mine.
create or replace function share_invite_find(p_code text, p_uid uuid) returns share_invites language sql stable security definer set search_path = public, pg_temp as $$
  select i.* from share_invites i
  where i.code = share_code_clean(p_code) and i.used_at is null and i.cancelled_at is null and i.expires_at > now() and i.created_by <> p_uid
$$;
revoke all on function share_invite_find(text, uuid) from public, anon, authenticated;

-- Peek: who invited me, and as what. The confirm screen. One answer for every kind of bad code.
create or replace function share_invite_peek(p_code text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_inv share_invites;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if share_guard_blocked(v_uid) then return jsonb_build_object('ok', false, 'error', 'try_later'); end if;
  v_inv := share_invite_find(p_code, v_uid);
  if v_inv.id is null then perform share_guard_fail(v_uid); return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  return jsonb_build_object('ok', true, 'from_name', share_name(v_inv.created_by), 'relation', v_inv.relation,
    'level', share_default_level(v_inv.relation), 'expires_at', v_inv.expires_at);
end $$;

-- Accept: the circle, both members, both grants at the relation's default (the accepter may start lower), the invite used.
create or replace function share_invite_accept(p_code text, p_level text default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_inv share_invites; v_circle uuid; v_default text; v_mine text; v_lane boolean;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_level is not null and p_level not in ('busy', 'titles', 'details') then raise exception 'bad level' using errcode = '22023'; end if;
  if share_guard_blocked(v_uid) then return jsonb_build_object('ok', false, 'error', 'try_later'); end if;
  v_inv := share_invite_find(p_code, v_uid);
  if v_inv.id is null then perform share_guard_fail(v_uid); return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  if exists (select 1 from circle_members a join circle_members b on b.circle_id = a.circle_id and b.user_id = v_inv.created_by where a.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_connected');
  end if;
  -- Taken now: a second accept of the same code (two phones, a double tap) finds it used.
  update share_invites set used_at = now(), used_by = v_uid where id = v_inv.id and used_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  v_default := share_default_level(v_inv.relation);
  v_mine := coalesce(p_level, v_default);
  v_lane := v_inv.relation = 'partner';
  insert into circles (relation, created_by) values (v_inv.relation, v_inv.created_by) returning id into v_circle;
  insert into circle_members (circle_id, user_id, show_lane) values (v_circle, v_inv.created_by, v_lane), (v_circle, v_uid, v_lane);
  insert into share_grants (circle_id, owner_id, viewer_id, level) values
    (v_circle, v_inv.created_by, v_uid, v_default),
    (v_circle, v_uid, v_inv.created_by, v_mine);
  return jsonb_build_object('ok', true, 'circle_id', v_circle);
end $$;

-- ---------------------------------------------------------------------------------------------
-- My connections: one read for the app. Names come from here (the table grants don't reach the partner's settings).
-- ---------------------------------------------------------------------------------------------
create or replace function share_connections() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'circle_id', c.id, 'relation', c.relation, 'partner_id', p.user_id, 'partner_name', share_name(p.user_id),
    'my_level', mine.level, 'their_level', theirs.level, 'level', share_lower(mine.level, theirs.level),
    'my_grant_id', mine.id, 'show_lane', me.show_lane, 'since', c.created_at,
    'paused_until', case when c.paused_until > now() then c.paused_until end,
    'paused_by_me', c.paused_until > now() and c.paused_by = auth.uid()
  ) order by c.created_at), '[]'::jsonb)
  from circle_members me
  join circles c on c.id = me.circle_id
  join circle_members p on p.circle_id = c.id and p.user_id <> me.user_id
  join share_grants mine on mine.circle_id = c.id and mine.owner_id = me.user_id and mine.viewer_id = p.user_id
  join share_grants theirs on theirs.circle_id = c.id and theirs.owner_id = p.user_id and theirs.viewer_id = me.user_id
  where me.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------------------------
-- THE MASK. Everything another person can ever see of an owner's day is built here and nowhere else.
--   share_day_data(owner, level, from, to): the app's lane / card (via shared_day) and the view link (the share-view
--   function) both call it; it is not callable by the app's roles, only by the functions that checked who is asking.
-- Reads calendar_events and tasks. Not the journal, health, people, interactions, chat or anything else, by construction.
-- ---------------------------------------------------------------------------------------------
create or replace function share_day_data(p_owner uuid, p_level text, p_from timestamptz, p_to timestamptz) returns jsonb
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
revoke all on function share_day_data(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

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
  return share_day_data(p_owner, v_level, p_from, p_to);
end $$;

revoke all on function share_invite_create(text), share_invite_peek(text), share_invite_accept(text, text), share_connections(), shared_day(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function share_invite_create(text), share_invite_peek(text), share_invite_accept(text, text), share_connections(), shared_day(uuid, timestamptz, timestamptz) to authenticated;
revoke all on function share_code_clean(text), share_invite_find(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The no-account link. Same shape and rules as calendar_feed_links (0096): the app makes the token (`kf_v_` + 43 base64url
-- chars), shows it once and stores only its SHA-256. Busy or Titles - Details is not offered on a link. 30 days, renewable.
-- ---------------------------------------------------------------------------------------------
create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  level text not null default 'busy' check (level in ('busy', 'titles')),
  expires_at timestamptz not null default now() + interval '30 days',
  calls_hour timestamptz,
  calls integer not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists share_links_user on share_links (user_id);
alter table share_links enable row level security;
drop policy if exists share_links_owner on share_links;
create policy share_links_owner on share_links for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Renew = push expires_at out; never past 30 days from now, whatever the client sends.
create or replace function share_links_clamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.expires_at is distinct from old.expires_at then new.expires_at := least(new.expires_at, now() + interval '30 days'); end if;
  return new;
end $$;
drop trigger if exists share_links_clamp on share_links;
create trigger share_links_clamp before update on share_links for each row execute function share_links_clamp();

revoke all on table share_links from anon, authenticated;
grant select (id, level, expires_at, last_used_at, revoked_at, created_at, updated_at) on table share_links to authenticated;
grant insert (id, token_hash, level) on table share_links to authenticated;
grant update (level, expires_at, revoked_at) on table share_links to authenticated;
