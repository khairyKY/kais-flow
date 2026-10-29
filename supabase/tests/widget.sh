#!/usr/bin/env bash
# The desktop widgets' feed (function `widget`, migration 0090; handoff 2026-10-29-*-widget-feed) against real
# Postgres: a bad or revoked token is 401, the feed's JSON shape, a link only ever reads its own user's rows,
# names=0, the hourly limit, tick refused on a read-only link, and tick through the app's completion rules
# (a repeat spawns its next round, activity_log source 'widget'). The function runs under plain Deno
# (supabase/tests/harness/runner.ts) on the stack's database, exactly as deployed: each request is one
# transaction that switches to the link owner's role, so RLS is the real one.
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/widget.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, openssl. "Today" is the real today: the rows are placed
# around now(), which is today on any clock.
#
# Side effects: two throwaway accounts, widget-a@ / widget-b@example.com. Deleted (with every row they own —
# cascade) before the run and again at the end.
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
sql() { PGTZ=UTC psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

EMAILS="'widget-a@example.com', 'widget-b@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
# widget under the harness, on the stack's database (SUPABASE_DB_URL, as the edge runtime gives it).
# ---------------------------------------------------------------------------------------------
FN_PORT=${FN_PORT:-54395}
SUPABASE_URL=$API_URL SUPABASE_DB_URL=$DB_URL \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" widget \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "widget did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
W="http://127.0.0.1:$FN_PORT/widget"

# get TOKEN [QUERY] -> CODE, BODY, CACHE (the Cache-Control header)
get() {
  local out
  out=$(curl -sS -D "$TMP/h" -w '\n%{http_code}' "$W?t=$1${2:-}")
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
  CACHE=$(tr -d '\r' < "$TMP/h" | sed -n 's/^[Cc]ache-[Cc]ontrol: //p' | head -1)
}
# tick TOKEN TASK_ID -> CODE, BODY
tick() {
  local out
  out=$(curl -sS -w '\n%{http_code}' -X POST "$W?t=$1&tick=$2")
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
j() { jq -r "$1" <<<"$BODY" 2>/dev/null; }

# ---------------------------------------------------------------------------------------------
# Throwaway users, each with Widget links made the way Settings → Windows desktop makes them: kf_w_ + 32
# random bytes (base64url), and only its SHA-256 inserted — as the user, through the API.
# ---------------------------------------------------------------------------------------------
PASSWORD='widget-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
new_link() { # access token, label, can_tick -> the token (stdout)
  local tok hash code
  tok="kf_w_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  hash=$(printf '%s' "$tok" | sha256sum | cut -d' ' -f1)
  code=$(curl -sS -o "$TMP/link.out" -w '%{http_code}' -X POST "$API_URL/rest/v1/widget_links" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
    --data "{\"token_hash\":\"$hash\",\"label\":\"$2\",\"can_tick\":$3}")
  case "$code" in 200|201|204) printf '%s' "$tok" ;; *) echo "widget_links insert -> $code $(cat "$TMP/link.out")" >&2; return 1 ;; esac
}

section "setup"
drop_users
A_JSON=$(new_user widget-a@example.com)
B_JSON=$(new_user widget-b@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON")
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign up test users: $A_JSON" >&2; exit 2; }
RA=$(new_link "$A_JWT" 'A read only' false) || exit 2
TA=$(new_link "$A_JWT" 'A ticks' true) || exit 2
RV=$(new_link "$A_JWT" 'A revoked' false) || exit 2
TB=$(new_link "$(jq -r .access_token <<<"$B_JSON")" 'B ticks' true) || exit 2
expect "links stored as their SHA-256 only, read-only by default" "A read only false $(printf '%s' "$RA" | sha256sum | cut -d' ' -f1)" \
  "$(sql -c "select label || ' ' || can_tick || ' ' || token_hash from widget_links where user_id = '$A_ID' and label = 'A read only'")"
code=$(curl -sS -o "$TMP/sel.out" -w '%{http_code}' "$API_URL/rest/v1/widget_links?select=token_hash" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_JWT")
expect "the app can't read a hash back (column grants)" "401 or 403" "$(case "$code" in 401|403) echo '401 or 403' ;; *) echo "$code $(cat "$TMP/sel.out")" ;; esac)"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/rest/v1/widget_links?select=id,label,can_tick,last_used_at&revoked_at=is.null" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_JWT")
expect "…but lists its links (Settings' query)" 200 "$code"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH "$API_URL/rest/v1/widget_links?label=eq.A%20revoked" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_JWT" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' --data "{\"revoked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}")
expect "Revoke (an update of revoked_at, as the user)" 204 "$code"

# A: the goal with its block running now, a second pick, a task for today, a daily repeat, one overdue.
# B: a pick and a task of its own. Both on Cairo's clock.
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone) values (:'a', 'Africa/Cairo'), (:'b', 'Africa/Cairo')
  on conflict (user_id) do update set timezone = excluded.timezone;
