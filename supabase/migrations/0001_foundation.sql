-- P0 Foundation: extensions + shared trigger fn + keep-alive cron
-- (Supabase free projects pause after 7 days with zero DB activity; this prevents that.)

create extension if not exists vector;
create extension if not exists pg_cron;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

select cron.schedule('keep-alive', '0 3 * * *', 'select 1');
