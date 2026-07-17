-- Migration: 0021_journal_library.sql
-- Create journal_entries table
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  entry_date date not null,
  mood text,
  transcript text,
  media_paths text[] not null default '{}'::text[],
  gratitude text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint on user_id, entry_date
create unique index journal_entries_user_date_idx on journal_entries (user_id, entry_date);

-- Create books table
create table books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  author text,
  published_year int,
  current_page int not null default 0,
  total_pages int not null default 1,
  status text not null default 'reading' check (status in ('reading', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create notes table
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  body text not null,
  tags text[] not null default '{}'::text[],
  domain_id uuid references domains(id) on delete set null,
  book_id uuid references books(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create quotes table
create table quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  author text,
  source text,
  tags text[] not null default '{}'::text[],
  book_id uuid references books(id) on delete set null,
  page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create commentary table
create table commentary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_type text not null check (parent_type in ('note', 'quote')),
  parent_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on all tables
alter table journal_entries enable row level security;
alter table books enable row level security;
alter table notes enable row level security;
alter table quotes enable row level security;
alter table commentary enable row level security;

-- Create policies
create policy "journal_entries_owner" on journal_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "books_owner" on books for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes_owner" on notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "quotes_owner" on quotes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "commentary_owner" on commentary for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Add updated_at triggers
create trigger set_journal_entries_updated_at before update on journal_entries for each row execute function set_updated_at();
create trigger set_books_updated_at before update on books for each row execute function set_updated_at();
create trigger set_notes_updated_at before update on notes for each row execute function set_updated_at();
create trigger set_quotes_updated_at before update on quotes for each row execute function set_updated_at();
create trigger set_commentary_updated_at before update on commentary for each row execute function set_updated_at();

-- Add tables to realtime publication
alter publication supabase_realtime add table journal_entries;
alter publication supabase_realtime add table books;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table quotes;
alter publication supabase_realtime add table commentary;

-- Seed sample data for existing users (if any)
do $$
declare
  u record;
  book_id_1 uuid := '11111111-1111-1111-1111-111111111111';
  quote_id_1 uuid := '22222222-2222-2222-2222-222222222222';
  quote_id_2 uuid := '33333333-3333-3333-3333-333333333333';
  quote_id_3 uuid := '44444444-4444-4444-4444-444444444444';
  note_id_1 uuid := '55555555-5555-5555-5555-555555555555';
  note_id_2 uuid := '66666666-6666-6666-6666-666666666666';
  note_id_3 uuid := '77777777-7777-7777-7777-777777777777';
begin
  for u in select id from auth.users loop
    -- Seed books
    insert into books (id, user_id, title, author, published_year, current_page, total_pages, status)
    values (book_id_1, u.id, 'Four Thousand Weeks', 'Oliver Burkeman', 2021, 168, 288, 'reading')
    on conflict do nothing;

    -- Seed journal entries
    -- Jul 10
    insert into journal_entries (id, user_id, body, entry_date, mood, gratitude)
    values (
      gen_random_uuid(),
      u.id,
      'The forecasting build finally clicked this morning — two hours of real deep work before the house woke up. Omar''s note about starting with the Cairo cohort keeps feeling right; smaller, kinder, easier to learn from. I want to protect these early mornings.',
      '2026-07-10',
      'Grateful',
      array['First coffee, still dark outside', 'A working forecast, finally']
    )
    on conflict do nothing;

    -- Jul 9
    insert into journal_entries (id, user_id, body, entry_date, mood, gratitude)
    values (
      gen_random_uuid(),
      u.id,
      'A very productive Thursday. Focused on rewriting the navigation component. Got the layout rendering beautifully.',
      '2026-07-09',
      'Focused',
      array['Clean codebase', 'Healthy dinner', 'Good rest']
    )
    on conflict do nothing;

    -- Jul 8
    insert into journal_entries (id, user_id, body, entry_date, mood, gratitude)
    values (
      gen_random_uuid(),
      u.id,
      'Had a long day debugging the synchronization issues. Stretched thin, but we made it through.',
      '2026-07-08',
      'Stretched',
      array['Patience', 'Warm tea', 'Solved the race condition']
    )
    on conflict do nothing;

    -- Seed quotes
    insert into quotes (id, user_id, text, author, source, tags, book_id, page)
    values (
      quote_id_1,
      u.id,
      'The garden does not hurry, and yet everything is accomplished in its season.',
      'Oliver Burkeman',
      'Four Thousand Weeks',
      array['patience', 'pace'],
      book_id_1,
      '148'
    )
    on conflict do nothing;

    insert into quotes (id, user_id, text, author, source, tags, book_id, page)
    values (
      quote_id_2,
      u.id,
      'Attention is the beginning of devotion.',
      'Mary Oliver',
      'Devotions',
      array['attention', 'devotion'],
      null,
      '91'
    )
    on conflict do nothing;

    insert into quotes (id, user_id, text, author, source, tags, book_id, page)
    values (
      quote_id_3,
      u.id,
      'You need only do the next right thing.',
      'Unknown',
      'Various',
      array['simplicity'],
      null,
      '203'
    )
    on conflict do nothing;

    -- Seed commentary
    insert into commentary (id, user_id, parent_type, parent_id, body, created_at)
    values (
      gen_random_uuid(),
      u.id,
      'quote',
      quote_id_1,
      'Kept this the week the forecasting deadline felt impossible. The trick isn''t speed — it''s refusing to plant more than the bed can hold.',
      '2026-06-28 10:00:00+02'
    )
    on conflict do nothing;

    insert into commentary (id, user_id, parent_type, parent_id, body, created_at)
    values (
      gen_random_uuid(),
      u.id,
      'quote',
      quote_id_1,
      'Re-read after dropping two Top-3 days in a row. Season != sprint. Moved "learn Kanban" to Someday without guilt.',
      '2026-07-04 10:00:00+02'
    )
    on conflict do nothing;

    insert into commentary (id, user_id, parent_type, parent_id, body, created_at)
    values (
      gen_random_uuid(),
      u.id,
      'quote',
      quote_id_1,
      'The garden view makes this literal now. Watching the wisteria climb at its own pace is the whole point.',
      now()
    )
    on conflict do nothing;

    -- Seed notes
    insert into notes (id, user_id, title, body, tags, book_id)
    values (
      note_id_1,
      u.id,
      'Pricing model ideas',
      'Thinking about subscription vs one-time. Let''s keep it simple: flat monthly fee, all features included.',
      array['business', 'ideas'],
      null
    )
    on conflict do nothing;

    insert into notes (id, user_id, title, body, tags, book_id)
    values (
      note_id_2,
      u.id,
      'Book: Deep Work — notes',
      'Four rules of deep work: 1. Work deeply, 2. Embrace boredom, 3. Quit social media, 4. Drain the shallows.',
      array['productivity', 'notes'],
      null
    )
    on conflict do nothing;

    insert into notes (id, user_id, title, body, tags, book_id)
    values (
      note_id_3,
      u.id,
      'Efficiency trap notes',
      'Efficiency trap maps exactly onto the inbox — clearing it faster just refills it faster. The fix is the Top-3, not a faster shovel.',
      array['productivity'],
      book_id_1
    )
    on conflict do nothing;

  end loop;
end;
$$;
