#!/usr/bin/env bash
# Shared lists (v1.6.6 partner sharing P2, migration 0102) against real Postgres + PostgREST, with three users:
#   A (Kai) owns the lists, B (Reem) is connected to A, C is a stranger. Every call goes through the real API as that user (JWT), so
#   the grants, RLS and triggers are the real ones.
#
#   both edit        B adds, edits, ticks and deletes items of A's shared list; A sees them at once; the rows stay A's (user_id),
#                    added_by / done_by come from the session (a forged value is overwritten); a shared item is never a Top 3 pick
#   closed to others C (a stranger) can't read, add, edit, tick or delete; B can't touch A's OTHER projects or tasks (read, patch,
#                    move, insert into them), can't rename the list, can't share a project of his own into A's circle or point
#                    one at a circle he isn't in; the internal functions aren't callable
#   Private          a Private item can't be in a shared list (set on it, moved in, or a project holding one can't be shared)
#   the double tick  two ticks of one item agree (done once), the earliest tick keeps the credit whichever arrives first, a tick
#                    and an untick: the later one wins; a tick tells the other person's activity log who did it
#   leaving          "Leave this list" / "Stop sharing": the other person gets a private copy, the owner keeps the original (with
#                    what was added), ticks stop reaching across; a disconnect does the same for every list, cuts write access at
#                    once, and a write still queued for an item of the old list lands on the leaver's own copy, never the owner's
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/sharing-lists.sh
#
# Needs curl, jq, psql. Side effects: three throwaway accounts, sl-a@ / sl-b@ / sl-c@example.com, deleted (with every row they own)
# before the run and again at the end.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)

STATUS=$(cd "$ROOT" && ${SUPABASE:-npx supabase} status -o env 2>/dev/null)
val() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\(.*\)\"$/\1/p" | head -1; }
API_URL=$(val API_URL)
ANON_KEY=$(val ANON_KEY)
DB_URL=$(val DB_URL)

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "refusing: API_URL '$API_URL' is not a local stack" >&2; exit 2 ;;
esac
case "$DB_URL" in
  postgresql://*@127.0.0.1:*|postgresql://*@localhost:*|postgres://*@127.0.0.1:*|postgres://*@localhost:*) ;;
  *) echo "refusing: DB_URL is not a local stack" >&2; exit 2 ;;
