#!/usr/bin/env bash
# Google Classroom deadlines (functions classroom-connect + classroom-sync, migration 0091; handoff
# 2026-11-03-*-classroom-handoff) against real Postgres, with Google mocked: the OAuth token endpoint and the
# Classroom API are supabase/tests/harness/classroom-mock.ts (the runner sends oauth2.googleapis.com and
# classroom.googleapis.com there, HARNESS_CLASSROOM_MOCK). Proves: the consent asks for the three read-only
# Classroom scopes and nothing from Calendar; the callback's refusals (denied, admin-blocked, a missing scope, a
# forged state); a first sync makes the "Classroom" domain, one project per chosen course, and a task per dated
# or undated assignment (every page read; drafts, handed-in work and last term's missing work left out; undated
# work in Someday); a second sync adds nothing; TURNED_IN / RETURNED tick tasks off; a changed due date updates;
# an edit made here survives; deleted work goes to Trash; a failed read trashes nothing; a task the person
# trashed stays trashed; unticking a course stops it; a dead grant is 'failing'; cron syncs only connected,
# non-failing users and never crosses users; disconnect keeps or removes (Trash) and a reconnect after "keep"
# makes no duplicates.
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/classroom.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, openssl, GNU date. Side effects: two throwaway accounts,
# classroom-a@ / classroom-b@example.com, deleted (with every row they own — cascade) before and after.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DENO=${DENO:-deno}
export DENO_NO_UPDATE_CHECK=1

STATUS=$(cd "$ROOT" && ${SUPABASE:-npx supabase} status -o env 2>/dev/null)  # SUPABASE: a CLI already on PATH (CI)
val() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\(.*\)\"$/\1/p" | head -1; }
API_URL=$(val API_URL)
ANON_KEY=$(val ANON_KEY)
SERVICE_ROLE_KEY=$(val SERVICE_ROLE_KEY)
DB_URL=$(val DB_URL)

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "refusing: API_URL '$API_URL' is not a local stack" >&2; exit 2 ;;
esac
case "$DB_URL" in
  postgresql://*@127.0.0.1:*|postgresql://*@localhost:*|postgres://*@127.0.0.1:*|postgres://*@localhost:*) ;;
  *) echo "refusing: DB_URL is not a local stack" >&2; exit 2 ;;
