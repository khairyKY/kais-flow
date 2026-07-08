-- Issue #1: areas entity — a container like projects but ongoing (no end date, no milestones).
-- A task can belong to an area OR a project, never both (client-enforced).

create table areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  domain_id uuid references domains(id) on delete set null,
  name text not null,
  description text,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table areas enable row level security;

create policy "areas owner" on areas for all using (user_id = auth.uid());

alter table tasks add column area_id uuid references areas(id);

create index idx_areas_domain_id on areas(domain_id);

alter publication supabase_realtime add table areas;

-- trigger: set updated_at on change
create trigger set_areas_updated_at
  before update on areas
  for each row execute function set_updated_at();
