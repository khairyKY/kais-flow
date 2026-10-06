-- Kai 2026-10-06: "if there is a task in a project I can't move it to a project". A task lives in a
-- project or an area, not both (the task editor has always said so), but the ⋯ / swipe / sheet
-- "Move to project…" kept the old area_id. Such a task wore its area's tag (the area wins the row's
-- one tag) and stayed on the area's page, so moving it to another project never looked like it
-- happened. The app now clears area_id on every move into a project (tasks/api.ts setProject);
-- this repairs the rows already written both ways. The project was the later choice (only a move
-- could produce the pair), so it is the one kept.
--
-- No check constraint: an outbox write queued offline by an older build could still carry both,
-- and a constraint would park it as "couldn't be saved" (the same reason Top 3's cap is
-- client-side). The client rule is the guard; this is a one-off repair.
update tasks
   set area_id = null,
       updated_at = now()
 where project_id is not null
   and area_id is not null;
