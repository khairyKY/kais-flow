-- Shared lists (v1.6.6, partner sharing P2; design-export/Partner sharing P2 flows.html, flow 3).
-- ONE project that two connected people both edit and tick (groceries, a trip). The first NON-OWNER WRITE path on tasks, so every
-- rule is on the server, scoped to the rows of a project that is linked as shared in a LIVE connection - never to anyone's other tasks
-- or projects:
--
--   projects.shared_circle_id   the connection (0100 circle) the project is shared in; null = not shared. Changed ONLY by the
--                               functions below (a trigger puts back any other writer's value), so a stale offline row can't
--                               re-share a list one of them left, and nobody can point a project at a circle they aren't in.
--   tasks.added_by / done_by    who added an item, who ticked it (set by the server from the session, never from the row).
--   The rows of a shared list belong to the list's OWNER (tasks.user_id = projects.user_id, whoever adds them): so a copy, a
--   trash, an export and the AI of the owner all see one list, and the other person reads and writes them only through the
--   membership policies below.
--
--   RLS (permissive, OR'd with the owner-only policies of 0002, which are NOT touched):
--     projects: a member of the circle may SELECT the shared project (no write: the list's name, colour and sharing are the owner's).
--     tasks:    a member may select / insert / update / delete a task whose project is shared in a circle they are in,
--               and only when the task is the owner's row of that project (user_id = the owner) and not Private.
--   Nothing else is opened: no other project, no task outside the shared project, no calendar_events, no journal.
--
--   Private: a Private item cannot be in a shared list (the trigger refuses it; moving one in means clearing Private first, and
--            sharing a project that holds Private items is refused). Top 3: a shared list's items are never anyone's Top 3.
--   Convergence (design-export edge case "An offline double tick"): a tick means "set to done", never "toggle". The first tick keeps
--            the credit (the earliest completed_at wins, whichever reaches the server first); a tick and an untick: the later write
--            wins. Full-row upserts from the outbox keep working for both people.
--   Leaving: a disconnect (the circle goes), "Leave this list" or "Stop sharing": the original stays the owner's (with what the other
--            person added), the other person gets a plain private COPY with the same items; ticks no longer reach across. A write
--            still waiting in the other person's outbox for an item of the old list lands on THEIR copy (share_list_copies), never
--            on the owner's: membership is checked when the write arrives.
--   Activity: a tick appends `shared_task_done` {by, project, title} to the activity_log of the OTHER member(s) - the actor comes
--            from the session. The ticker's own client row (task.completed) is the ordinary one.

alter table projects add column if not exists shared_circle_id uuid references circles(id) on delete set null;
create index if not exists projects_shared_circle on projects (shared_circle_id) where shared_circle_id is not null;
-- Plain ids, no foreign key: a person who deletes their account leaves a stale id (shown as "Someone"), and an FK's own set-null
-- update would run through the tick rules below.
alter table tasks add column if not exists added_by uuid;
alter table tasks add column if not exists done_by uuid;

-- ---------------------------------------------------------------------------------------------
-- Who may touch a shared list. security definer so the policies below don't recurse through RLS.
-- ---------------------------------------------------------------------------------------------
-- The list's owner, if `p_project` is shared in a circle the caller is in; else null.
create or replace function share_list_owner(p_project uuid) returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select p.user_id from projects p
  join circle_members m on m.circle_id = p.shared_circle_id and m.user_id = auth.uid()
  where p.id = p_project and p.shared_circle_id is not null
$$;
revoke all on function share_list_owner(uuid) from public, anon;
grant execute on function share_list_owner(uuid) to authenticated;

drop policy if exists projects_shared_select on projects;
create policy projects_shared_select on projects for select
  using (shared_circle_id is not null and share_is_member(shared_circle_id));

drop policy if exists tasks_shared_select on tasks;
create policy tasks_shared_select on tasks for select
  using (project_id is not null and not private and user_id = share_list_owner(project_id));
drop policy if exists tasks_shared_insert on tasks;
create policy tasks_shared_insert on tasks for insert
  with check (project_id is not null and not private and user_id = share_list_owner(project_id));
drop policy if exists tasks_shared_update on tasks;
create policy tasks_shared_update on tasks for update
  using (project_id is not null and not private and user_id = share_list_owner(project_id))
  with check (project_id is not null and not private and user_id = share_list_owner(project_id));
drop policy if exists tasks_shared_delete on tasks;
create policy tasks_shared_delete on tasks for delete
  using (project_id is not null and not private and user_id = share_list_owner(project_id));

-- ---------------------------------------------------------------------------------------------
-- projects: shared_circle_id moves only through the functions below (they set kf.share_list for their own statement).
-- ---------------------------------------------------------------------------------------------
create or replace function projects_share_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('kf.share_list', true), '') <> 'on' then
    if tg_op = 'INSERT' then new.shared_circle_id := null;
    -- the circle is gone (the foreign key's own set-null lands here too): the project is simply not shared any more
    elsif old.shared_circle_id is not null and not exists (select 1 from circles c where c.id = old.shared_circle_id) then new.shared_circle_id := null;
    else new.shared_circle_id := old.shared_circle_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists projects_share_guard on projects;
create trigger projects_share_guard before insert or update on projects for each row execute function projects_share_guard();

-- ---------------------------------------------------------------------------------------------
-- tasks: the rules of a row in a shared list (before the write, so the policies see the final row).
-- ---------------------------------------------------------------------------------------------
create table if not exists share_list_copies (
  old_task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  new_task_id uuid not null references tasks(id) on delete cascade,
  primary key (old_task_id, user_id)
);
alter table share_list_copies enable row level security;
revoke all on table share_list_copies from anon, authenticated;

create or replace function tasks_share_list_before() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.user_id);
  v_owner uuid; v_circle uuid; v_copy uuid;
