-- AI assistants over MCP (docs/MCP.md): Claude Desktop / Claude Code / any MCP client reach a user's
-- Kai's Flow through the `mcp` edge function with a personal AI access key. It is the capture key's
-- sibling (0041), not the same key: a capture key can only add to the Inbox, this one can READ
-- tasks, projects, the calendar and search. Shown once in Settings → Integrations → AI assistants;
-- only its SHA-256 is stored. One key per user: "New key" replaces the hash and scope, "Turn off"
-- deletes the row (the next call from the assistant gets a 401).
--
--   scope          'read' (look only) | 'read_write' (also add / complete / move tasks, add to Inbox)
--   calls_day/calls the per-key daily tool-call counter (UTC day). Only the function writes it — as
--                  the table owner, before it switches to the user's role for the call itself; the
--                  app's column grants below don't reach it, so a user can't reset their own count.
create table if not exists mcp_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scope text not null default 'read_write' check (scope in ('read', 'read_write')),
  calls_day date,
  calls integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mcp_keys enable row level security;
drop policy if exists mcp_keys_owner on mcp_keys;
create policy mcp_keys_owner on mcp_keys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_mcp_keys_updated_at on mcp_keys;
create trigger set_mcp_keys_updated_at before update on mcp_keys
  for each row execute function set_updated_at();

-- Explicit grants: new tables are no longer auto-exposed to the Data API roles (config.toml
-- `auto_expose_new_tables`). The app reads its row, makes/replaces it (upsert on user_id) and deletes
-- it; nothing else.
revoke all on table mcp_keys from anon, authenticated;
grant select, delete on table mcp_keys to authenticated;
grant insert (key_hash, scope), update (key_hash, scope) on table mcp_keys to authenticated;
