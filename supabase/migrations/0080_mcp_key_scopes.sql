-- AI assistants: what a key may reach beyond the work lists (docs/MCP.md; Kai 2026-10-14 "build full
-- mcp functions, I want to be able to tell any ai to do anything"). The journal and the people you
-- keep are personal: the privacy policy promises an AI key reads "your tasks, projects, calendar and
-- Inbox notes … never your journal or the people you keep" unless the user says otherwise. So each
-- key carries the personal areas its owner switched on for it, in Settings → AI assistants:
--
--   scopes   '{}' (default: neither)  ·  'journal' (journal entries)  ·  'people' (people + interactions)
--
-- The `mcp` function reads it with the key and enforces it in its tool registry: a key without a scope
-- gets neither those tools in tools/list nor any of their rows (journal / people search hits, Trash,
-- Activity and inbox filing included). "New key" resets it (the app sends '{}'); "Turn off" deletes
-- the row. The app writes it with an awaited update, like the key itself. Additive, idempotent.

alter table mcp_keys add column if not exists scopes text[] not null default '{}';

alter table mcp_keys drop constraint if exists mcp_keys_scopes_known;
alter table mcp_keys add constraint mcp_keys_scopes_known check (scopes <@ array['journal', 'people']::text[]);

-- 0051's column grants, plus scopes: the app makes, replaces and switches; the call counter stays the
-- function's alone.
grant insert (key_hash, scope, scopes), update (key_hash, scope, scopes) on table mcp_keys to authenticated;
