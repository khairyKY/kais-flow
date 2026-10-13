#!/usr/bin/env bash
# The MCP server's write tools against real Postgres (docs/MCP.md; handoff 2026-10-13-0848-mcp-week):
# add_task with a time, reschedule_task, edit_task, add/edit/delete_event with repeats, complete_task
# on a paused series — and that a key only ever reaches its own user's rows. The `mcp` function runs
# under plain Deno (supabase/tests/harness/runner.ts) on the stack's database, exactly as deployed:
# each request is one transaction that switches to the key owner's role, so RLS is the real one.
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/mcp-week.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, openssl. Dates are fixed in January 2028 (Cairo
# UTC+2, Los Angeles UTC-8): far enough ahead that "today" never lands on them.
#
# Side effects: two throwaway accounts, mcp-week-a@ / mcp-week-b@example.com. Deleted (with every row
# they own — cascade) before the run and again at the end.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DENO=${DENO:-deno}
export DENO_NO_UPDATE_CHECK=1

STATUS=$(cd "$ROOT" && ${SUPABASE:-npx supabase} status -o env 2>/dev/null)  # SUPABASE: a CLI already on PATH (CI)
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
# Timestamps read back in UTC: "2028-01-17 13:30:00+00".
sql() { PGTZ=UTC psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

EMAILS="'mcp-week-a@example.com', 'mcp-week-b@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
# mcp under the harness, on the stack's database (SUPABASE_DB_URL, as the edge runtime gives it).
# ---------------------------------------------------------------------------------------------
FN_PORT=${FN_PORT:-54394}
SUPABASE_URL=$API_URL SUPABASE_DB_URL=$DB_URL \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" mcp \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "mcp did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
MCP_URL="http://127.0.0.1:$FN_PORT/mcp"

# rpc KEY METHOD PARAMS_JSON -> CODE, BODY (one JSON-RPC message, the legacy era's headers)
rpc() {
  BODY=$(curl -sS -w '\n%{http_code}' -X POST "$MCP_URL" -H "Authorization: Bearer $1" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2025-11-25' \
    --data "$(jq -cn --arg m "$2" --argjson p "$3" '{jsonrpc: "2.0", id: 1, method: $m, params: $p}')")
  CODE=${BODY##*$'\n'}
  BODY=${BODY%$'\n'*}
}
# tool KEY NAME ARGS -> CODE, ERR (the result's isError), OUT (its text: JSON when it worked).
# ARGS is a jq object expression; ids are read from the environment (env.T1).
tool() {
  MARK=$(sql -c "select clock_timestamp()")
  rpc "$1" tools/call "$(jq -cn --arg n "$2" "{name: \$n, arguments: ($3)}")"
  ERR=$(jq -r '.result.isError // false' <<<"$BODY" 2>/dev/null || echo 'not json')
  OUT=$(jq -r '.result.content[0].text // empty' <<<"$BODY" 2>/dev/null || true)
}
# call LABEL KEY NAME ARGS: the tool must answer, not refuse.
call() {
  tool "$2" "$3" "$4"
  if [ "$CODE" = 200 ] && [ "$ERR" = false ]; then ok "$1"; else bad "$1 -> HTTP $CODE isError=$ERR: $(printf '%s' "${OUT:-$BODY}" | head -c 400)"; fi
}
# refused LABEL KEY NAME ARGS TEXT: a tool error whose message holds TEXT.
refused() {
  tool "$2" "$3" "$4"
  if [ "$CODE" = 200 ] && [ "$ERR" = true ] && grep -qF -- "$5" <<<"$OUT"; then ok "$1 -> refused: $(head -c 140 <<<"$OUT")"
  else bad "$1 -> HTTP $CODE isError=$ERR, want a refusal naming '$5': $(printf '%s' "${OUT:-$BODY}" | head -c 400)"; fi
}
j() { jq -r "$1" <<<"$OUT" 2>/dev/null; }
changed() { j '.changed | join(" | ")'; }
# The activity rows the last call wrote for a user, as "event_type/source", sorted.
logs() { sql -c "select coalesce(string_agg(event_type || '/' || coalesce(payload->>'source', '-'), ' ' order by event_type), '') from activity_log where user_id = '${1:-$A_ID}' and created_at > '$MARK'"; }
zone() { sql -c "update app_settings set timezone = '$2' where user_id = '$1'" >/dev/null; }

# ---------------------------------------------------------------------------------------------
# Throwaway users, each with an AI key made the way Settings → AI assistants makes it: kf_ai_ + 32
# random bytes (base64url), and only its SHA-256 upserted on user_id — as the user, through the API.
# ---------------------------------------------------------------------------------------------
PASSWORD='mcp-week-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
new_key() { # access token -> the key (stdout)
  local key hash code
  key="kf_ai_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  hash=$(printf '%s' "$key" | sha256sum | cut -d' ' -f1)
  code=$(curl -sS -o "$TMP/key.out" -w '%{http_code}' -X POST "$API_URL/rest/v1/mcp_keys?on_conflict=user_id" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -H 'Prefer: resolution=merge-duplicates,return=minimal' --data "{\"key_hash\":\"$hash\",\"scope\":\"read_write\"}")
  case "$code" in 200|201|204) printf '%s' "$key" ;; *) echo "mcp_keys upsert -> $code $(cat "$TMP/key.out")" >&2; return 1 ;; esac
}

section "setup"
drop_users
A_JSON=$(new_user mcp-week-a@example.com)
B_JSON=$(new_user mcp-week-b@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON")
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign up test users: $A_JSON" >&2; exit 2; }
KA=$(new_key "$(jq -r .access_token <<<"$A_JSON")") || exit 2
KB=$(new_key "$(jq -r .access_token <<<"$B_JSON")") || exit 2
expect "each user has one read & write key, stored as its SHA-256 only" "$A_ID read_write $(printf '%s' "$KA" | sha256sum | cut -d' ' -f1)" \
  "$(sql -c "select user_id || ' ' || scope || ' ' || key_hash from mcp_keys where user_id = '$A_ID'")"
# Both on Cairo's clock; A has a project in a domain, B a project of its own.
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone) values (:'a', 'Africa/Cairo'), (:'b', 'Africa/Cairo')
  on conflict (user_id) do update set timezone = excluded.timezone;
insert into domains (user_id, name) values (:'a', 'MCP Domain A');
insert into projects (user_id, domain_id, name) select :'a', id, 'MCP Project A' from domains where user_id = :'a';
insert into projects (user_id, name) values (:'b', 'MCP Project B');
SQL
export D1 P1 PB
D1=$(sql -c "select id from domains where user_id = '$A_ID'")
P1=$(sql -c "select id from projects where user_id = '$A_ID'")
PB=$(sql -c "select id from projects where user_id = '$B_ID'")
info "harness: mcp on :$FN_PORT; users A=$A_ID B=$B_ID; project A=$P1 (domain $D1), B=$PB"

# ---------------------------------------------------------------------------------------------
section "tools/list"
rpc "$KA" tools/list '{}'
expect "tools/list: HTTP" 200 "$CODE"
expect "tools/list: all 15 tools for a read & write key" \
  "add_event add_task add_to_inbox calendar complete_task delete_event edit_event edit_task get_task list_tasks move_to_tomorrow projects reschedule_task search today" \
  "$(jq -r '[.result.tools[].name] | sort | join(" ")' <<<"$BODY")"

# ---------------------------------------------------------------------------------------------
section "add_task with a time blocks the calendar (Africa/Cairo, UTC+2)"
call "add_task 'MCP timed' 2028-01-17T15:30, 45 min" "$KA" add_task '{title: "MCP timed", due: "2028-01-17T15:30", duration_min: 45}'
export T1; T1=$(j .added.id)
expect "answer: due on the user's clock" "2028-01-17 15:30" "$(j .added.due)"
expect "answer: the block" "2028-01-17 15:30–16:15" "$(j .calendar_block)"
expect "answer: timezone" "Africa/Cairo" "$(j .timezone)"
expect "logged" "task.created/mcp task.scheduled/mcp" "$(logs)"
expect "task row: due, schedule, duration" "2028-01-17 13:30:00+00 2028-01-17 13:30:00+00 2028-01-17 14:15:00+00 45 todo" \
  "$(sql -c "select concat_ws(' ', due_at, scheduled_start, scheduled_end, duration_min, status) from tasks where id = '$T1'")"
expect "its one block: a task block at 13:30Z–14:15Z, A's" "1 task 2028-01-17 13:30:00+00 2028-01-17 14:15:00+00 f MCP timed t" \
  "$(sql -c "select concat_ws(' ', count(*), min(type), min(starts_at), min(ends_at), bool_or(all_day), min(title), bool_and(user_id = '$A_ID')) from calendar_events where task_id = '$T1' and deleted_at is null")"
export B1; B1=$(sql -c "select id from calendar_events where task_id = '$T1'")

section "reschedule_task (Cairo)"
call "to a day and time: 2028-01-18T10:00" "$KA" reschedule_task '{id: env.T1, when: "2028-01-18T10:00"}'
expect "changed" "due 2028-01-18 10:00 | on the calendar 2028-01-18 10:00–10:45" "$(changed)"
expect "logged" "task.rescheduled/mcp task.scheduled/mcp" "$(logs)"
expect "task: due + schedule follow the block" "2028-01-18 08:00:00+00 2028-01-18 08:00:00+00 2028-01-18 08:45:00+00" \
  "$(sql -c "select concat_ws(' ', due_at, scheduled_start, scheduled_end) from tasks where id = '$T1'")"
expect "the same block moved, keeping its 45 min; no second block" "1 $B1 2028-01-18 08:00:00+00 2028-01-18 08:45:00+00 live" \
  "$(sql -c "select concat_ws(' ', count(*), min(id::text), min(starts_at), min(ends_at), case when bool_and(deleted_at is null) then 'live' else 'deleted' end) from calendar_events where task_id = '$T1'")"

call "to the block's own day only: 2028-01-18" "$KA" reschedule_task '{id: env.T1, when: "2028-01-18"}'
expect "changed" "due 2028-01-18 09:00" "$(changed)"
expect "logged" "task.rescheduled/mcp" "$(logs)"
expect "due 09:00 Cairo (07:00Z); the block on that day stays, and the schedule with it" "2028-01-18 07:00:00+00 2028-01-18 08:00:00+00 1" \
  "$(sql -c "select concat_ws(' ', due_at, scheduled_start, (select count(*) from calendar_events where task_id = t.id and deleted_at is null)) from tasks t where id = '$T1'")"

call "to another day only: 2028-01-20" "$KA" reschedule_task '{id: env.T1, when: "2028-01-20"}'
expect "changed" "due 2028-01-20 09:00 | 1 calendar block taken off the calendar (in Trash)" "$(changed)"
expect "logged" "calendar_event.deleted/mcp task.rescheduled/mcp" "$(logs)"
expect "due 09:00 Cairo, off the calendar: no schedule, the block in Trash" "2028-01-20 07:00:00+00 - - 0 1" \
  "$(sql -c "select concat_ws(' ', due_at, coalesce(scheduled_start::text, '-'), coalesce(scheduled_end::text, '-'),
     (select count(*) from calendar_events where task_id = t.id and deleted_at is null),
     (select count(*) from calendar_events where task_id = t.id and deleted_at is not null)) from tasks t where id = '$T1'")"

call "an unscheduled task (60 min) to a day and time: 2028-01-21T09:15" "$KA" add_task '{title: "MCP block me", duration_min: 60}'
export T3; T3=$(j .added.id)
expect "no time, no block" "0" "$(sql -c "select count(*) from calendar_events where task_id = '$T3'")"
call "reschedule it to 2028-01-21T09:15" "$KA" reschedule_task '{id: env.T3, when: "2028-01-21T09:15"}'
expect "changed" "due 2028-01-21 09:15 | on the calendar 2028-01-21 09:15–10:15" "$(changed)"
expect "a new block as long as its duration" "1 task 2028-01-21 07:15:00+00 2028-01-21 08:15:00+00 MCP block me" \
  "$(sql -c "select concat_ws(' ', count(*), min(type), min(starts_at), min(ends_at), min(title)) from calendar_events where task_id = '$T3' and deleted_at is null")"
export B3; B3=$(sql -c "select id from calendar_events where task_id = '$T3' and deleted_at is null")
M0=$(sql -c "select clock_timestamp()")
refused "edit_event on a task's block" "$KA" edit_event '{id: env.B3, title: "x"}' "reschedule_task"
refused "delete_event on a task's block" "$KA" delete_event '{id: env.B3}' "reschedule_task"
MARK=$M0; expect "neither wrote anything" "" "$(logs)"
call "move_to_tomorrow" "$KA" move_to_tomorrow '{id: env.T3}'
expect "answer: one block taken off" "1" "$(j .calendar_blocks_removed)"
expect "logged" "calendar_event.deleted/mcp task.rescheduled/mcp" "$(logs)"
expect "due tomorrow 09:00 Cairo; its block (another day) in Trash" "t 0" \
  "$(sql -c "select concat_ws(' ', due_at = (((now() at time zone 'Africa/Cairo')::date + 1) + time '09:00') at time zone 'Africa/Cairo',
     (select count(*) from calendar_events where task_id = t.id and deleted_at is null)) from tasks t where id = '$T3'")"

section "the same in America/Los_Angeles (UTC-8): the wall time crosses the UTC day"
zone "$A_ID" America/Los_Angeles
call "add_task 'MCP LA' 2028-01-17T20:00 (no duration: 30 min)" "$KA" add_task '{title: "MCP LA", due: "2028-01-17T20:00"}'
export TLA; TLA=$(j .added.id)
expect "answer: on LA's clock" "2028-01-17 20:00 2028-01-17 20:00–20:30 America/Los_Angeles" "$(j '"\(.added.due) \(.calendar_block) \(.timezone)"')"
expect "task due + its block: 04:00Z the next UTC day" "2028-01-18 04:00:00+00 | 2028-01-18 04:00:00+00 2028-01-18 04:30:00+00" \
  "$(sql -c "select t.due_at || ' | ' || e.starts_at || ' ' || e.ends_at from tasks t join calendar_events e on e.task_id = t.id where t.id = '$TLA'")"
call "reschedule_task to a day only: 2028-01-19" "$KA" reschedule_task '{id: env.TLA, when: "2028-01-19"}'
expect "changed" "due 2028-01-19 09:00 | 1 calendar block taken off the calendar (in Trash)" "$(changed)"
expect "due 09:00 LA = 17:00Z; no live block" "2028-01-19 17:00:00+00 0" \
  "$(sql -c "select concat_ws(' ', due_at, (select count(*) from calendar_events where task_id = t.id and deleted_at is null)) from tasks t where id = '$TLA'")"
zone "$A_ID" Africa/Cairo

# ---------------------------------------------------------------------------------------------
section "edit_task: each field, then null clears"
call "add_task 'MCP edit me'" "$KA" add_task '{title: "MCP edit me"}'
export T2; T2=$(j .added.id)
call "title, notes, duration, project" "$KA" edit_task '{id: env.T2, title: "MCP edited", notes: "some notes", duration_min: 90, project_id: env.P1}'
expect "changed" 'title → "MCP edited" | notes | duration → 90 min | project → MCP Project A' "$(changed)"
expect "logged" "task.moved/mcp task.updated/mcp task.updated/mcp task.updated/mcp" "$(logs)"
expect "task.updated fields" "duration notes title" \
  "$(sql -c "select string_agg(payload->>'field', ' ' order by payload->>'field') from activity_log where entity_id = '$T2' and event_type = 'task.updated'")"
expect "row: title, notes, duration, the project and its domain, no area" "MCP edited|some notes|90|$P1|$D1|-|-" \
  "$(sql -c "select concat_ws('|', title, notes, duration_min, project_id, domain_id, coalesce(area_id::text, '-'), coalesce(milestone_id::text, '-')) from tasks where id = '$T2'")"
call "repeat on an undated task" "$KA" edit_task '{id: env.T2, repeat: "FREQ=WEEKLY;BYDAY=MO"}'
TODAY=$(sql -c "select to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD')")
expect "changed" "repeats FREQ=WEEKLY;BYDAY=MO | due $TODAY 09:00 (a repeat starts today)" "$(changed)"
expect "logged" "task.recurrence_set/mcp task.rescheduled/mcp" "$(logs)"
expect "row: the rule; dated today 09:00 Cairo" "FREQ=WEEKLY;BYDAY=MO t" \
  "$(sql -c "select concat_ws(' ', recurrence_rule, due_at = ((now() at time zone 'Africa/Cairo')::date + time '09:00') at time zone 'Africa/Cairo') from tasks where id = '$T2'")"
call "null clears notes, duration, project, repeat" "$KA" edit_task '{id: env.T2, notes: null, duration_min: null, project_id: null, repeat: null}'
expect "changed" "notes cleared | duration cleared | out of its project | no longer repeats" "$(changed)"
expect "logged" "task.moved/mcp task.recurrence_set/mcp task.updated/mcp task.updated/mcp" "$(logs)"
expect "row: all four cleared (and the domain with the project); title and due kept" "MCP edited|-|-|-|-|-|t" \
  "$(sql -c "select concat_ws('|', title, coalesce(notes, '-'), coalesce(duration_min::text, '-'), coalesce(project_id::text, '-'), coalesce(domain_id::text, '-'), coalesce(recurrence_rule, '-'), due_at is not null) from tasks where id = '$T2'")"
refused "a title can't be cleared" "$KA" edit_task '{id: env.T2, title: null}' '"title" is required'
call "the same title again" "$KA" edit_task '{id: env.T2, title: "MCP edited"}'
expect "nothing changed, nothing written" "|" "$(changed)|$(logs)"

# ---------------------------------------------------------------------------------------------
section "complete_task: a paused series doesn't spawn; a running one does"
call "add_task 'MCP paused daily' 2028-01-17, FREQ=DAILY" "$KA" add_task '{title: "MCP paused daily", due: "2028-01-17", repeat: "FREQ=DAILY"}'
export T5; T5=$(j .added.id)
expect "logged" "task.created/mcp task.recurrence_set/mcp" "$(logs)"
sql -c "update tasks set paused = true where id = '$T5'" >/dev/null  # Perennials ‖ (no MCP tool pauses)
call "complete the paused one" "$KA" complete_task '{id: env.T5}'
expect "answer: done, no next" "done null" "$(j '"\(.done.status) \(.next)"')"
expect "logged" "task.completed/mcp" "$(logs)"
expect "rows titled 'MCP paused daily': only the done one" "done" \
  "$(sql -c "select string_agg(status, ' ') from tasks where user_id = '$A_ID' and title = 'MCP paused daily'")"
call "add_task 'MCP daily' 2028-01-17, FREQ=DAILY" "$KA" add_task '{title: "MCP daily", due: "2028-01-17", repeat: "FREQ=DAILY"}'
export T6; T6=$(j .added.id)
call "complete the running one" "$KA" complete_task '{id: env.T6}'
expect "answer: next on 2028-01-18 09:00" "2028-01-18 09:00" "$(j .next.due)"
expect "logged" "task.completed/mcp task.created/mcp" "$(logs)"
expect "rows titled 'MCP daily': done at 07:00Z, next todo at 07:00Z the next day" "done 2028-01-17 07:00:00+00 | todo 2028-01-18 07:00:00+00 FREQ=DAILY" \
  "$(sql -c "select string_agg(concat_ws(' ', status, due_at, case when status = 'todo' then recurrence_rule end), ' | ' order by due_at) from tasks where user_id = '$A_ID' and title = 'MCP daily'")"

# ---------------------------------------------------------------------------------------------
section "add_event: an event, a Time block, all-day, a series"
call "event 2028-01-17T11:00, 60 min" "$KA" add_event '{title: "MCP meeting", start: "2028-01-17T11:00", duration_min: 60}'
export E1; E1=$(j .added.id)
expect "answer" "2028-01-17 11:00 2028-01-17 12:00 null" "$(j '"\(.added.start) \(.added.end) \(.added.kind)"')"
expect "logged" "calendar_event.created/mcp" "$(logs)"
expect "row" "event 2028-01-17 09:00:00+00 2028-01-17 10:00:00+00 f - - native" \
  "$(sql -c "select concat_ws(' ', type, starts_at, ends_at, all_day, coalesce(task_id::text, '-'), coalesce(recurrence_rule, '-'), source) from calendar_events where id = '$E1'")"
call "Time block 13:00–15:00" "$KA" add_event '{title: "MCP focus", start: "2028-01-17T13:00", end: "2028-01-17T15:00", kind: "time_block"}'
export E2; E2=$(j .added.id)
expect "answer: kind" "time_block" "$(j .added.kind)"
expect "row" "time_block 2028-01-17 11:00:00+00 2028-01-17 13:00:00+00 f" \
  "$(sql -c "select concat_ws(' ', type, starts_at, ends_at, all_day) from calendar_events where id = '$E2'")"
call "all-day 2028-01-19 to 2028-01-21" "$KA" add_event '{title: "MCP trip", start: "2028-01-19", end: "2028-01-21"}'
export E3; E3=$(j .added.id)
expect "answer: its days" "2028-01-19 2028-01-21 true" "$(j '"\(.added.start) \(.added.end) \(.added.all_day)"')"
expect "row: UTC midnights, end exclusive" "2028-01-19 00:00:00+00 2028-01-22 00:00:00+00 t" \
  "$(sql -c "select concat_ws(' ', starts_at, ends_at, all_day) from calendar_events where id = '$E3'")"
call "series Mon+Wed 09:30, 15 min" "$KA" add_event '{title: "MCP standup", start: "2028-01-17T09:30", duration_min: 15, repeat: "FREQ=WEEKLY;BYDAY=MO,WE"}'
export S1; S1=$(j .added.id)
expect "row: one row, the rule, no skips" "FREQ=WEEKLY;BYDAY=MO,WE 2028-01-17 07:30:00+00 2028-01-17 07:45:00+00 {}" \
  "$(sql -c "select concat_ws(' ', recurrence_rule, starts_at, ends_at, recurrence_exdates) from calendar_events where id = '$S1'")"
call "calendar 2028-01-17..23" "$KA" calendar '{from: "2028-01-17", to: "2028-01-23"}'
expect "the series' occurrences" "2028-01-17 09:30,2028-01-19 09:30" "$(j '[.events[] | select(.id == env.S1) | .start] | join(",")')"
expect "the all-day event as its days" "2028-01-19–2028-01-21" "$(j '[.events[] | select(.id == env.E3) | "\(.start)–\(.end)"] | join(",")')"
refused "a series that doesn't start on its rule (a Tuesday, MO,WE)" "$KA" add_event \
  '{title: "MCP misaligned", start: "2028-01-18T09:00", repeat: "FREQ=WEEKLY;BYDAY=MO,WE"}' "its first one would be 2028-01-19 09:00"
expect "nothing written" "0 " "$(sql -c "select count(*) from calendar_events where title = 'MCP misaligned'") $(logs)"

section "edit_event"
call "a one-off moved: keeps its length" "$KA" edit_event '{id: env.E1, start: "2028-01-17T12:00"}'
expect "changed" "time → 2028-01-17 12:00–13:00" "$(changed)"
expect "logged" "calendar_event.updated/mcp" "$(logs)"
expect "row" "2028-01-17 10:00:00+00 2028-01-17 11:00:00+00" "$(sql -c "select concat_ws(' ', starts_at, ends_at) from calendar_events where id = '$E1'")"
call "title + kind" "$KA" edit_event '{id: env.E2, title: "MCP focus renamed", kind: "event"}'
expect "changed" 'title → "MCP focus renamed" | kind → event' "$(changed)"
expect "row" "MCP focus renamed event" "$(sql -c "select concat_ws(' ', title, type) from calendar_events where id = '$E2'")"
call "one occurrence (Wed 09:30) to Thu 16:00" "$KA" edit_event '{id: env.S1, occurrence: "2028-01-19T09:30", start: "2028-01-20T16:00"}'
expect "changed" "time → 2028-01-20 16:00–16:15 | only the 2028-01-19 09:30–09:45 occurrence: it is an event of its own now" "$(changed)"
expect "logged" "calendar_event.created/mcp" "$(logs)"
expect "the series skips that start" "{2028-01-19T07:30:00.000Z}" "$(sql -c "select recurrence_exdates from calendar_events where id = '$S1'")"
expect "a one-off copy linked to the series takes the change" "1 MCP standup 2028-01-20 14:00:00+00 2028-01-20 14:15:00+00 - event" \
  "$(sql -c "select concat_ws(' ', count(*), min(title), min(starts_at), min(ends_at), coalesce(min(recurrence_rule), '-'), min(type)) from calendar_events where series_id = '$S1' and deleted_at is null")"
export C1; C1=$(sql -c "select id from calendar_events where series_id = '$S1'")
call "the whole series: 10:00 and a new title" "$KA" edit_event '{id: env.S1, start: "2028-01-17T10:00", title: "MCP standup v2"}'
expect "changed" 'title → "MCP standup v2" | time → 10:00–10:15, every occurrence' "$(changed)"
expect "logged" "calendar_event.updated/mcp" "$(logs)"
expect "row: new time, same first day; its skipped start moved with it" "MCP standup v2 2028-01-17 08:00:00+00 2028-01-17 08:15:00+00 {2028-01-19T08:00:00.000Z}" \
  "$(sql -c "select concat_ws(' ', title, starts_at, ends_at, recurrence_exdates) from calendar_events where id = '$S1'")"
expect "no rows added" "2" "$(sql -c "select count(*) from calendar_events where id = '$S1' or series_id = '$S1'")"
call "calendar 2028-01-17..23" "$KA" calendar '{from: "2028-01-17", to: "2028-01-23"}'
expect "the series: Mon 10:00 only (Wed still skipped); the moved one on Thu" "2028-01-17 10:00 | 2028-01-20 16:00 MCP standup" \
  "$(j '([.events[] | select(.id == env.S1) | .start] | join(",")) + " | " + ([.events[] | select(.id == env.C1) | "\(.start) \(.title)"] | join(","))')"

section "delete_event"
call "one occurrence (Mon 2028-01-24 10:00)" "$KA" delete_event '{id: env.S1, occurrence: "2028-01-24T10:00"}'
expect "changed" "skipped the 2028-01-24 10:00–10:15 occurrence; the rest of the series stays" "$(changed)"
expect "logged" "calendar_event.deleted/mcp" "$(logs)"
expect "row: live, two skips" "live {2028-01-19T08:00:00.000Z,2028-01-24T08:00:00.000Z}" \
  "$(sql -c "select concat_ws(' ', case when deleted_at is null then 'live' else 'deleted' end, recurrence_exdates) from calendar_events where id = '$S1'")"
call "calendar 2028-01-24..30" "$KA" calendar '{from: "2028-01-24", to: "2028-01-30"}'
expect "the series: Wed only" "2028-01-26 10:00" "$(j '[.events[] | select(.id == env.S1) | .start] | join(",")')"
call "the whole series" "$KA" delete_event '{id: env.S1}'
expect "changed" "the whole series moved to Trash, with 1 occurrence moved out of it" "$(changed)"
expect "logged: the series and its moved-out one" "calendar_event.deleted/mcp calendar_event.deleted/mcp" "$(logs)"
expect "both in Trash" "2" "$(sql -c "select count(*) from calendar_events where (id = '$S1' or series_id = '$S1') and deleted_at is not null")"
call "a one-off" "$KA" delete_event '{id: env.E2}'
expect "changed" "the event moved to Trash" "$(changed)"
expect "row in Trash; the others untouched" "t f f" \
  "$(sql -c "select concat_ws(' ', bool_or(id = '$E2' and deleted_at is not null), bool_or(id = '$E1' and deleted_at is not null), bool_or(id = '$E3' and deleted_at is not null)) from calendar_events where id in ('$E1', '$E2', '$E3')")"

# ---------------------------------------------------------------------------------------------
section "the rest of the tools answer from the database"
call "add_to_inbox" "$KA" add_to_inbox '{text: "MCP inbox note", url: "https://example.com/x"}'
expect "logged" "inbox.captured/mcp" "$(logs)"
expect "row" "pending https://example.com/x mcp" "$(sql -c "select concat_ws(' ', status, payload->>'url', payload->>'source') from inbox_items where user_id = '$A_ID'")"
call "today" "$KA" today '{}'
call "list_tasks (all)" "$KA" list_tasks '{status: "all"}'
expect "list_tasks: A's 7 tasks (6 added + 1 spawned)" "7" "$(j .count)"
call "get_task" "$KA" get_task '{id: env.T2}'
expect "get_task: the edited one" "MCP edited" "$(j .task.title)"
call "projects" "$KA" projects '{}'
expect "projects: A's only" "MCP Project A" "$(j '[.projects[].name] | join(",")')"
call "search" "$KA" search '{query: "MCP edited"}'

# ---------------------------------------------------------------------------------------------
section "ownership: A's key never reaches B's rows (RLS as the key's owner)"
call "B: add_task 'MCP B private' 2028-01-17T08:00" "$KB" add_task '{title: "MCP B private", due: "2028-01-17T08:00"}'
export TB; TB=$(j .added.id)
call "B: add_event 'MCP B event'" "$KB" add_event '{title: "MCP B event", start: "2028-01-17T18:00"}'
export EB; EB=$(j .added.id)
export BB; BB=$(sql -c "select id from calendar_events where task_id = '$TB'")
BEFORE=$(sql -c "select string_agg(concat_ws(' ', id, title, status, due_at, scheduled_start, updated_at), ' | ' order by id) from tasks where user_id = '$B_ID'")
BEFORE_E=$(sql -c "select string_agg(concat_ws(' ', id, title, starts_at, deleted_at, updated_at), ' | ' order by id) from calendar_events where user_id = '$B_ID'")
refused "A: get_task B's task" "$KA" get_task '{id: env.TB}' "No task with id"
refused "A: edit_task B's task" "$KA" edit_task '{id: env.TB, title: "taken"}' "No task with id"
refused "A: reschedule_task B's task" "$KA" reschedule_task '{id: env.TB, when: "2028-01-25T10:00"}' "No task with id"
refused "A: complete_task B's task" "$KA" complete_task '{id: env.TB}' "No task with id"
refused "A: move_to_tomorrow B's task" "$KA" move_to_tomorrow '{id: env.TB}' "No task with id"
refused "A: edit_event B's event" "$KA" edit_event '{id: env.EB, title: "taken"}' "No event with id"
refused "A: delete_event B's event" "$KA" delete_event '{id: env.EB}' "No event with id"
refused "A: delete_event B's task block" "$KA" delete_event '{id: env.BB}' "No event with id"
refused "A: edit_task into B's project" "$KA" edit_task '{id: env.T2, project_id: env.PB}' "No project with id"
refused "A: add_task into B's project" "$KA" add_task '{title: "MCP into B", project_id: env.PB}' "No project with id"
call "A: calendar 2028-01-17" "$KA" calendar '{from: "2028-01-17", to: "2028-01-17"}'
expect "A's calendar shows none of B's" "0" "$(j '[.events[] | select(.title | startswith("MCP B"))] | length')"
call "A: list_tasks (all)" "$KA" list_tasks '{status: "all"}'
expect "A's list shows none of B's" "0" "$(j '[.tasks[] | select(.id == env.TB)] | length')"
call "A: search 'MCP B private'" "$KA" search '{query: "MCP B private"}'
expect "A's search finds none of B's" "0" "$(j '[.results[] | select(.id == env.TB or .id == env.EB)] | length')"
expect "B's tasks untouched" "$BEFORE" "$(sql -c "select string_agg(concat_ws(' ', id, title, status, due_at, scheduled_start, updated_at), ' | ' order by id) from tasks where user_id = '$B_ID'")"
expect "B's events untouched" "$BEFORE_E" "$(sql -c "select string_agg(concat_ws(' ', id, title, starts_at, deleted_at, updated_at), ' | ' order by id) from calendar_events where user_id = '$B_ID'")"
expect "no task 'MCP into B' anywhere" "0" "$(sql -c "select count(*) from tasks where title = 'MCP into B'")"
expect "A logged nothing about B's rows" "0" "$(sql -c "select count(*) from activity_log where user_id = '$A_ID' and entity_id in ('$TB', '$EB', '$BB')")"
expect "every activity row of A's and B's says source mcp" "0"\
  "$(sql -c "select count(*) from activity_log where user_id in ('$A_ID', '$B_ID') and payload->>'source' is distinct from 'mcp'")"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E '^mcp( tool [a-z_]+)?:' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0 0 0" "$(sql -c "select concat_ws(' ',
  (select count(*) from tasks where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from calendar_events where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from activity_log where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from mcp_keys where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from auth.users where id in ('$A_ID', '$B_ID')))")"

if [ "$FAIL" != 0 ]; then echo; echo "-- mcp harness log (last 60 lines) --"; tail -60 "$TMP/harness.log"; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