insert into tasks (user_id, title, top3, top3_rank, priority, duration_min, due_at) values
  (:'a', 'Widget goal', true, 1, 1, 60, now()),
  (:'a', 'Widget pick two', true, 2, null, 30, now()),
  (:'b', 'Widget B secret pick', true, 1, null, null, now());
insert into tasks (user_id, title, due_at) values
  (:'a', 'Widget today task', now()),
  (:'a', 'Widget overdue', now() - interval '3 days'),
  (:'b', 'Widget B secret task', now());
insert into tasks (user_id, title, due_at, recurrence_rule) values (:'a', 'Widget daily', now(), 'FREQ=DAILY');
insert into calendar_events (user_id, title, starts_at, ends_at, type, task_id)
  select :'a', 'Widget goal', now() - interval '10 minutes', now() + interval '50 minutes', 'task', id from tasks where user_id = :'a' and title = 'Widget goal';
insert into calendar_events (user_id, title, starts_at, ends_at, color) values
  (:'a', 'Widget later', now() + interval '15 minutes', now() + interval '25 minutes', '#a8a0be'),
  (:'b', 'Widget B secret event', now() - interval '5 minutes', now() + interval '1 hour', null);
SQL
GOAL=$(sql -c "select id from tasks where user_id = '$A_ID' and title = 'Widget goal'")
DAILY=$(sql -c "select id from tasks where user_id = '$A_ID' and title = 'Widget daily'")
BTASK=$(sql -c "select id from tasks where user_id = '$B_ID' and title = 'Widget B secret task'")
info "harness: widget on :$FN_PORT; users A=$A_ID B=$B_ID"

# ---------------------------------------------------------------------------------------------
section "bad and revoked tokens: 401"
get "nonsense"
expect "a malformed token" "401 unauthorized" "$CODE $(j .error)"
get "kf_w_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
expect "a well-formed token nobody made" "401 unauthorized" "$CODE $(j .error)"
get "$RV"
expect "a revoked link" "401 unauthorized" "$CODE $(j .error)"
expect "…not cached" "no-store" "$CACHE"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$W?t=$RA")
expect "a method other than GET / POST tick" 405 "$code"

# ---------------------------------------------------------------------------------------------
section "the feed's JSON shape"
get "$RA"
expect "GET with A's read-only link" 200 "$CODE"
expect "Cache-Control" "max-age=30" "$CACHE"
expect "top-level keys" "can_tick date day done goal load next_blocks now now_block overdue plant progress tasks tasks_more top3 total updated_at v zone" "$(j 'keys | join(" ")')"
expect "v, zone, date (Cairo's today)" "1 Africa/Cairo $(TZ=Africa/Cairo date +%Y-%m-%d)" "$(j '"\(.v) \(.zone) \(.date)"')"
expect "the goal" "$GOAL Widget goal false 1" "$(j '"\(.goal.id) \(.goal.title) \(.goal.done) \(.goal.priority)"')"
expect "the Top 3, the goal first" "Widget goal|Widget pick two" "$(j '[.top3[].title] | join("|")')"
expect "an item's keys" "done id priority title" "$(j '.top3[0] | keys | join(" ")')"
expect "today's open tasks (not the picks, not the overdue one)" "Widget daily|Widget today task" "$(j '[.tasks[].title] | sort | join("|")')"
expect "overdue counted" "1" "$(j .overdue)"
expect "now: the goal's block, Iris, its kind" "Widget goal true #B59CE3 task $GOAL" "$(j '"\(.now_block.title) \(.now_block.is_goal) \(.now_block.color) \(.now_block.kind) \(.now_block.task_id)"')"
expect "a block's keys" "color end end_hm is_goal kind start start_hm task_id title" "$(j '.now_block | keys | join(" ")')"
expect "next: the later block, its pre-palette-C lavender drawn as Iris" "Widget later #B59CE3" "$(j '[.next_blocks[] | "\(.title) \(.color)"] | join("|")')"
expect "start/end are epoch seconds around now" "true" "$(j "(.now - $(date +%s)) as \$d | (.now_block.start < .now) and (.now_block.end > .now) and \$d < 120 and \$d > -120")"
expect "the day bar holds both blocks (keys)" "2 color done end from_min is_goal start to_min" "$(j '"\(.day | length) \(.day[0] | keys | join(" "))"')"
expect "progress 0–1, done, total, plant" "0 0 4 opening" "$(j '"\(.progress) \(.done) \(.total) \(.plant)"')"
expect "load's keys, numbers" "free_min over_min planned_min true" "$(j '"\(.load | keys | join(" ")) \([.load[]] | all(type == "number"))"')"
expect "can_tick on a read-only link" "false" "$(j .can_tick)"
expect "the call is counted and stamped" "1 true" "$(sql -c "select calls || ' ' || (last_used_at > now() - interval '1 minute') from widget_links where token_hash = encode(sha256('$RA'::bytea), 'hex')")"

