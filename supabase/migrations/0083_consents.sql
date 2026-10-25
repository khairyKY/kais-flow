-- Terms of Use + Privacy Policy acceptance (Kai 2026-10-23: "the people accepting our terms during the
-- account creation, and send a notice telling people that we changed our terms"). docs/LEGAL.md.
--
-- 1 · consents: one row per document version a person agreed to — at sign-up (2) or from the app's
--     "We've updated our terms" notice (features/legal, written through the outbox). The current
--     versions live in supabase/functions/_shared/legal.ts; a version is YYYY-MM-DD, so `>=` on the
--     text is "this one or newer". Rows are kept (a history), never edited by the app.
-- 2 · Sign-up: the app sends the versions the box was ticked for as user metadata
--     (`terms_version`, `privacy_version`); a trigger on auth.users records them here, server-side, at
--     the moment the account is created — before the email is even confirmed, when there's no session
--     to write with. It never blocks a sign-up: anything odd and it records nothing, and the notice
--     asks the person in the app instead.
-- 3 · terms_notice_targets(): who still has to be told about the current versions — no consent at
--     them, and no `notify.terms` Activity row under this key yet. notify's `terms` kind (service role
--     only) reads it, writes that row (the in-app notice + the "told" mark) and pushes to the person's
--     devices: once per version.
-- 4 · Hourly cron for (3). After a version bump, everyone who hasn't agreed hears about it within the hour.

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_consents_user on consents(user_id, document, version);

alter table consents enable row level security;
drop policy if exists consents_select_own on consents;
create policy consents_select_own on consents for select using (user_id = auth.uid());
drop policy if exists consents_insert_own on consents;
create policy consents_insert_own on consents for insert with check (user_id = auth.uid());
-- The outbox writes with upsert: a retry of a row that already landed takes the conflict path.
drop policy if exists consents_update_own on consents;
create policy consents_update_own on consents for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_consents_updated_at on consents;
create trigger set_consents_updated_at before update on consents
  for each row execute function set_updated_at();

-- New tables are not auto-exposed to the Data API roles (config.toml auto_expose_new_tables, 0051).
-- No delete: an agreement isn't something to take back by editing the record.
grant select, insert, update on table consents to authenticated;

-- 2 ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function record_signup_consents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms text := new.raw_user_meta_data ->> 'terms_version';
  v_privacy text := new.raw_user_meta_data ->> 'privacy_version';
begin
  if v_terms ~ '^\d{4}-\d{2}-\d{2}$' then
    insert into public.consents (user_id, document, version) values (new.id, 'terms', v_terms);
  end if;
  if v_privacy ~ '^\d{4}-\d{2}-\d{2}$' then
    insert into public.consents (user_id, document, version) values (new.id, 'privacy', v_privacy);
  end if;
  return new;
exception when others then
  -- Never cost anyone their account over this: the in-app notice asks instead.
  raise warning 'record_signup_consents: %', sqlerrm;
  return new;
end;
$$;
revoke execute on function record_signup_consents() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_consents on auth.users;
create trigger on_auth_user_created_consents after insert on auth.users
  for each row execute function record_signup_consents();

-- 3 ───────────────────────────────────────────────────────────────────────────────────────────────
-- ponytail: one indexed scan of auth.users per hourly run, `p_limit` people a run (notify passes 200,
-- the size of one PostgREST IN list); a backlog drains over the next runs.
create or replace function terms_notice_targets(p_terms text, p_privacy text, p_key text, p_limit int default 200)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from auth.users u
  where u.deleted_at is null
    and coalesce(u.is_anonymous, false) = false
    and (
      not exists (select 1 from public.consents c where c.user_id = u.id and c.document = 'terms' and c.version >= p_terms)
      or not exists (select 1 from public.consents c where c.user_id = u.id and c.document = 'privacy' and c.version >= p_privacy)
    )
    and not exists (
      select 1 from public.activity_log a
      where a.user_id = u.id and a.event_type = 'notify.terms' and a.payload ->> 'version' = p_key
    )
  order by u.created_at
  limit p_limit;
$$;
revoke execute on function terms_notice_targets(text, text, text, int) from public, anon, authenticated;
grant execute on function terms_notice_targets(text, text, text, int) to service_role;

-- 4 ───────────────────────────────────────────────────────────────────────────────────────────────
-- cron.schedule with an existing name replaces that job, so a re-run is harmless.
select cron.schedule(
  'terms-notice-sweep',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://eqbbkitofgyxxrfggpbu.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('kind', 'terms')
  );
  $$
);
