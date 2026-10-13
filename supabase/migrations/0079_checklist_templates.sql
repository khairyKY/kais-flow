-- Checklist templates (P7 7d "checklist templates (jsonb; instantiate → real tasks)", parity audit
-- A25): a project's checklist saved under a name, then used on any project. One small list per
-- user: [{ "id": uuid, "name": text, "items": [{ "title": text, "type": "one-shot"|"task-linked" }] }],
-- read by app/src/features/projects/templates.ts parseTemplates (malformed entries are dropped).
-- Using one appends its items to the project's checklist; task-linked items become real tasks under
-- the project (PLAN_ADDENDUM §12). Null until the first template is saved. The app sends this column
-- only once the server's row carries it, so the client works before this is pushed. Written through
-- the outbox like every other app_settings change (owner RLS, unchanged). Additive, idempotent.

alter table app_settings add column if not exists checklist_templates jsonb;
