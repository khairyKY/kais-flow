-- Tour & help (design-export/Tour and Help*.dc.html, Claude Design prompt 14): what each person has
-- already been shown — the first-run tour ('tour') and the one-line hints ('hint:swipe',
-- 'hint:calendar', 'hint:inbox') — so a new phone doesn't teach them again ("Each hint once, ever").
-- The app keeps the same list per user in localStorage (`kf-help:<uid>`) and reads the union of the
-- two; it only sends this column once the server's row carries it, so the client works before this
-- is pushed. "Show me around again" (the Guide, Settings → App, the ? sheet) writes it back to '{}'.
-- Written through the outbox like every other app_settings change (owner RLS, unchanged).

alter table app_settings add column if not exists help_seen text[] not null default '{}';
