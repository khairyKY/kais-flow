-- Your own calendar link (v1.6.4 F5): a private, read-only ICS feed of the user's own events, Time blocks and
-- scheduled tasks, pasted into Apple Calendar / Outlook / Google Calendar ("add calendar from URL"). Same shape
-- and rules as widget_links (0090); the `calendar-feed` edge function answers it.
--
--   token_hash     SHA-256 hex of the token (`kf_c_` + 43 base64url chars). The raw token is shown once in
--                  Settings → Calendar & time → Your calendar link and never stored.
--   label          what the user called it ("Phone", "Work laptop") — one link per calendar app, revoked alone.
--   include_tasks  "Include scheduled tasks": task blocks (and the tasks a Time block holds) are in the feed.
--   titles         "Show titles": off = every entry reads "Busy", with no description.
--   calls_hour / calls  the per-link hourly counter (the function's rate limit). Only the function writes it,
--                  as the table owner before it switches to the user's role; the grants below don't reach it.
--   revoked_at     set by Revoke. A revoked link answers 401; the row stays so "last used" is still there.
create table if not exists calendar_feed_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Calendar' check (char_length(label) between 1 and 60),
  include_tasks boolean not null default true,
  titles boolean not null default true,
  calls_hour timestamptz,
  calls integer not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_feed_links_user on calendar_feed_links (user_id);

alter table calendar_feed_links enable row level security;
drop policy if exists calendar_feed_links_owner on calendar_feed_links;
create policy calendar_feed_links_owner on calendar_feed_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_calendar_feed_links_updated_at on calendar_feed_links;
create trigger set_calendar_feed_links_updated_at before update on calendar_feed_links
  for each row execute function set_updated_at();

-- Explicit grants (config.toml `auto_expose_new_tables` is off): the app lists its links, makes one and revokes
-- it. Never the hash back out, never the counter.
revoke all on table calendar_feed_links from anon, authenticated;
grant select (id, label, include_tasks, titles, last_used_at, revoked_at, created_at, updated_at) on table calendar_feed_links to authenticated;
grant insert (id, token_hash, label, include_tasks, titles) on table calendar_feed_links to authenticated;
grant update (label, include_tasks, titles, revoked_at) on table calendar_feed_links to authenticated;