section "names=0 hides every title"
get "$RA" "&names=0"
expect "names=0: 200" 200 "$CODE"
expect "no title of A's in the body" "0" "$(grep -c 'Widget' <<<"$BODY")"
expect "the masked words" "Your goal|Pick 2|A task|Your goal" "$(j '[.goal.title, .top3[1].title, .tasks[0].title, .now_block.title] | join("|")')"

# ---------------------------------------------------------------------------------------------
section "ownership: a link only ever reads its own user's rows"
get "$RA"
expect "A's feed has none of B's titles" "0" "$(grep -c 'Widget B' <<<"$BODY")"
expect "A's feed has none of B's ids" "0" "$(grep -c "$BTASK" <<<"$BODY")"
get "$TB"
expect "B's feed: B's pick and task, B's block" "Widget B secret pick|Widget B secret task|Widget B secret event" "$(j '[.goal.title, .tasks[0].title, .now_block.title] | join("|")')"
expect "B's feed has none of A's" "0" "$(grep -c 'Widget goal\|Widget today\|Widget daily\|Widget later' <<<"$BODY")"

# ---------------------------------------------------------------------------------------------
section "tick"
MARK=$(sql -c "select clock_timestamp()")
tick "$RA" "$GOAL"
expect "refused on a read-only link" "403 read_only" "$CODE $(j .error)"
expect "…the task is still open" "todo" "$(sql -c "select status from tasks where id = '$GOAL'")"
tick "$TA" "not-a-uuid"
expect "a task id that isn't one" "400 bad_task" "$CODE $(j .error)"
tick "$TA" "$BTASK"
expect "A's tick link on B's task: not A's (RLS)" "409 not_open" "$CODE $(j .error)"
expect "…B's task untouched" "todo" "$(sql -c "select status from tasks where id = '$BTASK'")"
tick "$RV" "$GOAL"
expect "a revoked link can't tick" "401" "$CODE"
tick "$TA" "$DAILY"
expect "ticks the daily repeat" "200 $DAILY" "$CODE $(j .done)"
NEXT=$(j .next)
expect "…and names its next round" "true" "$([ -n "$NEXT" ] && [ "$NEXT" != null ] && [ "$NEXT" != "$DAILY" ] && echo true || echo "false ($NEXT)")"
expect "the daily: done now, next round open the next day at the same time (Cairo), same rule" "done|todo 1 t FREQ=DAILY" \
  "$(sql -c "select (select status from tasks where id = '$DAILY') || '|' || (select concat_ws(' ', n.status,
    (n.due_at at time zone 'Africa/Cairo')::date - (d.due_at at time zone 'Africa/Cairo')::date,
    to_char(n.due_at at time zone 'Africa/Cairo', 'HH24:MI') = to_char(d.due_at at time zone 'Africa/Cairo', 'HH24:MI'), n.recurrence_rule)
    from tasks n, tasks d where n.id = '$NEXT' and d.id = '$DAILY')")"
expect "activity: task.completed + task.created, source widget" "task.completed/widget task.created/widget" \
  "$(sql -c "select string_agg(event_type || '/' || coalesce(payload->>'source', '-'), ' ' order by event_type) from activity_log where user_id = '$A_ID' and created_at > '$MARK'")"
tick "$TA" "$DAILY"
expect "ticking it again: not open any more" "409 not_open" "$CODE $(j .error)"
tick "$TA" "$GOAL"
expect "ticks the goal" "200 null" "$CODE $(j .next)"
get "$TA"
expect "the feed after: the goal stays the goal, done; no block running (its task is done)" "Widget goal true null 2" "$(j '"\(.goal.title) \(.goal.done) \(.now_block) \(.done)"')"

# ---------------------------------------------------------------------------------------------
section "the hourly limit"
sql -c "update widget_links set calls = 300, calls_hour = date_trunc('hour', now()) where token_hash = encode(sha256('$RA'::bytea), 'hex')" >/dev/null
get "$RA"
expect "past 300 calls this hour" "429 rate_limited" "$CODE $(j .error)"
get "$TA"
expect "another link is not affected" 200 "$CODE"
sql -c "update widget_links set calls_hour = date_trunc('hour', now()) - interval '1 hour' where token_hash = encode(sha256('$RA'::bytea), 'hex')" >/dev/null
get "$RA"
expect "a new hour starts the count again" "200 1" "$CODE $(sql -c "select calls from widget_links where token_hash = encode(sha256('$RA'::bytea), 'hex')")"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E '^widget:' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0 0 0" "$(sql -c "select concat_ws(' ',
  (select count(*) from tasks where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from calendar_events where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from activity_log where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from widget_links where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from auth.users where id in ('$A_ID', '$B_ID')))")"

if [ "$FAIL" != 0 ]; then echo; echo "-- widget harness log (last 60 lines) --"; tail -60 "$TMP/harness.log"; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