esac
[ -n "$ANON_KEY" ] || { echo "could not read keys from supabase status" >&2; exit 2; }

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
info() { printf '  INFO  %s\n' "$1"; }
section() { printf '\n== %s\n' "$1"; }
expect() { if [ "$2" = "$3" ]; then ok "$1 -> $3"; else bad "$1 -> got '$3', want '$2'"; fi; }
sql() { PGTZ=UTC psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

EMAILS="'sl-a@example.com', 'sl-b@example.com', 'sl-c@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }
trap 'drop_users 2>/dev/null' EXIT

PASSWORD='share-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
# api METHOD JWT PATH [JSON] -> CODE and BODY
api() {
  local out
  out=$(curl -sS -w '\n%{http_code}' -X "$1" "$API_URL$3" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -H 'Prefer: return=representation' ${4:+--data "$4"})
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
rpc() { local b=${3:-'{}'}; api POST "$1" "/rest/v1/rpc/$2" "$b"; }
upsert() { # JWT table JSON: the outbox's write (INSERT ... ON CONFLICT (id) DO UPDATE)
  local out
  out=$(curl -sS -w '\n%{http_code}' -X POST "$API_URL/rest/v1/$2?on_conflict=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: resolution=merge-duplicates,return=minimal' --data "$3")
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
jqe() { jq -r "$1" <<<"${2:-$BODY}"; }
# nothing happened: the API refused, or a patch/delete matched no row the caller may touch
blocked() { if [ "$CODE" -ge 400 ] || [ "$BODY" = "[]" ] || [ -z "$BODY" ]; then echo blocked; else echo "open($CODE $BODY)"; fi; }
ago() { date -u -d "-$1 minutes" +%Y-%m-%dT%H:%M:%SZ; }
col() { sql -c "select $2 from tasks where id = '$1'"; }   # one column of one task, as the owner of the database

# ids
P_GROC=b0000000-0000-0000-0000-000000000001; P_SECRET=b0000000-0000-0000-0000-000000000002; P_TRIP=b0000000-0000-0000-0000-000000000003
P_BOWN=b0000000-0000-0000-0000-000000000004; P_BC=b0000000-0000-0000-0000-000000000005
T_MILK=c0000000-0000-0000-0000-000000000001; T_EGGS=c0000000-0000-0000-0000-000000000002; T_PV=c0000000-0000-0000-0000-000000000003
T_SECRET=c0000000-0000-0000-0000-000000000004; T_ROOT=c0000000-0000-0000-0000-000000000005; T_BADD=c0000000-0000-0000-0000-000000000006
T_COFFEE=c0000000-0000-0000-0000-000000000007; T_TRIP1=c0000000-0000-0000-0000-000000000008; T_BOWN=c0000000-0000-0000-0000-000000000009
T_FORGED=c0000000-0000-0000-0000-00000000000a; T_CINTRUDE=c0000000-0000-0000-0000-00000000000b; T_PVNEW=c0000000-0000-0000-0000-00000000000c

section "setup"
drop_users
A_JSON=$(new_user sl-a@example.com); B_JSON=$(new_user sl-b@example.com); C_JSON=$(new_user sl-c@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON"); C_ID=$(jq -r .user.id <<<"$C_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON"); B_JWT=$(jq -r .access_token <<<"$B_JSON"); C_JWT=$(jq -r .access_token <<<"$C_JSON")
for v in "$A_ID" "$B_ID" "$C_ID" "$A_JWT" "$B_JWT" "$C_JWT"; do [ -n "$v" ] && [ "$v" != null ] || { echo "could not sign up test users" >&2; exit 2; }; done
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone, display_name) values (:'a', 'Africa/Cairo', 'Kai'), (:'b', 'Africa/Cairo', 'Reem')
  on conflict (user_id) do update set timezone = excluded.timezone, display_name = excluded.display_name;
SQL
rpc "$A_JWT" share_invite_create '{"p_relation":"partner"}'; CODE_A=$(jqe .code)
rpc "$B_JWT" share_invite_accept "{\"p_code\":\"$CODE_A\"}"
CIRCLE=$(jqe .circle_id)
[ -n "$CIRCLE" ] && [ "$CIRCLE" != null ] || { echo "could not connect A and B: $BODY" >&2; exit 2; }
info "A=$A_ID B=$B_ID C=$C_ID circle=$CIRCLE"

# A's projects and tasks, through the API as A (so the triggers and defaults run as they do for the app).
api POST "$A_JWT" /rest/v1/projects "{\"id\":\"$P_GROC\",\"name\":\"Groceries\",\"shared_circle_id\":\"$CIRCLE\"}"
expect "a client can't create a project already shared (the column is the server's)" "null" "$(jqe '.[0].shared_circle_id | tostring')"
api POST "$A_JWT" /rest/v1/projects "{\"id\":\"$P_SECRET\",\"name\":\"Secret plans\"}"
api POST "$A_JWT" /rest/v1/projects "{\"id\":\"$P_TRIP\",\"name\":\"Dahab trip\"}"
SEEDED=0
seed() { api POST "$A_JWT" /rest/v1/tasks "$1"; [ "$CODE" = 201 ] && SEEDED=$((SEEDED + 1)); }
seed "{\"id\":\"$T_MILK\",\"title\":\"Milk\",\"project_id\":\"$P_GROC\",\"top3\":true}"
seed "{\"id\":\"$T_EGGS\",\"title\":\"Eggs\",\"project_id\":\"$P_GROC\"}"
seed "{\"id\":\"$T_PV\",\"title\":\"PVITEM\",\"project_id\":\"$P_GROC\",\"private\":true}"
seed "{\"id\":\"$T_SECRET\",\"title\":\"SECRETTASK\",\"project_id\":\"$P_SECRET\"}"
seed "{\"id\":\"$T_ROOT\",\"title\":\"ROOTTASK\"}"
seed "{\"id\":\"$T_TRIP1\",\"title\":\"Book hostel\",\"project_id\":\"$P_TRIP\"}"
expect "A's six tasks are in" "6" "$SEEDED"

# ---------------------------------------------------------------------------------------------
section "sharing starts: only the owner, only into a circle of theirs, never with a Private item in it"
rpc "$A_JWT" share_list_start "{\"p_project\":\"$P_GROC\",\"p_circle\":\"$CIRCLE\"}"
expect "a project holding a Private item can't be shared (it says how many)" "false private_items 1" "$(jqe '[.ok, .error, .count] | map(tostring) | join(" ")')"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_PV" '{"private":false}'
rpc "$B_JWT" share_list_start "{\"p_project\":\"$P_GROC\",\"p_circle\":\"$CIRCLE\"}"
expect "B can't share A's project" "false not_yours" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
rpc "$C_JWT" share_list_start "{\"p_project\":\"$P_GROC\",\"p_circle\":\"$CIRCLE\"}"
expect "C can't either" "false not_yours" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
# a circle of B and C only: A can't point a project at strangers' circle
BC=$(sql -c "insert into circles (relation, created_by) values ('friend', '$B_ID') returning id")
sql -c "insert into circle_members (circle_id, user_id) values ('$BC', '$B_ID'), ('$BC', '$C_ID')" >/dev/null
rpc "$A_JWT" share_list_start "{\"p_project\":\"$P_SECRET\",\"p_circle\":\"$BC\"}"
expect "A can't share a project into a circle A isn't in" "false not_connected" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
api PATCH "$A_JWT" "/rest/v1/projects?id=eq.$P_SECRET" "{\"shared_circle_id\":\"$BC\"}"
expect "…nor by writing the column (put back)" "null" "$(sql -c "select coalesce(shared_circle_id::text, 'null') from projects where id = '$P_SECRET'")"
rpc "$A_JWT" share_list_start "{\"p_project\":\"$P_GROC\",\"p_circle\":\"$CIRCLE\"}"
expect "A shares Groceries with B" "true" "$(jqe '.ok | tostring')"
expect "it is shared in the circle; what was in it is credited to A, and off Top 3" "$CIRCLE $A_ID f" "$(sql -c "select concat_ws(' ', (select shared_circle_id from projects where id = '$P_GROC'), (select added_by from tasks where id = '$T_MILK'), (select top3 from tasks where id = '$T_MILK'))")"

# ---------------------------------------------------------------------------------------------
section "both edit: the list simply appears for B"
api GET "$B_JWT" "/rest/v1/projects?select=id,name,user_id,shared_circle_id"
expect "B sees Groceries (and nothing else of A's projects)" "Groceries" "$(jqe '[.[].name] | join(",")')"
expect "…as A's project, shared in the circle" "$A_ID $CIRCLE" "$(jqe '.[0] | "\(.user_id) \(.shared_circle_id)"')"
api GET "$B_JWT" "/rest/v1/tasks?select=id,title&order=title"
expect "B sees the list's items only, not the Private-free project's neighbours (Secret plans, a task with no project, the trip)" "Eggs,Milk,PVITEM" "$(jqe '[.[].title] | join(",")')"
api POST "$B_JWT" /rest/v1/tasks "{\"id\":\"$T_BADD\",\"title\":\"Tomatoes\",\"project_id\":\"$P_GROC\"}"
expect "B adds an item (no user_id sent, as the app does)" "201" "$CODE"
expect "the new row is A's, added by B" "$A_ID $B_ID" "$(col $T_BADD "concat_ws(' ', user_id, added_by)")"
api POST "$B_JWT" /rest/v1/tasks "{\"id\":\"$T_FORGED\",\"title\":\"Forged\",\"project_id\":\"$P_GROC\",\"added_by\":\"$A_ID\",\"done_by\":\"$A_ID\",\"user_id\":\"$B_ID\",\"top3\":true,\"top3_rank\":1}"
expect "a forged added_by / done_by / user_id / Top 3 is overwritten by the server" "$A_ID $B_ID none f" "$(col $T_FORGED "concat_ws(' ', user_id, added_by, coalesce(done_by::text, 'none'), top3)")"
api GET "$A_JWT" "/rest/v1/tasks?project_id=eq.$P_GROC&select=title&order=title"
expect "A sees what B added" "Eggs,Forged,Milk,PVITEM,Tomatoes" "$(jqe '[.[].title] | join(",")')"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_EGGS" '{"title":"Eggs, a dozen"}'
expect "B edits A's item" "Eggs, a dozen" "$(jqe '.[0].title')"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_BADD" '{"title":"Tomatoes (ripe)"}'
expect "A edits B's item" "Tomatoes (ripe)" "$(jqe '.[0].title')"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_MILK" '{"top3":true,"top3_rank":1}'
expect "B can't make a shared item a Top 3 pick" "f" "$(col $T_MILK top3)"
api DELETE "$B_JWT" "/rest/v1/tasks?id=eq.$T_FORGED"
expect "B deletes an item" "0" "$(col $T_FORGED 'count(*)')"
api GET "$B_JWT" "/rest/v1/activity_log?select=id"
expect "B's activity log is B's own (A's tick entries aren't readable by B)" "[]" "$BODY"

# ---------------------------------------------------------------------------------------------
section "closed to others"
api GET "$C_JWT" "/rest/v1/tasks?select=id"
expect "C (a stranger) reads no task" "closed" "$([ "$BODY" = "[]" ] && echo closed || echo "open($BODY)")"
api GET "$C_JWT" "/rest/v1/projects?select=id"
expect "…and no project" "closed" "$([ "$BODY" = "[]" ] && echo closed || echo "open($BODY)")"
api POST "$C_JWT" /rest/v1/tasks "{\"id\":\"$T_CINTRUDE\",\"title\":\"intruder\",\"project_id\":\"$P_GROC\"}"
expect "C can't put an item into A's list (even knowing the id)" "blocked" "$(blocked)"
api PATCH "$C_JWT" "/rest/v1/tasks?id=eq.$T_MILK" '{"title":"hacked","status":"done"}'
expect "C can't edit or tick" "blocked" "$(blocked)"
api DELETE "$C_JWT" "/rest/v1/tasks?id=eq.$T_MILK"
expect "C can't delete" "1 Milk" "$(col $T_MILK "count(*) || ' ' || max(title)")"
# B and A's OTHER things
api GET "$B_JWT" "/rest/v1/tasks?id=in.($T_SECRET,$T_ROOT,$T_TRIP1)&select=id"
expect "B can't read A's other projects' tasks or a task with no project" "closed" "$([ "$BODY" = "[]" ] && echo closed || echo "open($BODY)")"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_SECRET" '{"title":"hacked"}'
expect "B can't edit A's task in another project" "blocked" "$(blocked)"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_ROOT" "{\"project_id\":\"$P_GROC\"}"
expect "B can't pull one of A's other tasks into the list" "blocked" "$(blocked)"
api POST "$B_JWT" /rest/v1/tasks "{\"id\":\"c0000000-0000-0000-0000-0000000000f1\",\"title\":\"into secret\",\"project_id\":\"$P_SECRET\",\"user_id\":\"$A_ID\"}"
expect "B can't write into A's other project, even as A" "blocked" "$(blocked)"
api POST "$B_JWT" /rest/v1/tasks "{\"id\":\"c0000000-0000-0000-0000-0000000000f2\",\"title\":\"into secret 2\",\"project_id\":\"$P_SECRET\"}"
api GET "$A_JWT" "/rest/v1/tasks?id=eq.c0000000-0000-0000-0000-0000000000f2&select=id"
expect "…as herself it is only her own row (an orphan), which never shows in A's project or A's tasks" "[]" "$BODY"
api PATCH "$B_JWT" "/rest/v1/projects?id=eq.$P_GROC" '{"name":"Reem owns this"}'
expect "B can't rename (or otherwise change) A's project" "Groceries" "$(sql -c "select name from projects where id = '$P_GROC'")"
api DELETE "$B_JWT" "/rest/v1/projects?id=eq.$P_GROC"
expect "…or delete it" "1" "$(sql -c "select count(*) from projects where id = '$P_GROC'")"
api POST "$B_JWT" /rest/v1/projects "{\"id\":\"$P_BOWN\",\"name\":\"Reem's own\",\"shared_circle_id\":\"$CIRCLE\"}"
expect "B can't make a project of her own shared by writing the column" "null" "$(sql -c "select coalesce(shared_circle_id::text, 'null') from projects where id = '$P_BOWN'")"
api POST "$B_JWT" /rest/v1/tasks "{\"id\":\"$T_BOWN\",\"title\":\"Reem task\",\"project_id\":\"$P_BOWN\"}"
api GET "$A_JWT" "/rest/v1/tasks?id=eq.$T_BOWN&select=id"
expect "…and A never sees B's own tasks" "[]" "$BODY"
rpc "$B_JWT" share_list_split "{\"p_project\":\"$P_GROC\"}"
expect "the internal split isn't callable by the app's role" "true" "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] || [ "$CODE" = 404 ] && echo true || echo "false($CODE)")"
api GET "$B_JWT" "/rest/v1/share_list_copies?select=*"
expect "the copy map is closed to the app" "true" "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] || [ "$CODE" = 404 ] && echo true || echo "false($CODE $BODY)")"
api GET "$B_JWT" "/rest/v1/calendar_events?select=id"
expect "calendar_events stay owner-only" "[]" "$BODY"

# ---------------------------------------------------------------------------------------------
section "Private is not allowed inside a shared list"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_EGGS" '{"private":true}'
expect "B can't make a shared item Private" "blocked" "$(blocked)"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_EGGS" '{"private":true}'
expect "A (the owner) can't either" "blocked" "$(blocked)"
expect "…it is still shared" "f" "$(col $T_EGGS private)"
api POST "$A_JWT" /rest/v1/tasks "{\"id\":\"$T_PVNEW\",\"title\":\"PVNEW\",\"project_id\":\"$P_SECRET\",\"private\":true}"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_PVNEW" "{\"project_id\":\"$P_GROC\"}"
expect "moving a Private task into the list is refused until Private is cleared" "blocked" "$(blocked)"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_PVNEW" "{\"project_id\":\"$P_GROC\",\"private\":false}"
expect "…then it goes in (clearing Private, as the confirm does)" "$P_GROC f" "$(col $T_PVNEW "concat_ws(' ', project_id, private)")"
api POST "$A_JWT" /rest/v1/tasks "{\"id\":\"c0000000-0000-0000-0000-0000000000f3\",\"title\":\"PVADD\",\"project_id\":\"$P_GROC\",\"private\":true}"
expect "a new Private item can't be added to it" "blocked" "$(blocked)"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_PVNEW" "{\"project_id\":\"$P_SECRET\"}"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_PVNEW" '{"private":true}'
expect "moved out first, it can be Private again (the 'move it out first' path)" "t $P_SECRET" "$(col $T_PVNEW "concat_ws(' ', private, project_id)")"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_PVNEW" '{"title":"x"}'
expect "…and B can't see or touch it there" "blocked" "$(blocked)"

# ---------------------------------------------------------------------------------------------
section "the list functions touch only what a list needs"
LIST_LEAKY=$(sql -c "select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and (p.proname like 'share\_list\_%' or p.proname in ('circles_split_lists', 'tasks_share_list_before', 'tasks_share_list_after', 'projects_share_guard')) and pg_get_functiondef(p.oid) ~* '\m(from|join|into|update|table)[[:space:]]+(public\.)?(journal_entries|people|interactions|notes|books|quotes|commentary|inbox_items|routines|routine_completions|time_entries|integrations|mcp_keys|app_settings|chat_messages|push_subscriptions)\M'")
expect "no list function's body names the journal, people, health, chat or any other private table" "" "$LIST_LEAKY"
expect "the list functions exist (the check above isn't empty)" "t" "$(sql -c "select count(*) >= 6 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'share\_list\_%' or p.proname in ('circles_split_lists', 'tasks_share_list_before', 'tasks_share_list_after', 'projects_share_guard'))")"

# ---------------------------------------------------------------------------------------------
section "the double tick converges, the first tick keeps the credit, activity says who"
sql -c "delete from activity_log where user_id in ('$A_ID','$B_ID')" >/dev/null
T1=$(ago 40); T2=$(ago 30); T3=$(ago 20)
# arrival order: A (ticked 30 min ago) reaches the server first, B (ticked 40 min ago, offline) after it
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_MILK" "{\"status\":\"done\",\"completed_at\":\"$T2\"}"
expect "A ticks Milk: done, credited to A" "done $A_ID" "$(col $T_MILK "concat_ws(' ', status, done_by)")"
expect "…B's activity log says A ticked it (A's own client row is the ordinary one)" "1 $A_ID" "$(sql -c "select concat_ws(' ', count(*), max(payload->>'by')) from activity_log where user_id = '$B_ID' and event_type = 'shared_task_done' and entity_id = '$T_MILK'")"
upsert "$B_JWT" tasks "{\"id\":\"$T_MILK\",\"title\":\"Milk\",\"project_id\":\"$P_GROC\",\"status\":\"done\",\"completed_at\":\"$T1\",\"user_id\":\"$A_ID\"}"
expect "B's earlier tick arrives second (full-row upsert, as the outbox sends it): accepted" "true" "$([ "$CODE" -lt 300 ] && echo true || echo "false($CODE $BODY)")"
expect "done once, and the EARLIEST tick has the credit: B" "done $B_ID" "$(col $T_MILK "concat_ws(' ', status, done_by)")"
expect "…at B's time" "t" "$(col $T_MILK "completed_at = '$T1'::timestamptz")"
upsert "$A_JWT" tasks "{\"id\":\"$T_MILK\",\"title\":\"Milk\",\"project_id\":\"$P_GROC\",\"status\":\"done\",\"completed_at\":\"$T2\"}"
expect "A's stale re-save of the done item doesn't take the credit back" "$B_ID" "$(col $T_MILK done_by)"
upsert "$B_JWT" tasks "{\"id\":\"$T_MILK\",\"title\":\"Milk 2L\",\"project_id\":\"$P_GROC\",\"status\":\"done\",\"completed_at\":\"$T3\"}"
expect "a later tick of an already done item changes nothing about who or when" "$B_ID t" "$(col $T_MILK "concat_ws(' ', done_by, completed_at = '$T1'::timestamptz)")"
expect "…the title edit did land" "Milk 2L" "$(col $T_MILK title)"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_MILK" '{"status":"todo","completed_at":null}'
expect "an untick after the tick wins (the later write): open again, no credit" "todo none" "$(col $T_MILK "concat_ws(' ', status, coalesce(done_by::text, 'none'))")"
upsert "$B_JWT" tasks "{\"id\":\"$T_MILK\",\"title\":\"Milk 2L\",\"project_id\":\"$P_GROC\",\"status\":\"done\",\"completed_at\":\"$(ago 1)\"}"
expect "then B's tick (later still) wins again" "done $B_ID" "$(col $T_MILK "concat_ws(' ', status, done_by)")"
# a tick set from the owner's own row has a credit too, and a forged credit is ignored
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_EGGS" "{\"status\":\"done\",\"completed_at\":\"$(ago 5)\",\"done_by\":\"$A_ID\"}"
expect "B ticks Eggs and can't give the credit to A" "$B_ID" "$(col $T_EGGS done_by)"
expect "A's activity log has B's tick, with the list and the item named" "Reem Groceries Eggs, a dozen" "$(sql -c "select concat_ws(' ', payload->>'by_name', payload->>'project', payload->>'title') from activity_log where user_id = '$A_ID' and event_type = 'shared_task_done' and entity_id = '$T_EGGS'")"
api GET "$A_JWT" "/rest/v1/activity_log?event_type=eq.shared_task_done&select=payload"
expect "A can read it through the API (own log)" "true" "$([ "$(jqe 'length')" -ge 1 ] && echo true || echo "false($BODY)")"

# ---------------------------------------------------------------------------------------------
section "leave this list / stop sharing: each keeps a copy"
rpc "$A_JWT" share_list_start "{\"p_project\":\"$P_TRIP\",\"p_circle\":\"$CIRCLE\"}"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_TRIP1" '{"title":"Book hostel (Reem)"}'
expect "the trip is shared and B edits an item" "Book hostel (Reem)" "$(jqe '.[0].title')"
rpc "$C_JWT" share_list_stop "{\"p_project\":\"$P_TRIP\"}"
expect "C can't stop A's list" "false not_shared" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
rpc "$B_JWT" share_list_stop "{\"p_project\":\"$P_TRIP\"}"
expect "B leaves the trip" "true" "$(jqe '.ok | tostring')"
B_TRIP=$(jqe .copy_id)
expect "B gets a copy: her own project, the same items, A's edit included" "Dahab trip 1 Book hostel (Reem)" "$(sql -c "select concat_ws(' ', p.name, (select count(*) from tasks t where t.project_id = p.id), (select string_agg(title, ',') from tasks t where t.project_id = p.id)) from projects p where p.id = '$B_TRIP' and p.user_id = '$B_ID' and p.shared_circle_id is null")"
expect "A keeps the original, not shared any more, with all its items" "null 1" "$(sql -c "select concat_ws(' ', coalesce(shared_circle_id::text, 'null'), (select count(*) from tasks t where t.project_id = '$P_TRIP' and t.user_id = '$A_ID')) from projects where id = '$P_TRIP'")"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_TRIP1" '{"title":"changed after leaving"}'
expect "B's write to the old item no longer reaches A's (A's title is unchanged)" "Book hostel (Reem)" "$(col $T_TRIP1 title)"
api GET "$B_JWT" "/rest/v1/tasks?project_id=eq.$P_TRIP&select=id"
expect "B can't read A's trip any more" "[]" "$BODY"
expect "they are still connected (leaving a list is not a disconnect)" "1" "$(sql -c "select count(*) from circles where id = '$CIRCLE'")"
# A stops sharing: B gets the copy
rpc "$A_JWT" share_list_start "{\"p_project\":\"$P_TRIP\",\"p_circle\":\"$CIRCLE\"}"
rpc "$A_JWT" share_list_stop "{\"p_project\":\"$P_TRIP\"}"
expect "A stops sharing: B gets another copy (A's call doesn't hand A one)" "true null" "$(jqe '[.ok, .copy_id] | map(tostring) | join(" ")')"
expect "…B now has two Dahab trip copies, both B's" "2" "$(sql -c "select count(*) from projects where user_id = '$B_ID' and name = 'Dahab trip'")"

# ---------------------------------------------------------------------------------------------
section "a disconnect: access cut at once, each keeps a copy, a queued write lands on its own copy"
api POST "$B_JWT" /rest/v1/tasks "{\"id\":\"$T_COFFEE\",\"title\":\"Coffee beans\",\"project_id\":\"$P_GROC\"}"
expect "before the disconnect B can still add to Groceries" "201" "$CODE"
api DELETE "$A_JWT" "/rest/v1/circles?id=eq.$CIRCLE"
expect "A disconnects" "200" "$CODE"
api POST "$B_JWT" /rest/v1/tasks "{\"id\":\"c0000000-0000-0000-0000-0000000000f4\",\"title\":\"too late\",\"project_id\":\"$P_GROC\"}"
expect "B can't add to the old list: cut at once (at most an orphan row of her own, never in A's list)" "0" "$(sql -c "select count(*) from tasks where title = 'too late' and user_id = '$A_ID'")"
api PATCH "$B_JWT" "/rest/v1/tasks?id=eq.$T_EGGS" '{"title":"edited after the cut"}'
expect "B can't edit it" "blocked" "$(blocked)"
api GET "$B_JWT" "/rest/v1/tasks?project_id=eq.$P_GROC&user_id=eq.$A_ID&select=id"
expect "B can't read the original" "[]" "$BODY"
api GET "$B_JWT" "/rest/v1/projects?id=eq.$P_GROC&select=id"
expect "…nor its project row" "[]" "$BODY"
expect "the original is A's, unshared, with what B added (Coffee beans, Tomatoes)" "null 1 1" "$(sql -c "select concat_ws(' ', coalesce(shared_circle_id::text, 'null'), (select count(*) from tasks where project_id = '$P_GROC' and title = 'Coffee beans' and user_id = '$A_ID'), (select count(*) from tasks where project_id = '$P_GROC' and title like 'Tomatoes%' and user_id = '$A_ID')) from projects where id = '$P_GROC'")"
B_GROC=$(sql -c "select id from projects where user_id = '$B_ID' and name = 'Groceries'")
expect "B has her own copy of Groceries with the same five live items (Milk 2L, Eggs, PVITEM, Tomatoes, Coffee beans)" "5" "$(sql -c "select count(*) from tasks where project_id = '$B_GROC' and user_id = '$B_ID'")"
expect "…and the credit for her ticks came with it" "$B_ID" "$(sql -c "select done_by from tasks where project_id = '$B_GROC' and title = 'Milk 2L'")"
# a write still in B's outbox for an item of the old list: it lands on her copy, never on A's
upsert "$B_JWT" tasks "{\"id\":\"$T_EGGS\",\"title\":\"Eggs (queued offline)\",\"project_id\":\"$P_GROC\",\"status\":\"done\",\"completed_at\":\"$(ago 1)\"}"
expect "B's queued write is accepted (nothing to retry)" "true" "$([ "$CODE" -lt 300 ] && echo true || echo "false($CODE $BODY)")"
expect "A's Eggs is untouched" "Eggs, a dozen done" "$(col $T_EGGS "concat_ws(' ', title, status)")"
expect "B's own copy of Eggs took the edit and the tick" "Eggs (queued offline) done" "$(sql -c "select concat_ws(' ', title, status) from tasks where project_id = '$B_GROC' and user_id = '$B_ID' and title like 'Eggs%'")"
api PATCH "$B_JWT" "/rest/v1/tasks?project_id=eq.$B_GROC&title=like.Tomatoes*" '{"status":"done","completed_at":"2026-01-01T00:00:00Z"}'
expect "a tick on her copy never reaches A's original" "todo" "$(col $T_BADD status)"
api PATCH "$A_JWT" "/rest/v1/tasks?id=eq.$T_COFFEE" '{"status":"done"}'
expect "A's tick on the original never reaches hers" "todo" "$(sql -c "select status from tasks where project_id = '$B_GROC' and title = 'Coffee beans'")"
expect "the copy map is B's only: A (the owner) has no mapping rows" "0" "$(sql -c "select count(*) from share_list_copies where user_id = '$A_ID'")"

# ---------------------------------------------------------------------------------------------
section "an account that goes while a list is shared"
rpc "$A_JWT" share_invite_create '{"p_relation":"partner"}'; CODE_B=$(jqe .code)
rpc "$B_JWT" share_invite_accept "{\"p_code\":\"$CODE_B\"}"; CIRCLE2=$(jqe .circle_id)
rpc "$A_JWT" share_list_start "{\"p_project\":\"$P_GROC\",\"p_circle\":\"$CIRCLE2\"}"
expect "they connect again and A shares Groceries again" "true" "$(jqe '.ok | tostring')"
info "Groceries before B's account goes: $(sql -c "select string_agg(title || ' (' || case user_id when '$A_ID' then 'A' when '$B_ID' then 'B' else '?' end || ', ' || coalesce(deleted_at::text, 'live') || ')', '; ' order by title) from tasks where project_id = '$P_GROC'")"
sql -c "delete from auth.users where id = '$B_ID'" >/dev/null
expect "deleting B's account ends it: the list is A's alone, not shared, A's five items all still there" "null 5" "$(sql -c "select concat_ws(' ', coalesce(shared_circle_id::text, 'null'), (select count(*) from tasks where project_id = '$P_GROC' and user_id = '$A_ID' and deleted_at is null)) from projects where id = '$P_GROC'")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0" "$(sql -c "select concat_ws(' ', (select count(*) from tasks where user_id in ('$A_ID','$B_ID','$C_ID')), (select count(*) from projects where user_id in ('$A_ID','$B_ID','$C_ID')), (select count(*) from share_list_copies where user_id in ('$A_ID','$B_ID')))")"
sql -c "delete from circles where id = '$BC'" >/dev/null 2>&1 || true

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
