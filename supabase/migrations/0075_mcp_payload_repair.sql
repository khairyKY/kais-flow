-- Migration: 0075_mcp_payload_repair.sql
-- Data repair (Kai 2026-10-13: "yes repair"). From the MCP server's first deploy (2026-10-06) until
-- d6ad193d, its postgres.js writes JSON-encoded jsonb parameters twice, so the activity_log payload
-- and the Inbox row payload it wrote were stored as a JSON *string* holding the object
-- ('"{\"source\":\"mcp\"}"') instead of the object. Readers then saw no keys (source, ritual, …).
-- This turns each such string back into the object it holds. Only rows whose payload is a jsonb
-- string are touched; a string that isn't valid JSON (or holds a plain value) is left exactly as it
-- is, row by row, so the push never fails on data. Idempotent: a repaired payload is an object, so a
-- second run matches nothing.

do $$
declare
  r record;
  v jsonb;
begin
  for r in select id, payload #>> '{}' as t from activity_log where jsonb_typeof(payload) = 'string' loop
    begin
      v := r.t::jsonb;
    exception when others then
      v := null;
    end;
    if jsonb_typeof(v) in ('object', 'array') then
      update activity_log set payload = v where id = r.id;
    end if;
  end loop;

  for r in select id, payload #>> '{}' as t from inbox_items where jsonb_typeof(payload) = 'string' loop
    begin
      v := r.t::jsonb;
    exception when others then
      v := null;
    end;
    if jsonb_typeof(v) in ('object', 'array') then
      update inbox_items set payload = v where id = r.id;
    end if;
  end loop;
end $$;