esac
[ -n "$ANON_KEY" ] && [ -n "$SERVICE_ROLE_KEY" ] || { echo "could not read keys from supabase status" >&2; exit 2; }

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
info() { printf '  INFO  %s\n' "$1"; }
section() { printf '\n== %s\n' "$1"; }
expect() { if [ "$2" = "$3" ]; then ok "$1 -> $3"; else bad "$1 -> got '$3', want '$2'"; fi; }
sql() { PGTZ=UTC psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

EMAILS="'classroom-a@example.com', 'classroom-b@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
# Google's stand-in, then the two functions under the harness on the stack's database.
# ---------------------------------------------------------------------------------------------
MOCK_PORT=${MOCK_PORT:-54396}
FN_PORT=${FN_PORT:-54397}
MOCK_PAGE=2 "$DENO" run --no-lock --no-prompt --quiet --allow-net=127.0.0.1 --allow-env \
  "$ROOT/supabase/tests/harness/classroom-mock.ts" "$MOCK_PORT" > "$TMP/mock.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 120); do curl -s -o /dev/null "http://127.0.0.1:$MOCK_PORT/__log" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$MOCK_PORT/__log" || { echo "the Google mock did not start:" >&2; cat "$TMP/mock.log" >&2; exit 2; }
MOCK="http://127.0.0.1:$MOCK_PORT"

SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY SUPABASE_DB_URL=$DB_URL \
  GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=test-secret HARNESS_CLASSROOM_MOCK=$MOCK \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" classroom-connect classroom-sync \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "the functions did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
F="http://127.0.0.1:$FN_PORT"

mock() { curl -sS -o /dev/null -X POST "$MOCK/__state" -H 'Content-Type: application/json' --data "$1"; }
# call FUNCTION BODY TOKEN -> CODE, BODY
call() {
  local out
  out=$(curl -sS -X POST "$F/$1" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' --data "$2" -w '\n%{http_code}')
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
j() { jq -r "$1" <<<"$BODY" 2>/dev/null; }
# callback QUERY -> CODE, LOC (the redirect's Location)
callback() {
  CODE=$(curl -sS -o /dev/null -D "$TMP/h" -w '%{http_code}' "$F/classroom-connect?$1")
  LOC=$(tr -d '\r' < "$TMP/h" | sed -n 's/^[Ll]ocation: //p' | head -1)
}

PASSWORD='classroom-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}

section "setup"
drop_users
A_JSON=$(new_user classroom-a@example.com)
B_JSON=$(new_user classroom-b@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON"); B_JWT=$(jq -r .access_token <<<"$B_JSON")
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign up test users: $A_JSON" >&2; exit 2; }
sql -c "insert into app_settings (user_id, timezone) values ('$A_ID', 'Africa/Cairo'), ('$B_ID', 'Africa/Cairo') on conflict (user_id) do update set timezone = excluded.timezone" >/dev/null
# A task of A's own that no Classroom step may ever touch.
sql -c "insert into tasks (user_id, title) values ('$A_ID', 'Classroom suite own task')" >/dev/null

day() { date -u -d "$1 days" +%Y-%m-%d; }                                      # N days from today (UTC)
gdate() { jq -n --arg d "$(day "$1")" '$d | split("-") | {year: (.[0] | tonumber), month: (.[1] | tonumber), day: (.[2] | tonumber)}'; }
cairo_end() { TZ=UTC date -u -d "TZ=\"Africa/Cairo\" $(day "$1") 23:59" +%Y-%m-%dT%H:%M; }
work() { # id title dueOffsetDays|none [hour] [state]
  jq -n --arg id "$1" --arg t "$2" --arg c "$COURSE" --arg st "${5:-PUBLISHED}" --argjson d "$( [ "$3" = none ] && echo null || gdate "$3")" --arg h "${4:-}" \
    '{id: $id, courseId: $c, title: $t, state: $st, alternateLink: ("https://classroom.google.com/c/" + $c + "/a/" + $id)}
     + (if $d then {dueDate: $d} else {} end) + (if $d and $h != "" then {dueTime: {hours: ($h | tonumber), minutes: 0}} else {} end)'
}
COURSE=c1
W1=$(work w1 'Lab report' 7 21); W2=$(work w2 'Problem set' 8); W3=$(work w3 'Reading'  none); W4=$(work w4 'Quiz' 3 12)
W5=$(work w5 'Old essay' -60 12); W6=$(work w6 'Draft thing' 4 12 DRAFT); W7=$(work w7 'Final project' 10 18)
COURSE=c2
H1=$(work h1 'Presentation' 5 12); H2=$(work h2 'Optional reading' none)
SUBS_C1='[{"courseWorkId":"w1","state":"NEW"},{"courseWorkId":"w4","state":"TURNED_IN"}]'
state_json() { # the mock's state: two active courses, one archived
  jq -n --argjson subs "$SUBS_C1" --argjson w1 "$W1" --argjson w2 "$W2" --argjson w3 "$W3" --argjson w4 "$W4" --argjson w5 "$W5" --argjson w6 "$W6" --argjson w7 "$W7" --argjson h1 "$H1" --argjson h2 "$H2" '
  {courses: [{id: "c1", name: "Physics", section: "A", courseState: "ACTIVE"}, {id: "c2", name: "History", courseState: "ACTIVE"}, {id: "c3", name: "Old course", courseState: "ARCHIVED"}],
   work: {c1: [$w1, $w2, $w3, $w4, $w5, $w6, $w7], c2: [$h1, $h2]},
   subs: {c1: $subs, c2: []},
   scope: "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
   deadToken: false, blockApi: false, failWork: []}'
}
mock "$(state_json)"

tasks_of() { sql -c "select count(*) from tasks where user_id = '$1' and external_ref->>'source' = 'classroom' and deleted_at is null"; }
t() { sql -c "select $2 from tasks where user_id = '$A_ID' and external_ref->>'id' = '$1'"; }
info "harness: functions on :$FN_PORT, Google mock on :$MOCK_PORT; A=$A_ID B=$B_ID"

# ---------------------------------------------------------------------------------------------
section "who may call"
call classroom-sync '{"action":"sync"}' ''
expect "sync with no token" "401" "$CODE"
call classroom-sync '{"action":"sync"}' "$ANON_KEY"
expect "sync with the anon key" "401" "$CODE"
call classroom-connect '{"action":"start"}' "$ANON_KEY"
expect "connect with the anon key" "401" "$CODE"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "sync for a user who never connected" "404 not_connected" "$CODE $(j .error)"

# ---------------------------------------------------------------------------------------------
section "the consent page: Classroom's three read-only scopes, nothing from Calendar"
call classroom-connect '{"action":"start","origin":"https://kais-flow.kaidagoat.workers.dev"}' "$A_JWT"
expect "start answers a Google URL" "200 https://accounts.google.com/o/oauth2/v2/auth" "$CODE $(j '.url | split("?")[0]')"
URL=$(j .url)
SCOPE=$(python3 -c 'import sys, urllib.parse as u; print(u.parse_qs(u.urlparse(sys.argv[1]).query)["scope"][0])' "$URL")
expect "scopes" "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.student-submissions.me.readonly" "$SCOPE"
expect "no Calendar scope, no include_granted_scopes (the Calendar grant is never carried in)" "0" "$(printf '%s' "$URL" | grep -c -E 'calendar|include_granted_scopes')"
expect "offline access, a refresh token every time" "2" "$(printf '%s' "$URL" | grep -o -E 'access_type=offline|prompt=consent' | wc -l | tr -d ' ')"
expect "the redirect is classroom-connect's own" "1" "$(printf '%s' "$URL" | grep -c 'redirect_uri=http.*%2Ffunctions%2Fv1%2Fclassroom-connect')"
STATE=${URL##*state=}

# ---------------------------------------------------------------------------------------------
section "the callback's refusals"
callback "code=good&state=$STATE&error=access_denied"
expect "the person said no" "302 denied" "$CODE $(sed -n 's/.*reason=//p' <<<"$LOC")"
callback "error=admin_policy_enforced&state=$STATE"
expect "the school's administrator blocked it" "302 admin_blocked" "$CODE $(sed -n 's/.*reason=//p' <<<"$LOC")"
callback "code=good&state=garbage.garbage"
expect "a forged state" "302 bad_state" "$CODE $(sed -n 's/.*reason=//p' <<<"$LOC")"
mock '{"scope":"https://www.googleapis.com/auth/classroom.courses.readonly"}'
callback "code=good&state=$STATE"
expect "a box unticked on Google's page (granular consent)" "302 scope_missing" "$CODE $(sed -n 's/.*reason=//p' <<<"$LOC")"
expect "…nothing stored" "0" "$(sql -c "select count(*) from integrations where user_id = '$A_ID' and provider = 'classroom'")"
mock "$(state_json)"

# ---------------------------------------------------------------------------------------------
section "connecting"
callback "code=good&state=$STATE"
expect "a good code" "302 connected" "$CODE $(sed -n 's/.*classroom=//p' <<<"$LOC")"
expect "the row: provider classroom, ok, token kept server-side" "ok true" "$(sql -c "select (data->>'status') || ' ' || ((data->>'refresh_token') = 'mock-refresh') from integrations where user_id = '$A_ID' and provider = 'classroom'")"
expect "active courses only (the archived one is not listed), both chosen" "c1,c2 c1,c2" "$(sql -c "select (select string_agg(c->>'id', ',' order by c->>'id') from jsonb_array_elements(data->'courses') c) || ' ' || (select string_agg(c, ',' order by c) from jsonb_array_elements_text(data->'chosen') c) from integrations where user_id = '$A_ID' and provider = 'classroom'")"
expect "the section rides in the name" "Physics · A" "$(sql -c "select data->'courses'->0->>'name' from integrations where user_id = '$A_ID' and provider = 'classroom'")"
expect "the Calendar row is not touched (none was made)" "0" "$(sql -c "select count(*) from integrations where user_id = '$A_ID' and provider = 'google'")"
callback "code=good&state=$STATE"
expect "a replayed connect keeps one row" "1" "$(sql -c "select count(*) from integrations where user_id = '$A_ID' and provider = 'classroom'")"

# ---------------------------------------------------------------------------------------------
section "the first sync"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "200, two courses" "200 2" "$CODE $(j .courses)"
expect "6 new: every page read (7 items on 4 pages), the draft / handed-in / stale ones left out" "6" "$(j .new)"
expect "tasks on the books" "6" "$(tasks_of "$A_ID")"
expect "a Classroom domain" "1" "$(sql -c "select count(*) from domains where user_id = '$A_ID' and name = 'Classroom' and deleted_at is null")"
expect "a project per course, in it, external-ref'd" "History|Physics · A" "$(sql -c "select string_agg(name, '|' order by name) from projects p where user_id = '$A_ID' and external_ref->>'source' = 'classroom' and domain_id = (select id from domains where user_id = '$A_ID' and name = 'Classroom')")"
expect "w1: its project, due date and time exactly (Classroom's UTC)" "Physics · A $(day 7)T21:00" "$(t c1/w1 "(select name from projects where id = project_id) || ' ' || to_char(due_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI')")"
expect "w2: a date alone is the end of that day on the student's clock" "$(cairo_end 8)" "$(t c1/w2 "to_char(due_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI')")"
expect "w3: undated work waits in Someday" "true null" "$(t c1/w3 "someday || ' ' || coalesce(due_at::text, 'null')")"
expect "w7: from the last page" "Final project" "$(t c1/w7 title)"
expect "the link back to Classroom" "https://classroom.google.com/c/c1/a/w1" "$(t c1/w1 "external_ref->>'url'")"
expect "not imported: handed in (w4), last term's (w5), a draft (w6)" "0" "$(sql -c "select count(*) from tasks where user_id = '$A_ID' and external_ref->>'id' in ('c1/w4', 'c1/w5', 'c1/w6')")"
expect "the sync logged each as created, with no titles in the log" "6 0" "$(sql -c "select count(*) || ' ' || count(*) filter (where payload ? 'title') from activity_log where user_id = '$A_ID' and event_type = 'task.created' and payload->>'source' = 'classroom'")"
expect "synced_at stamped, status ok" "ok true" "$(sql -c "select (data->>'status') || ' ' || ((data->>'synced_at') is not null) from integrations where user_id = '$A_ID' and provider = 'classroom'")"
expect "the person's own task untouched" "1" "$(sql -c "select count(*) from tasks where user_id = '$A_ID' and title = 'Classroom suite own task' and deleted_at is null and external_ref is null")"
expect "nothing of A's landed on B" "0" "$(tasks_of "$B_ID")"

section "a second sync adds nothing (no duplicates)"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "new / updated / done / trashed" "0 0 0 0" "$(j '"\(.new) \(.updated) \(.done) \(.trashed)"')"
expect "still 6 tasks" "6" "$(tasks_of "$A_ID")"

# ---------------------------------------------------------------------------------------------
section "handed in on Classroom ticks the task"
SUBS_C1='[{"courseWorkId":"w1","state":"TURNED_IN"},{"courseWorkId":"w2","state":"RETURNED"},{"courseWorkId":"w4","state":"TURNED_IN"},{"courseWorkId":"w7","state":"RECLAIMED_BY_STUDENT"}]'
mock "$(state_json)"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "2 done" "2" "$(j .done)"
expect "w1 (TURNED_IN) and w2 (RETURNED) are done, with a completion time" "done done true true" "$(t c1/w1 status) $(t c1/w2 status) $(t c1/w1 "completed_at is not null") $(t c1/w2 "completed_at is not null")"
expect "w7 (RECLAIMED_BY_STUDENT) is still open" "todo" "$(t c1/w7 status)"
expect "task.completed logged" "2" "$(sql -c "select count(*) from activity_log where user_id = '$A_ID' and event_type = 'task.completed' and payload->>'source' = 'classroom'")"

section "a changed due date updates the task; an edit made here survives"
sql -c "update tasks set due_at = '2031-01-01T08:00:00Z' where user_id = '$A_ID' and external_ref->>'id' = 'c2/h1'" >/dev/null
W7=$(COURSE=c1 work w7 'Final project' 12 18)
H2=$(COURSE=c2 work h2 'Optional reading' 20 9)
mock "$(state_json)"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "w7 moved two days later" "$(day 12)T18:00" "$(t c1/w7 "to_char(due_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI')")"
expect "h2 got a date: out of Someday" "false $(cairo_end 20 | cut -c1-10)" "$(t c2/h2 "someday") $(t c2/h2 "to_char(due_at at time zone 'UTC', 'YYYY-MM-DD')")"
expect "h1's date, edited here and unchanged on Classroom, is left alone" "2031-01-01T08:00" "$(t c2/h1 "to_char(due_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI')")"

# ---------------------------------------------------------------------------------------------
section "a read that fails trashes nothing"
mock '{"failWork":["c1"]}'
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "the run still answers 200" "200" "$CODE"
expect "c1's open tasks are all still there" "2" "$(sql -c "select count(*) from tasks where user_id = '$A_ID' and external_ref->>'course_id' = 'c1' and status = 'todo' and deleted_at is null")"
mock '{"failWork":[]}'
mock "$(state_json | jq '.work.c1 |= map(select(.id != "w3"))')"

section "work deleted on Classroom goes to Trash"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "w3 (gone from the list) is in Trash" "1 1" "$(t c1/w3 "(deleted_at is not null)::int") $(j .trashed)"
expect "task.deleted logged" "1" "$(sql -c "select count(*) from activity_log where user_id = '$A_ID' and event_type = 'task.deleted' and payload->>'source' = 'classroom'")"
expect "a done task is history, never trashed (w1)" "null" "$(t c1/w1 "coalesce(deleted_at::text, 'null')")"

section "a task the person trashed stays trashed"
sql -c "update tasks set deleted_at = now() where user_id = '$A_ID' and external_ref->>'id' = 'c1/w7'" >/dev/null
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "not brought back, not duplicated" "1 1" "$(t c1/w7 "(deleted_at is not null)::int") $(sql -c "select count(*) from tasks where user_id = '$A_ID' and external_ref->>'id' = 'c1/w7'")"

# ---------------------------------------------------------------------------------------------
section "picking courses"
call classroom-connect '{"action":"choose","ids":["c1","c9"]}' "$A_JWT"
expect "an unknown course is refused" "400 bad_request" "$CODE $(j .error)"
call classroom-connect '{"action":"choose","ids":["c1"]}' "$A_JWT"
expect "choose c1 only" "200 c1" "$CODE $(j '.chosen | join(",")')"
mock "$(jq -n --argjson h "$(COURSE=c2 work h9 'New History work' 2 12)" --argjson base "$(state_json | jq '.work.c1 |= map(select(.id != "w3"))')" '{work: ($base.work | .c2 += [$h])}')"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "an unticked course stops syncing (c2 sees nothing new) and keeps what came in" "0 2" "$(t c2/h9 'count(*)') $(sql -c "select count(*) from tasks where user_id = '$A_ID' and external_ref->>'course_id' = 'c2' and deleted_at is null")"
call classroom-connect '{"action":"courses"}' "$A_JWT"
expect "looking for new courses keeps the picks" "200 c1 2" "$CODE $(j '.chosen | join(",")') $(j '.courses | length')"
call classroom-connect '{"action":"choose","ids":["c1","c2"]}' "$A_JWT"

# ---------------------------------------------------------------------------------------------
section "a dead grant, a blocked API"
mock '{"blockApi":true}'
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "the school blocked the API: 403 blocked" "403 blocked" "$CODE $(j .error)"
expect "…and it is not a dead grant" "ok" "$(sql -c "select data->>'status' from integrations where user_id = '$A_ID' and provider = 'classroom'")"
mock '{"blockApi":false,"deadToken":true}'
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "the grant refused: 409 token_expired" "409 token_expired" "$CODE $(j .error)"
expect "the row says failing" "failing" "$(sql -c "select data->>'status' from integrations where user_id = '$A_ID' and provider = 'classroom'")"
mock '{"deadToken":false}'

# ---------------------------------------------------------------------------------------------
section "cron: every connected, non-failing user, nobody else's rows"
# B connects (a second account, no chosen course beyond c2); A is still 'failing'.
call classroom-connect '{"action":"start"}' "$B_JWT"
callback "code=good&state=$(jq -r '.url | split("state=")[1]' <<<"$BODY")"
call classroom-sync '{"action":"sync"}' "$SERVICE_ROLE_KEY"
expect "the service-role key runs the cron path: only B (A is failing)" "200 1" "$CODE $(j .users)"
expect "B got what is open and importable: w7, h1, h2, h9" "4" "$(tasks_of "$B_ID")"
expect "B's tasks sit in B's own projects only" "0" "$(sql -c "select count(*) from tasks t join projects p on p.id = t.project_id where t.user_id = '$B_ID' and p.user_id <> '$B_ID'")"
sql -c "update integrations set data = jsonb_set(data, '{status}', '\"ok\"') where user_id = '$A_ID' and provider = 'classroom'" >/dev/null
call classroom-sync '{"action":"sync"}' "$SERVICE_ROLE_KEY"
expect "with A back to ok, cron runs both" "2" "$(j .users)"
expect "…and changes nothing twice" "0" "$(j .failed)"

# ---------------------------------------------------------------------------------------------
section "disconnect: keep, then reconnect with no duplicates"
BEFORE=$(tasks_of "$A_ID")
call classroom-connect '{"action":"disconnect"}' "$A_JWT"
expect "disconnect without the keep / remove choice is refused" "400 bad_request" "$CODE $(j .error)"
call classroom-connect '{"action":"disconnect","remove":false}' "$A_JWT"
expect "keep: ok, nothing removed" "200 0" "$CODE $(j .removed)"
expect "the row is gone, the tasks and projects stay" "0 $BEFORE" "$(sql -c "select count(*) from integrations where user_id = '$A_ID' and provider = 'classroom'") $(tasks_of "$A_ID")"
expect "the grant was revoked at Google" "1" "$(curl -sS "$MOCK/__log" | grep -c '^POST /revoke')"
call classroom-connect '{"action":"start"}' "$A_JWT"
callback "code=good&state=$(jq -r '.url | split("state=")[1]' <<<"$BODY")"
call classroom-sync '{"action":"sync"}' "$A_JWT"
expect "a reconnect finds its tasks again: nothing new, no duplicates" "0 $BEFORE" "$(j .new) $(tasks_of "$A_ID")"

section "disconnect: remove goes to Trash"
call classroom-connect '{"action":"disconnect","remove":true}' "$A_JWT"
expect "remove: ok" "200 $BEFORE" "$CODE $(j .removed)"
expect "every imported task is in Trash, not gone for good" "0 true" "$(tasks_of "$A_ID") $(sql -c "select (count(*) > 0)::text from tasks where user_id = '$A_ID' and external_ref->>'source' = 'classroom' and deleted_at is not null")"
expect "the course projects too" "2 0" "$(sql -c "select count(*) || ' ' || count(*) filter (where deleted_at is null) from projects where user_id = '$A_ID' and external_ref->>'source' = 'classroom'")"
expect "the person's own task is untouched" "1" "$(sql -c "select count(*) from tasks where user_id = '$A_ID' and title = 'Classroom suite own task' and deleted_at is null")"
expect "B is untouched" "4" "$(tasks_of "$B_ID")"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E '^classroom-(sync|connect):.*(db |server_error)' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0 0 0" "$(sql -c "select concat_ws(' ',
  (select count(*) from tasks where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from projects where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from domains where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from integrations where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from auth.users where id in ('$A_ID', '$B_ID')))")"

if [ "$FAIL" != 0 ]; then echo; echo "-- harness log (last 60 lines) --"; tail -60 "$TMP/harness.log"; echo "-- mock log --"; curl -sS "$MOCK/__log" | tail -40; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
