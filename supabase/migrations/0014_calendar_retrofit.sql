-- Issue #47: Add event type (time_block/event/task) and per-event color to calendar_events.

alter table calendar_events add column type text not null default 'event' check (type in ('time_block', 'event', 'task'));
alter table calendar_events add column color text;
