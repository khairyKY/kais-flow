-- Her-day widget key (v1.6.6, partner sharing P2; design-export/Partner sharing P2 flows.html flow 6): a key for the Rainmeter
-- skin that shows ONE connected person's day, at the level you both allow, and nothing else.
--
-- It is its own kind of key, not a second use of the Widget link (widget_links, 0090): that link reads the holder's OWN plan
-- and may tick tasks. This one is held by the VIEWER (user_id) and names whose day it shows (owner_id). The `widget` function
-- cannot see it (its own table, and a different prefix, `kf_p_`), and `share-widget` cannot see a Widget link. Everything it
-- can ever return is built by share_widget_read() below from share_day_data() (0100), the same masked reader the app's lane
-- and the view link use: no title and no kind at Busy or for anything Private, Top 3 and tasks only at Details, never a raw row.
--
-- The connection is read live on every call, so a pause, a lowered level or a disconnect applies on the very next refresh:
--   paused           {status: 'paused'}: the name and when it ends, no blocks
--   level lowered    the next answer is masked to the lower level
--   disconnected     {status: 'gone'}, and the key is stopped for good (revoked_at); connecting again does not bring it back
--   key stopped      {status: 'revoked'}: the holder pressed Stop, or a disconnect did it
--
--   token_hash   SHA-256 hex of the token (`kf_p_` + 43 base64url chars); shown once in Settings, never stored
--   calls_hour / calls   the per-key hourly counter, only the function writes it (as widget_links)
create table if not exists share_widget_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Desktop' check (char_length(label) between 1 and 60),
  calls_hour timestamptz,
  calls integer not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id <> owner_id)
);
create index if not exists share_widget_links_user on share_widget_links (user_id);
create index if not exists share_widget_links_owner on share_widget_links (owner_id);

-- A stopped key stays stopped: only the label can change after revoked_at is set, and revoked_at can't go back to null.
create or replace function share_widget_links_guard() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if old.revoked_at is not null then new.revoked_at := old.revoked_at; end if;
  return new;
end $$;
drop trigger if exists share_widget_links_guard on share_widget_links;
create trigger share_widget_links_guard before update on share_widget_links for each row execute function share_widget_links_guard();

-- Am I connected with this person? (for the insert check: a key can only be made for someone you share with)
create or replace function share_connected(p_other uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from circle_members a join circle_members b on b.circle_id = a.circle_id and b.user_id = p_other where a.user_id = auth.uid() and a.user_id <> p_other) $$;
revoke all on function share_connected(uuid) from public, anon;
grant execute on function share_connected(uuid) to authenticated;

alter table share_widget_links enable row level security;
drop policy if exists share_widget_links_select on share_widget_links;
create policy share_widget_links_select on share_widget_links for select using (user_id = auth.uid());
drop policy if exists share_widget_links_insert on share_widget_links;
create policy share_widget_links_insert on share_widget_links for insert with check (user_id = auth.uid() and share_connected(owner_id));
drop policy if exists share_widget_links_update on share_widget_links;
create policy share_widget_links_update on share_widget_links for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table share_widget_links from anon, authenticated;
grant select (id, owner_id, label, last_used_at, revoked_at, created_at, updated_at) on table share_widget_links to authenticated;
grant insert (id, owner_id, token_hash, label) on table share_widget_links to authenticated;
grant update (label, revoked_at) on table share_widget_links to authenticated;

-- A disconnect stops every key between the two people, both ways, before the rows go (a cascade deletes the members one by one,
-- so the first row's trigger still sees the other). The live check below would already answer 'gone'; this makes it permanent.
create or replace function share_widget_links_cut() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update share_widget_links l set revoked_at = now()
  where l.revoked_at is null and (
    (l.user_id = old.user_id and l.owner_id in (select m.user_id from circle_members m where m.circle_id = old.circle_id and m.user_id <> old.user_id))
    or (l.owner_id = old.user_id and l.user_id in (select m.user_id from circle_members m where m.circle_id = old.circle_id and m.user_id <> old.user_id)));
  return old;
end $$;
revoke all on function share_widget_links_cut() from public, anon, authenticated;
drop trigger if exists circle_members_widget_cut on circle_members;
create trigger circle_members_widget_cut before delete on circle_members for each row execute function share_widget_links_cut();

-- ---------------------------------------------------------------------------------------------
-- What the `share-widget` function asks: the key's hash in, one answer out. No app role can call it. It counts the call (60 an
-- hour: the skin asks 12), checks the key, then the connection exactly as shared_day does (the lower of both grants, the pause),
-- and only then reads share_day_data for the person the KEY names: today and tomorrow on their clock. Nothing of the holder's own.
-- ---------------------------------------------------------------------------------------------
create or replace function share_widget_read(p_hash text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l share_widget_links; v_circle uuid; v_paused timestamptz; v_level text; v_zone text; v_vzone text; v_today date; v_from timestamptz; v_to timestamptz;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'unauthorized'); end if;
  update share_widget_links set calls = case when calls_hour = date_trunc('hour', now()) then calls + 1 else 1 end,
    calls_hour = date_trunc('hour', now()), last_used_at = now()
  where token_hash = p_hash
  returning * into l;
  if l.id is null then return jsonb_build_object('status', 'unauthorized'); end if;
  if l.calls > 60 then return jsonb_build_object('status', 'rate_limited'); end if;  -- the count still commits
  if l.revoked_at is not null then return jsonb_build_object('status', 'revoked'); end if;

  select c.id, c.paused_until, share_lower(g1.level, g2.level) into v_circle, v_paused, v_level
  from circles c
  join share_grants g1 on g1.circle_id = c.id and g1.owner_id = l.owner_id and g1.viewer_id = l.user_id
  join share_grants g2 on g2.circle_id = c.id and g2.owner_id = l.user_id and g2.viewer_id = l.owner_id
  limit 1;
  if v_circle is null then
    update share_widget_links set revoked_at = now() where id = l.id;
    return jsonb_build_object('status', 'gone');
  end if;

  select s.timezone into v_zone from app_settings s where s.user_id = l.owner_id;
  if v_zone is null or not exists (select 1 from pg_timezone_names n where n.name = v_zone) then v_zone := 'Africa/Cairo'; end if;
  select s.timezone into v_vzone from app_settings s where s.user_id = l.user_id;
  if v_vzone is null or not exists (select 1 from pg_timezone_names n where n.name = v_vzone) then v_vzone := 'Africa/Cairo'; end if;

  if v_paused is not null and v_paused > now() then
    return jsonb_build_object('status', 'paused', 'name', share_name(l.owner_id), 'paused_until', v_paused, 'zone', v_vzone);
  end if;

  v_today := (now() at time zone v_zone)::date;
  v_from := v_today::timestamp at time zone v_zone;
  v_to := (v_today + 2)::timestamp at time zone v_zone;
  return jsonb_build_object('status', 'ok', 'name', share_name(l.owner_id), 'level', v_level, 'zone', v_vzone, 'owner_zone', v_zone,
    'from', v_from, 'to', v_to, 'data', share_day_data(l.owner_id, v_level, v_from, v_to));
end $$;
revoke all on function share_widget_read(text) from public, anon, authenticated;
