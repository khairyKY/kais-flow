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

-- Retainer reload function
create or replace function reload_retainers()
returns void as $$
declare
  proj record;
  item jsonb;
  new_checklist jsonb;
begin
  for proj in select * from projects where type = 'retainer' and status = 'active' loop
    -- Reset all checklist items to completed = false
    new_checklist := '[]'::jsonb;
    if proj.checklist is not null and jsonb_array_length(proj.checklist) > 0 then
      for item in select * from jsonb_array_elements(proj.checklist) loop
        item := jsonb_set(item, '{completed}', 'false'::jsonb);
        new_checklist := new_checklist || item;
      end loop;
    end if;

    update projects set checklist = new_checklist, updated_at = now() where id = proj.id;

    -- Log activity
    insert into activity_log (id, user_id, event_type, entity_type, entity_id, payload, created_at)
    values (
      gen_random_uuid(),
      proj.user_id,
      'retainer.reloaded',
      'project',
      proj.id,
      jsonb_build_object('name', proj.name),
      now()
    );
  end loop;
end;
$$ language plpgsql security definer;

-- Schedule monthly retainer reload cron job (1st of month at 00:00 UTC)
select cron.unschedule('retainer-reload-monthly') where exists (select 1 from cron.job where jobname = 'retainer-reload-monthly');

select cron.schedule(
  'retainer-reload-monthly',
  '0 0 1 * *',
  $$select reload_retainers()$$
);

