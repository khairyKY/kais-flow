-- Issue #50: add configurable calendar day count to app_settings.

alter table app_settings add column calendar_day_count int not null default 7;
