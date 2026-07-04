-- P3 Calendar & time-blocking: native calendar_events (source of truth for the UI) + integrations
-- (server-side only; unused until P3b Google connect, created now to avoid a throwaway migration).

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  task_id uuid references tasks(id) on delete cascade,
  source text not null default 'native' check (source in ('native', 'gcal')),
  gcal_id text,
  gcal_etag text,
  busy boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table calendar_events enable row level security;
create policy "calendar_events_all" on calendar_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_calendar_events_updated_at before update on calendar_events for each row execute function set_updated_at();
create index calendar_events_range_idx on calendar_events(starts_at, ends_at);
create index calendar_events_task_id_idx on calendar_events(task_id);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'github')),
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
alter table integrations enable row level security;
create policy "integrations_all" on integrations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_integrations_updated_at before update on integrations for each row execute function set_updated_at();

alter publication supabase_realtime add table calendar_events;
