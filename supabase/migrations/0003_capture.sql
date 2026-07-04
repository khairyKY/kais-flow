-- P2 AI Capture: minimal app_settings singleton (confidence threshold only; the rest of this
-- table's columns belong to P4 and will be added there).

create table app_settings (
  id boolean primary key default true check (id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'Africa/Cairo',
  confidence_threshold real not null default 0.75,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
create policy "app_settings_all" on app_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_app_settings_updated_at before update on app_settings for each row execute function set_updated_at();

-- inbox_items needs a marker for offline captures awaiting AI parsing once back online.
-- (payload jsonb already exists from 0002; no column change needed — `payload->>'needs_parse'`.)
