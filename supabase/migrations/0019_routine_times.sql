-- UX Retrofit step 6.5e: custom routine times. A routine can now carry one of the 3 named
-- presets (morning/afternoon/evening), a user-defined preset label (e.g. "dusk"), an explicit
-- clock time, or no time at all.
alter table routines alter column time_of_day drop not null;
alter table routines drop constraint routines_time_of_day_check;
alter table routines add constraint routines_time_of_day_check check (time_of_day is null or time_of_day <> '');

alter table routines add column clock_time text;
alter table routines add constraint routines_clock_time_check check (clock_time is null or clock_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
