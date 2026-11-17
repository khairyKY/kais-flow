-- Partner sharing, three changes to P1 (Kai 2026-11-18). All of it is the VIEWER's own preference on the viewer's own
-- circle_members row: the other side never reads it, and it never pings (a lane, a card or a colour is not something the
-- other person could see).
--
--   1. Two switches, not one: show_lane ("Show her lane on my calendar", 0100) and show_day ("Show her day on Today", new).
--      Default on for a Partner and off for Family / Friend, at connection time (share_invite_accept).
--   2. Her colour: `color`, one of palette C's 16 swatches (the day hex a block stores; BLOCK_SWATCHES in blockHue.ts), Heather
--      until picked. The check keeps it to those 16, so no other value ever reaches the client's CSS.
--   3. A pause has no automatic end by default. Nothing to change on the server: circles.paused_until already takes 'infinity'
--      (shared_day tests `paused_until > now()`, true forever); only the client's default changed.
-- Grants stay column-scoped as in 0100: the member row's select list is unchanged (the app reads these through share_connections,
-- mine only), and update is widened to exactly the two new columns.

alter table circle_members add column if not exists show_day boolean not null default false;
alter table circle_members add column if not exists color text not null default '#8972B3';
alter table circle_members drop constraint if exists circle_members_color_check;
alter table circle_members add constraint circle_members_color_check check (color in (
  '#E58F99', '#E29572', '#C9A658', '#A0B569', '#72BF8E', '#47BFC5', '#81ADED', '#B59CE3',
  '#B36670', '#B16C4C', '#9C7B31', '#768A42', '#4A9266', '#0D9298', '#5A81BC', '#8972B3'
));

-- P1 drew her card for a Partner always, and for Family / Friend when their lane was on: keep exactly that for what exists.
update circle_members m set show_day = true
from circles c
where c.id = m.circle_id and (c.relation = 'partner' or m.show_lane);

grant update (show_lane, show_day, color) on table circle_members to authenticated;

-- Accept: as 0100, plus the card's switch (both defaults follow the relation, Partner on).
create or replace function share_invite_accept(p_code text, p_level text default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_inv share_invites; v_circle uuid; v_default text; v_mine text; v_on boolean;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_level is not null and p_level not in ('busy', 'titles', 'details') then raise exception 'bad level' using errcode = '22023'; end if;
  if share_guard_blocked(v_uid) then return jsonb_build_object('ok', false, 'error', 'try_later'); end if;
  v_inv := share_invite_find(p_code, v_uid);
  if v_inv.id is null then perform share_guard_fail(v_uid); return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  if exists (select 1 from circle_members a join circle_members b on b.circle_id = a.circle_id and b.user_id = v_inv.created_by where a.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_connected');
  end if;
  update share_invites set used_at = now(), used_by = v_uid where id = v_inv.id and used_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  v_default := share_default_level(v_inv.relation);
  v_mine := coalesce(p_level, v_default);
  v_on := v_inv.relation = 'partner';
  insert into circles (relation, created_by) values (v_inv.relation, v_inv.created_by) returning id into v_circle;
  insert into circle_members (circle_id, user_id, show_lane, show_day) values (v_circle, v_inv.created_by, v_on, v_on), (v_circle, v_uid, v_on, v_on);
  insert into share_grants (circle_id, owner_id, viewer_id, level) values
    (v_circle, v_inv.created_by, v_uid, v_default),
    (v_circle, v_uid, v_inv.created_by, v_mine);
  return jsonb_build_object('ok', true, 'circle_id', v_circle);
end $$;
revoke all on function share_invite_accept(text, text) from public, anon;
grant execute on function share_invite_accept(text, text) to authenticated;

-- My connections: as 0100, plus MY two switches and MY colour for them (never the partner's: `me` is the caller's own row).
create or replace function share_connections() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'circle_id', c.id, 'relation', c.relation, 'partner_id', p.user_id, 'partner_name', share_name(p.user_id),
    'my_level', mine.level, 'their_level', theirs.level, 'level', share_lower(mine.level, theirs.level),
    'my_grant_id', mine.id, 'show_lane', me.show_lane, 'show_day', me.show_day, 'color', me.color, 'since', c.created_at,
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
revoke all on function share_connections() from public, anon;
grant execute on function share_connections() to authenticated;

-- The her-day widgets (0104) ask through share_widget_read, held by the VIEWER's key: add the colour THE VIEWER gave that person
-- (their own member row), so the Android snapshot and the Rainmeter feed draw it too. As 0104 otherwise, line for line.
create or replace function share_widget_read(p_hash text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l share_widget_links; v_circle uuid; v_paused timestamptz; v_level text; v_zone text; v_vzone text; v_today date; v_from timestamptz; v_to timestamptz; v_color text;
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
  select m.color into v_color from circle_members m where m.circle_id = v_circle and m.user_id = l.user_id;

  select s.timezone into v_zone from app_settings s where s.user_id = l.owner_id;
  if v_zone is null or not exists (select 1 from pg_timezone_names n where n.name = v_zone) then v_zone := 'Africa/Cairo'; end if;
  select s.timezone into v_vzone from app_settings s where s.user_id = l.user_id;
  if v_vzone is null or not exists (select 1 from pg_timezone_names n where n.name = v_vzone) then v_vzone := 'Africa/Cairo'; end if;

  if v_paused is not null and v_paused > now() then
    return jsonb_build_object('status', 'paused', 'name', share_name(l.owner_id), 'paused_until', v_paused, 'zone', v_vzone, 'color', v_color);
  end if;

  v_today := (now() at time zone v_zone)::date;
  v_from := v_today::timestamp at time zone v_zone;
  v_to := (v_today + 2)::timestamp at time zone v_zone;
  return jsonb_build_object('status', 'ok', 'name', share_name(l.owner_id), 'level', v_level, 'zone', v_vzone, 'owner_zone', v_zone, 'color', v_color,
    'from', v_from, 'to', v_to, 'data', share_day_data(l.owner_id, v_level, v_from, v_to));
end $$;
revoke all on function share_widget_read(text) from public, anon, authenticated;
