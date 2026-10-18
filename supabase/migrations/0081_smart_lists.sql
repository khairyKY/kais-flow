-- Smart lists (Kai 2026-10-17, "build smart lists"): a saved filter — "work tasks under 30 min this
-- week" — that sits in the sidebar's Plan group with its count, like Due Today / This Week. One row per
-- list. `filter` is the conditions as jsonb, read by supabase/functions/_shared/smartList.ts readFilter
-- (shared by the app and the MCP; malformed keys are dropped, never an error):
--   { places?: uuid[] (projects / areas / domains, any of), labels?: text[] (any of),
--     priority?: 1|2|3 (at least: 3 = !, 1 = !!!), when?: ('overdue'|'today'|'week'|'next7'|'none'|'someday')[],
--     length?: 15|30|60|'none', planned?: bool, text?: text, show_done?: bool }
-- `position` is its place in the sidebar (⋯ → Move up / down). Delete is soft (`deleted_at`) so the
-- app's Undo — and another device, through Realtime — sees it; the rows never reach Trash.
-- Written through the outbox (client-made ids); read by the MCP's `smart_lists` and list_tasks.

create table if not exists smart_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  icon text,
  filter jsonb not null default '{}'::jsonb,
  position int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_smart_lists_user on smart_lists(user_id);

alter table smart_lists enable row level security;
drop policy if exists smart_lists_owner on smart_lists;
create policy smart_lists_owner on smart_lists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_smart_lists_updated_at on smart_lists;
create trigger set_smart_lists_updated_at before update on smart_lists
  for each row execute function set_updated_at();

-- New tables are not auto-exposed to the Data API roles (config.toml auto_expose_new_tables, 0051).
grant select, insert, update, delete on table smart_lists to authenticated;

-- The app subscribes to it (lib/realtime.ts), so an edit on the phone shows on the laptop.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'smart_lists') then
    alter publication supabase_realtime add table smart_lists;
  end if;
end $$;
