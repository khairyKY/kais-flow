# v1.6.6 partner sharing P2, shared lists (branch claude/v166-shared-lists, from claude/v166-sharing)

Built from Kai's 2026-11-17 P2 picks (design-export/Partner sharing P2 flows.html flow 3 + edge cases, Sharing looks.html item 7). Not merged, not released. Migration **0102**.

## What it is
- **One shared project, both edit and tick.** A project the server marks shared in a connection (`projects.shared_circle_id`). Its items are ordinary tasks; the rows belong to the list's OWNER whoever adds them (a trigger rewrites `user_id`), so the owner's trash / export / AI see one list. `tasks.added_by` / `done_by` come from the session, never from the row.
- **No accept step.** Sharing a project makes it appear in the other person's Projects ("Shared with Reem", own group before "Yours") and read/write through membership policies. She can leave any time.
- **Server (0102), the first non-owner write path on tasks.** Permissive policies OR'd with 0002's owner-only ones (untouched): `projects_shared_select`, `tasks_shared_select/insert/update/delete`, all scoped by `share_list_owner(project_id)` (security definer: the owner, but only if the project is shared in a circle the caller is in) and `not private`. Nothing else opens: not their other projects, not their other tasks, not calendar_events, journal, people, chat. `tasks_share_list_before` also refuses a non-member who knows the project id, and a task never sits in a project that is not its person's (typed text kept as a loose task).
- **Private.** A Private item can't be in a shared list: refused on the server (23514); sharing a project that holds Private items is refused with the count; moving one in clears Private (toast "no longer Private", with Undo); on the task the switch is off and reads "Private · not in a shared list". A shared item is never anyone's Top 3 (server forces it).
- **Convergence (offline double tick).** A tick is set-to-done, never a toggle (the client writes full rows, as before). The first tick keeps the credit: the earliest `completed_at` wins whichever arrives first; a re-save of a done item changes neither who nor when; tick vs untick: the later write wins. Outbox writes keep working for both sides.
- **Activity.** A tick appends `shared_task_done {by, by_name, project, title}` to the other member's `activity_log` (actor from the session). The list page shows who added each item and who ticked it, and when.
- **Leave / stop / disconnect.** `share_list_stop` (owner "Stop sharing", other "Leave this list", both behind a confirm sheet that says each keeps a copy) and a disconnect (before-delete trigger on circles) split the list: the non-owner gets a private copy (new project, new items, with who added / ticked), the owner keeps the original with what was added, ticks stop reaching across. A write still waiting in the leaver's outbox for an item of the old list lands on THEIR copy via `share_list_copies`, never on the owner's. Revoke cuts write access immediately.
- **Client.** `features/sharing/lists.ts` (pure, tested), `listsApi.ts`, `SharedListPage.tsx` (To buy / Got, faces, add field, list menu), `ProjectRoute` (a shared project opens the list page, any other the ordinary page), group on Projects, "Share with Reem" in New project (off until flipped) and in the project menu, Private chip, `useSharedListsRealtime` (the other person's list on its own channel, `project_id=in.(...)`), TASK_COLUMNS += added_by, done_by.

## Checks
- Gate: vitest x4 zones 3051/3051, lint 0, build, ds:check 0 new.
- deno check: share-view, mcp, widget ok (no function touched).
- Rehearsal run 44189036372: green. `sharing-lists.sh` 89 passed, 0 failed (3 users: both add / edit / tick / delete, forged added_by / done_by / user_id / Top 3 overwritten, outsider read / add / edit / delete blocked, A's other projects and tasks closed to B, B can't rename / delete the list or share her own project by the column, Private refused every way, double tick and credit, leave and stop give copies, disconnect cuts access at once and a queued write lands on her copy, an account deleted while shared, list functions name no private table). `sharing.sh` 172, `widget.sh` 52. (Earlier runs failed on my own test seeds and one real find, fixed; widget.sh failed once at 23:57 Cairo, a time-of-day test, passed on rerun.)
- Harness docs/log/assets/v166-shared-lists/verify.mjs (Edge, mocked backend): 33/33; screenshots beside it.

## Decisions for Kai
1. A list's items are the OWNER's rows (whoever adds). If the owner deletes their account the list goes with it (the other person keeps a copy only if they left first).
2. A pause, or a lowered level, does not touch lists (they govern the day view). Only a leave / stop / disconnect does.
3. Dated items in a list show in both people's Today if they have a due date (nothing blocks it; groceries have none).
4. Sharing an existing project drops its tasks from Top 3 (a shared item is never a pick).
5. Moving a Private task into a list clears Private and says so with Undo, rather than asking first (the server needs it cleared either way).
6. Concurrent edits of different fields on the same item offline are last-write-wins for the whole row (full-row outbox); ticks and credit are exact.

## Not done / follow-ups
- Live Realtime for the other person's list is not provable here (the harness mocks it); the policy it relies on is the tested one. Check it with two real accounts.
- No toast on the other side when a list is split ("Reem disconnected. Groceries is now only yours."); the lists refetch and the copy appears, the existing disconnect notice covers the connection.
- The "Move to Yours…" button of the design is the ordinary "Move to…" chip; a non-owner can't move an item out of someone else's list (the server refuses).
- 0101, 0103 and 0104 are other builders'; the Rehearsal here ran with the gap.
