-- Migration: 0020_projects_perennials.sql
-- Add color, target_date, milestones, checklist, engagement_model columns to projects
alter table projects add column color text;
alter table projects add column target_date timestamptz;
alter table projects add column milestones jsonb not null default '[]'::jsonb;
alter table projects add column checklist jsonb not null default '[]'::jsonb;
alter table projects add column engagement_model text;

-- Add milestone_id and paused columns to tasks
alter table tasks add column milestone_id uuid;
alter table tasks add column paused boolean not null default false;

-- Create time_entries table
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  note text,
  duration_min int not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on time_entries
alter table time_entries enable row level security;
create policy "time_entries_owner" on time_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add updated_at trigger for time_entries
create trigger set_time_entries_updated_at
  before update on time_entries
  for each row execute function set_updated_at();

-- Add time_entries to Supabase realtime publication
alter publication supabase_realtime add table time_entries;
