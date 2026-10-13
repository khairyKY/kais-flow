-- The Notebook page (/notebook — the day laid out to copy into a paper journal; vault brainstorm
-- 2026-10-03 §A, Claude Design prompt 10): the page's layout, one per user, synced. A small JSON —
-- the blocks in order with on/off, a few options per block, the checkbox style — read by
-- app/src/features/notebook/page.ts `parseLayout`, which turns anything malformed into "Kai's page".
-- Null until the layout is first edited (the app draws Kai's page). The app keeps a copy per device
-- (localStorage `kf-notebook-layout:<uid>`) and only sends this column once the server's row carries
-- it, so the client works before this is pushed. Written through the outbox like every other
-- app_settings change (owner RLS, unchanged).

alter table app_settings add column if not exists notebook_layout jsonb;
