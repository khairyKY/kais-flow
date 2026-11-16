-- A task's calendar blocks carry a copy of its title (calendar_events.title), and nothing renamed them
-- when the task was renamed: the grid said "PRE-workout + Creatine" while the task said "Post-workout"
-- (Kai 2026-11-16). One trigger covers every writer (app, phone, MCP). A block renamed on its own
-- (title no longer the task's old one) keeps its name.
-- (0095–0097 are reserved for the v1.6.4 Codex spec.)
create or replace function public.block_title_follows_task() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  update calendar_events set title = new.title
  where task_id = new.id and user_id = new.user_id and title is not distinct from old.title;
  return new;
end $$;

drop trigger if exists block_title_follows_task on public.tasks;
create trigger block_title_follows_task after update of title on public.tasks
for each row when (old.title is distinct from new.title)
execute function public.block_title_follows_task();
