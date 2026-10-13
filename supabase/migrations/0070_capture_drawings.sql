-- Migration: 0070_capture_drawings.sql
-- Paper capture 11e: "1 drawing skipped (CPU → ready → run) · Add as image". The read now reports the
-- diagrams, sketches and charts it skipped (capture-image/read.ts `drawings`), so the results can offer
-- each one to the Inbox as an image note (a photo note whose box marks the drawing). RLS is 0049's.
--
-- `drawings`: [{what: a few words naming it | null, box: [x,y,w,h] 0–1 | null, page}]; [] = none, or a
-- read from before this. Nothing else reads or counts it ("N things" stays the lines).
--
-- Release order: this BEFORE `npx supabase functions deploy capture-image` — the function selects and
-- writes the column. The frontend reads it as optional, so it may ship before or after.
alter table captures
  add column if not exists drawings jsonb not null default '[]'::jsonb
  constraint captures_drawings_array check (jsonb_typeof(drawings) = 'array');
