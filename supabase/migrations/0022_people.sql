-- N3 People CRM — people + interactions

create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  facts jsonb not null default '[]'::jsonb,
  domain_id uuid references domains(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table people enable row level security;
create policy "people_all" on people for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_people_updated_at before update on people for each row execute function set_updated_at();
create index people_domain_id_idx on people(domain_id);

create table interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  summary text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table interactions enable row level security;
create policy "interactions_all" on interactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger set_interactions_updated_at before update on interactions for each row execute function set_updated_at();
create index interactions_person_id_idx on interactions(person_id);
create index interactions_occurred_at_idx on interactions(occurred_at);

alter publication supabase_realtime add table people, interactions;
