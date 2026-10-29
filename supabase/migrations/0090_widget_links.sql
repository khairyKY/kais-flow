-- Desktop widgets (Rainmeter "Glass" skins, 2026-10-29): a per-user, read-only Widget link — a token in a
-- URL, pasted into a skin (Sukoon's pattern). It replaces the hourly kais-flow-export.ps1, which read the
-- service-role key from the repo. The `widget` edge function answers today's plan for the link's owner.
--
--   token_hash   SHA-256 hex of the token (`kf_w_` + 43 base64url chars). The raw token is shown once in
--                Settings → Windows desktop and never stored.
--   label        what the user called it ("Desktop", "Work PC") — one link per machine, revoked alone.
--   can_tick     "Allow ticking": the link may also complete a task (POST ?tick=<task id>). Off by default:
--                a link is read-only unless its owner says otherwise.
--   calls_hour / calls  the per-link hourly counter (the function's rate limit). Only the function writes
--                it — as the table owner, before it switches to the user's role; the column grants below
--                don't reach it, so a user can't reset their own count (mcp_keys' pattern, 0051).
--   revoked_at   set by Revoke. A revoked link answers 401; the row stays so "last used" is still there.
create table if not exists widget_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Desktop' check (char_length(label) between 1 and 60),
  can_tick boolean not null default false,
  calls_hour timestamptz,
  calls integer not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists widget_links_user on widget_links (user_id);

alter table widget_links enable row level security;
drop policy if exists widget_links_owner on widget_links;
create policy widget_links_owner on widget_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_widget_links_updated_at on widget_links;
create trigger set_widget_links_updated_at before update on widget_links
  for each row execute function set_updated_at();

-- Explicit grants (config.toml `auto_expose_new_tables` is off): the app lists its links, makes one, and
-- switches ticking / revokes. Never the hash back out, never the counter.
revoke all on table widget_links from anon, authenticated;
grant select (id, label, can_tick, last_used_at, revoked_at, created_at, updated_at) on table widget_links to authenticated;
grant insert (id, token_hash, label, can_tick) on table widget_links to authenticated;
grant update (label, can_tick, revoked_at) on table widget_links to authenticated;
