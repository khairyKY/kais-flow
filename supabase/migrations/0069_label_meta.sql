-- Labels (Overlays.dc.html "Label picker" + "Labels" manager, un-parked 2026-10-12): a label stays
-- free text on tasks.labels — rename and delete rewrite it on every task, no labels table. The one
-- thing the design adds that tasks can't carry is each label's colour (and a label made in the
-- manager before any task has it). One small map per user: { "Urgent": "var(--acc-terra)", … },
-- read by app/src/features/tasks/labels.ts parseLabelMeta (unknown values read as no colour).
-- Null until a label is first coloured. The app sends this column only once the server's row
-- carries it, so the client works before this is pushed. Written through the outbox like every
-- other app_settings change (owner RLS, unchanged).

alter table app_settings add column if not exists label_meta jsonb;
