-- Migration: 0029_subtasks.sql
-- W2b (KAI-AUDIT-2026-07-18): one-level subtasks, Akiflow model.
-- Children are ordinary tasks; completing the parent does NOT cascade to them.
-- Depth-1 (a child cannot have children) is guarded in the UI, not here.
-- Deleting a parent orphans children back into ordinary tasks (SET NULL).

ALTER TABLE tasks ADD COLUMN parent_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX tasks_parent_task_id_idx ON tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
