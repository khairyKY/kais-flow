-- Migration: 0024_time_entries.sql
-- Ensure time_entries table has proper indexes, and seed sample project, tasks, and time entries for existing users

-- 1. Create indexes for time_entries
create index if not exists time_entries_user_id_idx on time_entries (user_id);
create index if not exists time_entries_project_id_idx on time_entries (project_id);
create index if not exists time_entries_task_id_idx on time_entries (task_id);
create index if not exists time_entries_started_at_idx on time_entries (started_at);

-- 2. Seed data
do $$
declare
  u record;
  proj_id uuid := '88888888-8888-8888-8888-888888888888';
  task_id uuid := '99999999-9999-9999-9999-999999999999';
  domain_id uuid;
begin
  for u in select id from auth.users loop
    -- Get or create a domain to put the project in
    select id into domain_id from domains where user_id = u.id order by sort_order limit 1;
    
    if domain_id is null then
      domain_id := gen_random_uuid();
      insert into domains (id, user_id, name, color, sort_order)
      values (domain_id, u.id, 'Work', '#8A9A7E', 1)
      on conflict do nothing;
    end if;

    -- Seed "Forecasting App" project
    insert into projects (id, user_id, domain_id, name, type, status, color, target_date, milestones, checklist)
    values (
      proj_id,
      u.id,
      domain_id,
      'Forecasting App',
      'standard',
      'active',
      '#7a946e', -- Sage green color matching chip/text styling
      now() + interval '30 days',
      '[{"id": "m1", "title": "Draft cohort model", "weight": 40, "completed": false}, {"id": "m2", "title": "Implement forecasting logic", "weight": 60, "completed": false}]'::jsonb,
      '[{"id": "c1", "title": "Draft the cohort model", "type": "one-shot", "completed": false}]'::jsonb
    )
    on conflict do nothing;

    -- Seed "Plan & implement forecasting logic" task
    insert into tasks (id, user_id, project_id, domain_id, title, notes, status, due_at, top3, duration_min, someday)
    values (
      task_id,
      u.id,
      proj_id,
      domain_id,
      'Plan & implement forecasting logic',
      'Subtask 2 of 3 · draft the cohort model',
      'todo',
      now(),
      true, -- Top 3 (starred)
      25,   -- 25 min duration
      false
    )
    on conflict do nothing;

    -- Seed time entries for today to reach 4h 30m (270 min)
    -- Entry 1: 120 min
    insert into time_entries (id, user_id, project_id, task_id, note, duration_min, started_at, ended_at)
    values (
      gen_random_uuid(),
      u.id,
      proj_id,
      task_id,
      'Cohort model drafting',
      120,
      now() - interval '4 hours',
      now() - interval '2 hours'
    )
    on conflict do nothing;

    -- Entry 2: 150 min
    insert into time_entries (id, user_id, project_id, task_id, note, duration_min, started_at, ended_at)
    values (
      gen_random_uuid(),
      u.id,
      proj_id,
      task_id,
      'Forecasting core formulas',
      150,
      now() - interval '7 hours',
      now() - interval '4.5 hours'
    )
    on conflict do nothing;

  end loop;
end;
$$;