begin
  -- A write from a person's outbox for an item of a list that has since been split: it lands on THEIR copy (and only theirs).
  if tg_op = 'INSERT' then
    select c.new_task_id into v_copy from share_list_copies c where c.old_task_id = new.id and c.user_id = v_actor;
    if v_copy is not null and not exists (select 1 from tasks t where t.id = new.id and t.user_id = v_actor) then
      update tasks set title = new.title, notes = new.notes, status = new.status,
        completed_at = case when new.status = 'done' then coalesce(new.completed_at, now()) end, deleted_at = new.deleted_at
      where id = v_copy and user_id = v_actor;
      return null;
    end if;
  end if;

  if new.project_id is null then return new; end if;
  select p.user_id, p.shared_circle_id into v_owner, v_circle from projects p where p.id = new.project_id;
  if v_owner is null then return new; end if;
  if v_circle is null then
    -- Someone else's project that is not shared with this person (a write still queued after a disconnect, or a made-up id): the
    -- task is kept - what a person typed is never thrown away - but loose, never inside a project that isn't theirs.
    if v_owner <> new.user_id then new.project_id := null; new.milestone_id := null; end if;
    return new;
  end if;

  -- The only people who may put a row into a shared list are the two of the connection (the foreign key alone would let anyone
  -- who knew the project's id).
  if not exists (select 1 from circle_members m where m.circle_id = v_circle and m.user_id = v_actor) then
    raise exception 'not part of this shared list' using errcode = '42501';
  end if;
  if new.private then
    raise exception 'a Private item cannot be in a shared list; move it out or make it shared first' using errcode = '23514';
  end if;

  new.user_id := v_owner;                       -- the list's rows are the owner's
  new.top3 := false; new.top3_rank := null;     -- a shared list never reaches anyone's Top 3
  if tg_op = 'INSERT' then new.added_by := v_actor;
  elsif old.project_id is distinct from new.project_id then new.added_by := v_actor;   -- moved in
  else new.added_by := coalesce(old.added_by, old.user_id); end if;   -- (an item that was there before the list was shared is its owner's)

  -- Ticks: set-to-done, first tick keeps the credit, the later of tick / untick wins by arrival.
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.done_by := v_actor;
      new.completed_at := least(coalesce(new.completed_at, now()), now());
    elsif new.completed_at is not null and old.completed_at is not null and new.completed_at < old.completed_at then
      new.done_by := v_actor;                   -- an earlier tick reaching us late takes the credit
      new.completed_at := least(new.completed_at, now());
    else
      new.done_by := coalesce(old.done_by, old.user_id);
      new.completed_at := coalesce(old.completed_at, new.completed_at);
    end if;
  else
    new.done_by := null;
  end if;
  return new;
end $$;
revoke all on function tasks_share_list_before() from public, anon, authenticated;
drop trigger if exists tasks_share_list_before on tasks;
create trigger tasks_share_list_before before insert or update on tasks for each row execute function tasks_share_list_before();

-- A tick tells the other person's activity log who did it (the actor is the session's, not the row's).
create or replace function tasks_share_list_after() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_circle uuid; v_name text;
begin
  if new.project_id is null or new.status <> 'done' or new.done_by is null then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'done' and old.done_by is not distinct from new.done_by then return null; end if;
  select p.shared_circle_id, p.name into v_circle, v_name from projects p where p.id = new.project_id;
  if v_circle is null then return null; end if;
  insert into activity_log (user_id, event_type, entity_type, entity_id, payload)
  select m.user_id, 'shared_task_done', 'task', new.id,
    jsonb_build_object('by', new.done_by, 'by_name', share_name(new.done_by), 'project_id', new.project_id, 'project', v_name, 'title', new.title)
  from circle_members m where m.circle_id = v_circle and m.user_id <> new.done_by;
  return null;
end $$;
revoke all on function tasks_share_list_after() from public, anon, authenticated;
drop trigger if exists tasks_share_list_after on tasks;
create trigger tasks_share_list_after after insert or update on tasks for each row execute function tasks_share_list_after();

-- A task's blocks follow its title (0098) for whoever renames it: the blocks are the owner's, the renamer may be the other person.
alter function public.block_title_follows_task() security definer;

-- ---------------------------------------------------------------------------------------------
-- Split: each person keeps their own copy. The original stays with its owner (and what the other person added); every OTHER
-- member gets a private project with the same items, then the original stops being shared.
-- ---------------------------------------------------------------------------------------------
-- Returns the id of the copy made for the CALLING person (null when they are the owner, or it is a disconnect).
create or replace function share_list_split(p_project uuid) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare p projects; v_member uuid; v_new uuid; v_mine uuid;
begin
  select * into p from projects where id = p_project and shared_circle_id is not null;
  if not found then return null; end if;
  for v_member in select m.user_id from circle_members m where m.circle_id = p.shared_circle_id and m.user_id <> p.user_id
    and exists (select 1 from auth.users u where u.id = m.user_id) loop
    v_new := gen_random_uuid();
    if v_member = auth.uid() then v_mine := v_new; end if;
    insert into projects (id, user_id, name, type, status, color, target_date, milestones, checklist, engagement_model, completion_summary)
    values (v_new, v_member, p.name, p.type, p.status, p.color, p.target_date, p.milestones, p.checklist, p.engagement_model, p.completion_summary);
    with m as (select t.id as old_id, gen_random_uuid() as new_id from tasks t where t.project_id = p.id and t.deleted_at is null),
    ins as (
      insert into tasks (id, user_id, project_id, parent_task_id, title, notes, status, due_at, priority, labels, completed_at, someday,
                         duration_min, sort_order, recurrence_rule, milestone_id, added_by, done_by, created_at)
      select m.new_id, v_member, v_new, (select m2.new_id from m m2 where m2.old_id = t.parent_task_id), t.title, t.notes, t.status, t.due_at, t.priority,
             t.labels, t.completed_at, t.someday, t.duration_min, t.sort_order, t.recurrence_rule, t.milestone_id, t.added_by, t.done_by, t.created_at
      from tasks t join m on m.old_id = t.id
      returning id
    )
    insert into share_list_copies (old_task_id, user_id, new_task_id)
    select m.old_id, v_member, m.new_id from m join ins on ins.id = m.new_id
    on conflict do nothing;
  end loop;
  perform set_config('kf.share_list', 'on', true);
  update projects set shared_circle_id = null where id = p.id;
  perform set_config('kf.share_list', '', true);
  return v_mine;
end $$;
revoke all on function share_list_split(uuid) from public, anon, authenticated;

-- A disconnect: before the circle (and its members) go, every list shared in it is split.
create or replace function circles_split_lists() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p uuid;
begin
  for v_p in select p.id from projects p where p.shared_circle_id = old.id loop perform share_list_split(v_p); end loop;
  return old;
end $$;
revoke all on function circles_split_lists() from public, anon, authenticated;
drop trigger if exists circles_split_lists on circles;
create trigger circles_split_lists before delete on circles for each row execute function circles_split_lists();

-- ---------------------------------------------------------------------------------------------
-- The two online changes: share a project with a connection, stop sharing / leave it.
-- ---------------------------------------------------------------------------------------------
create or replace function share_list_start(p_project uuid, p_circle uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); p projects; v_private int;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into p from projects where id = p_project and user_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  if not exists (select 1 from circle_members m where m.circle_id = p_circle and m.user_id = v_uid)
     or (select count(*) from circle_members m where m.circle_id = p_circle) < 2 then
    return jsonb_build_object('ok', false, 'error', 'not_connected');
  end if;
  if p.shared_circle_id is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  select count(*) into v_private from tasks t where t.project_id = p.id and t.deleted_at is null and t.private;
  if v_private > 0 then return jsonb_build_object('ok', false, 'error', 'private_items', 'count', v_private); end if;
  perform set_config('kf.share_list', 'on', true);
  update projects set shared_circle_id = p_circle where id = p.id;
  perform set_config('kf.share_list', '', true);
  -- What is already in it is the owner's: credit it to them, and keep it out of Top 3.
  update tasks set added_by = coalesce(added_by, user_id) where project_id = p.id and user_id = p.user_id;
  return jsonb_build_object('ok', true);
end $$;

-- Either person: "Stop sharing" (the owner) or "Leave this list" (the other). The owner keeps the original; the other keeps a copy.
create or replace function share_list_stop(p_project uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); p projects; v_copy uuid;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into p from projects where id = p_project and shared_circle_id is not null
    and exists (select 1 from circle_members m where m.circle_id = projects.shared_circle_id and m.user_id = v_uid);
  if not found then return jsonb_build_object('ok', false, 'error', 'not_shared'); end if;
  v_copy := share_list_split(p.id);
  return jsonb_build_object('ok', true, 'copy_id', case when p.user_id <> v_uid then v_copy end);
end $$;

revoke all on function share_list_start(uuid, uuid), share_list_stop(uuid) from public, anon;
grant execute on function share_list_start(uuid, uuid), share_list_stop(uuid) to authenticated;
