-- P4 Routines & Rhythm: routines, completions, push subscriptions, Slipping view.

create extension if not exists pg_net;

create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  time_of_day text not null check (time_of_day in ('morning', 'afternoon', 'evening')),
  cadence jsonb not null default '{"weekdays":[0,1,2,3,4,5,6]}',
  challenge_start date,
  challenge_end date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table routines enable row level security;
create policy "routines_all" on routines for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_routines_updated_at before update on routines for each row execute function set_updated_at();

create table routine_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null references routines(id) on delete cascade,
  completed_on date not null,
  created_at timestamptz not null default now(),
  unique (routine_id, completed_on)
);
alter table routine_completions enable row level security;
create policy "routine_completions_all" on routine_completions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index routine_completions_routine_id_idx on routine_completions(routine_id);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  device_label text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "push_subscriptions_all" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table app_settings add column if not exists digest_hour int not null default 8;
alter table app_settings add column if not exists slipping_default_days int not null default 7;

-- Slipping: domains/projects whose most recent related activity_log touch is older than the
-- default threshold. Reads-only view over the activity_log spine — no stored state.
create view slipping with (security_invoker = true) as
with domain_touch as (
  select
    d.id,
    d.name,
    greatest(
      d.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'domain' and al.entity_id = d.id), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'project' and al.entity_id in (select id from projects where domain_id = d.id)), d.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'task' and al.entity_id in (select id from tasks where domain_id = d.id)), d.created_at)
    ) as last_touch
  from domains d
),
project_touch as (
  select
    p.id,
    p.name,
    greatest(
      p.created_at,
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'project' and al.entity_id = p.id), p.created_at),
      coalesce((select max(al.created_at) from activity_log al where al.entity_type = 'task' and al.entity_id in (select id from tasks where project_id = p.id)), p.created_at)
    ) as last_touch
  from projects p
)
select 'domain'::text as entity_type, id as entity_id, name as entity_name, last_touch,
  extract(epoch from (now() - last_touch)) / 86400 as days_since
from domain_touch
union all
select 'project'::text, id, name, last_touch,
  extract(epoch from (now() - last_touch)) / 86400
from project_touch;

alter publication supabase_realtime add table routines, routine_completions;
