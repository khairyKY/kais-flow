-- P1 Task Core: domains, projects, tasks, inbox_items, activity_log

create table domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table domains enable row level security;
create policy "domains_all" on domains for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_domains_updated_at before update on domains for each row execute function set_updated_at();

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  domain_id uuid references domains(id) on delete set null,
  name text not null,
  type text not null default 'standard' check (type in ('standard', 'retainer')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table projects enable row level security;
create policy "projects_all" on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_projects_updated_at before update on projects for each row execute function set_updated_at();
create index projects_domain_id_idx on projects(domain_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  domain_id uuid references domains(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'todo' check (status in ('todo', 'done', 'cancelled')),
  due_at timestamptz,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  top3 boolean not null default false,
  snoozed_until timestamptz,
  recurrence_rule text,
  labels text[] not null default '{}',
  priority int,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tasks enable row level security;
create policy "tasks_all" on tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_tasks_updated_at before update on tasks for each row execute function set_updated_at();
create index tasks_status_due_idx on tasks(status, due_at);
create index tasks_domain_id_idx on tasks(domain_id);
create index tasks_top3_idx on tasks(top3) where top3;

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text', 'voice', 'github_issue', 'email')),
  raw_text text not null default '',
  transcript text,
  ai_parse jsonb,
  confidence real,
  status text not null default 'pending' check (status in ('pending', 'filed', 'dismissed')),
  filed_task_id uuid references tasks(id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table inbox_items enable row level security;
create policy "inbox_items_all" on inbox_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_inbox_items_updated_at before update on inbox_items for each row execute function set_updated_at();
create index inbox_items_status_idx on inbox_items(status);

-- Append-only: no update/delete policy defined on purpose.
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table activity_log enable row level security;
create policy "activity_log_select" on activity_log for select using (user_id = auth.uid());
create policy "activity_log_insert" on activity_log for insert with check (user_id = auth.uid());
create index activity_log_entity_idx on activity_log(entity_type, entity_id, created_at);

alter publication supabase_realtime add table domains, projects, tasks, inbox_items;
