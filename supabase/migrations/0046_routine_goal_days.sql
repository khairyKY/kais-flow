-- Migration: 0046_routine_goal_days.sql
-- The New Routine form's streak goal ("Challenge (optional) · 30 day streak", Routines.dc.html #2a;
-- P7's planned `goal_days`): saved on the routine, so its streak reads "12 / 30" wherever it shows.
-- null = no goal (an ongoing routine). The challenge window (challenge_start/end) is unchanged;
-- challenges made before this get their goal back from that window. RLS on routines is 0005's.
alter table routines
  add column if not exists goal_days integer
  check (goal_days is null or goal_days between 1 and 3650);

update routines
set goal_days = (challenge_end - challenge_start) + 1
where goal_days is null
  and challenge_start is not null
  and challenge_end is not null
  and challenge_end >= challenge_start
  and (challenge_end - challenge_start) + 1 <= 3650;
