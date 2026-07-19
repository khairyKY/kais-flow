-- Migration: 0028_routine_steps.sql
-- Backs the two New Routine form fields cut for lack of schema (Routines.dc.html #2a):
-- steps = ordered jsonb array of step labels ("what it's made of" checklist);
-- domain_id = the Domain picker. Deleting a domain orphans the routine, not the reverse.

ALTER TABLE routines
  ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN domain_id uuid REFERENCES domains(id) ON DELETE SET NULL;
