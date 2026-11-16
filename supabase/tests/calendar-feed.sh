#!/usr/bin/env bash
# Your own calendar link (function `calendar-feed`, migration 0096, v1.6.4 F5) against real Postgres: a bad or
# revoked token is 401, the headers, what is in the ICS (native events, a repeat expanded, an all-day one, an Arabic
# title, a Time block and its tasks, a task block) and what is not (Google and subscribed events, trashed rows, the
# block of a done task, another user's rows), Busy-only, no scheduled tasks, the hourly limit, and the table's grants
# (the app can't read a hash back). The function runs under plain Deno (supabase/tests/harness/runner.ts) on the
# stack's database, exactly as deployed: each request is one transaction that switches to the link owner's role,
# so RLS is the real one. The writer's own rules (folding, escaping, UTC, all-day) are the vitest suite's:
# app/src/features/settings/calendarFeed.test.ts.
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/calendar-feed.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, openssl. The rows are placed around now().
#
# Side effects: two throwaway accounts, cfeed-a@ / cfeed-b@example.com. Deleted (with every row they own —
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

EMAILS="'cfeed-a@example.com', 'cfeed-b@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
# calendar-feed under the harness, on the stack's database (SUPABASE_DB_URL, as the edge runtime gives it).
# ---------------------------------------------------------------------------------------------
FN_PORT=${FN_PORT:-31397}
SUPABASE_URL=$API_URL SUPABASE_DB_URL=$DB_URL \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" calendar-feed \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "calendar-feed did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
F="http://127.0.0.1:$FN_PORT/calendar-feed"

# get TOKEN -> CODE, BODY (the ICS, CRs stripped for grep), CTYPE and CACHE (the headers)
get() {
  local out
  out=$(curl -sS -D "$TMP/h" -w '\n%{http_code}' "$F?t=$1")
  CODE=${out##*$'\n'}; BODY=$(printf '%s' "${out%$'\n'*}" | tr -d '\r')
  CTYPE=$(tr -d '\r' < "$TMP/h" | sed -n 's/^[Cc]ontent-[Tt]ype: //p' | head -1)
  CACHE=$(tr -d '\r' < "$TMP/h" | sed -n 's/^[Cc]ache-[Cc]ontrol: //p' | head -1)
}
has() { grep -cF -- "$1" <<<"$BODY"; }  # how many lines of the feed contain $1
# The feed unfolded (a folded line continues on the next one, after one space) — for the long Arabic title.
unfolded() { printf '%s' "$BODY" | sed ':a;N;$!ba;s/\n //g'; }

# ---------------------------------------------------------------------------------------------
# Throwaway users, each with calendar links made the way Settings → Your calendar link makes them: kf_c_ + 32
# random bytes (base64url), and only its SHA-256 inserted — as the user, through the API.
# ---------------------------------------------------------------------------------------------
PASSWORD='cfeed-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
new_link() { # access token, label, include_tasks, titles -> the token (stdout)
  local tok hash code
  tok="kf_c_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  hash=$(printf '%s' "$tok" | sha256sum | cut -d' ' -f1)
  code=$(curl -sS -o "$TMP/link.out" -w '%{http_code}' -X POST "$API_URL/rest/v1/calendar_feed_links" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
    --data "{\"token_hash\":\"$hash\",\"label\":\"$2\",\"include_tasks\":$3,\"titles\":$4}")
  case "$code" in 200|201|204) printf '%s' "$tok" ;; *) echo "calendar_feed_links insert -> $code $(cat "$TMP/link.out")" >&2; return 1 ;; esac
}

section "setup"
drop_users
A_JSON=$(new_user cfeed-a@example.com)
B_JSON=$(new_user cfeed-b@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON")
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign up test users: $A_JSON" >&2; exit 2; }
FULL=$(new_link "$A_JWT" 'A full' true true) || exit 2
BUSY=$(new_link "$A_JWT" 'A busy only' true false) || exit 2
NOTASK=$(new_link "$A_JWT" 'A no tasks' false true) || exit 2
RV=$(new_link "$A_JWT" 'A revoked' true true) || exit 2
TB=$(new_link "$(jq -r .access_token <<<"$B_JSON")" 'B full' true true) || exit 2
expect "a link is stored as its SHA-256 only; tasks and titles on by default are the app's choice, sent here" "A full true true $(printf '%s' "$FULL" | sha256sum | cut -d' ' -f1)" \
  "$(sql -c "select label || ' ' || include_tasks || ' ' || titles || ' ' || token_hash from calendar_feed_links where user_id = '$A_ID' and label = 'A full'")"
code=$(curl -sS -o "$TMP/sel.out" -w '%{http_code}' "$API_URL/rest/v1/calendar_feed_links?select=token_hash" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_JWT")
expect "the app can't read a hash back (column grants)" "401 or 403" "$(case "$code" in 401|403) echo '401 or 403' ;; *) echo "$code $(cat "$TMP/sel.out")" ;; esac)"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/rest/v1/calendar_feed_links?select=id,label,include_tasks,titles,created_at,last_used_at&revoked_at=is.null" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_JWT")
expect "…but lists its links (Settings' query)" 200 "$code"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH "$API_URL/rest/v1/calendar_feed_links?label=eq.A%20revoked" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_JWT" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' --data "{\"revoked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}")
expect "Revoke (an update of revoked_at, as the user)" 204 "$code"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH "$API_URL/rest/v1/calendar_feed_links?label=eq.A%20full" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_JWT" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' --data '{"calls":0}')
expect "…and can't reset its own hourly counter" "401 or 403" "$(case "$code" in 401|403) echo '401 or 403' ;; *) echo "$code" ;; esac)"

# A: a one-off tomorrow, a weekly repeat begun 2 days ago, an all-day, an Arabic title, a Time block holding a task,
# a block of an open task and one of a done task, a Google event, a subscribed event, a trashed one. B: one event.
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone) values (:'a', 'Africa/Cairo'), (:'b', 'Africa/Cairo')
  on conflict (user_id) do update set timezone = excluded.timezone;
insert into tasks (user_id, title, status, completed_at) values (:'a', 'CF done task', 'done', now());
insert into tasks (user_id, title) values (:'a', 'CF open task');
insert into calendar_events (user_id, title, starts_at, ends_at) values
  (:'a', 'CF Standup, daily; sync', now() + interval '1 day', now() + interval '1 day 30 minutes'),
  (:'a', 'اجتماع الفريق الأسبوعي لمراجعة الخطة والميزانية والمهام المتبقية', now() + interval '2 days', now() + interval '2 days 1 hour'),
  (:'b', 'CF B secret event', now() + interval '1 day', now() + interval '1 day 1 hour');
insert into calendar_events (user_id, title, starts_at, ends_at, recurrence_rule) values
  (:'a', 'CF Gym', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'FREQ=WEEKLY');
insert into calendar_events (user_id, title, starts_at, ends_at, all_day) values
  (:'a', 'CF Holiday', date_trunc('day', now() + interval '5 days'), date_trunc('day', now() + interval '6 days'), true);
insert into calendar_events (user_id, title, starts_at, ends_at, source) values
  (:'a', 'CF Google secret', now() + interval '1 day', now() + interval '1 day 1 hour', 'gcal'),
  (:'a', 'CF Subscribed secret', now() + interval '1 day', now() + interval '1 day 1 hour', 'ics');
insert into calendar_events (user_id, title, starts_at, ends_at, deleted_at) values
  (:'a', 'CF Trashed', now() + interval '1 day', now() + interval '1 day 1 hour', now());
insert into calendar_events (user_id, title, starts_at, ends_at, type, task_id)
  select :'a', title, now() + interval '3 days', now() + interval '3 days 1 hour', 'task', id from tasks where user_id = :'a';
insert into calendar_events (user_id, title, starts_at, ends_at, type) values
  (:'a', 'CF Deep work', now() + interval '4 days', now() + interval '4 days 2 hours', 'time_block');
SQL
SLOT=$(sql -c "select id from calendar_events where user_id = '$A_ID' and title = 'CF Deep work'")
sql -c "insert into tasks (user_id, title, slot_id, slot_date, scheduled_start, scheduled_end)
  select '$A_ID', 'CF held task', id, (starts_at at time zone 'Africa/Cairo')::date, starts_at, ends_at from calendar_events where id = '$SLOT'" >/dev/null
info "harness: calendar-feed on :$FN_PORT; users A=$A_ID B=$B_ID"

# ---------------------------------------------------------------------------------------------
section "bad and revoked tokens: 401"
get "nonsense"
expect "a malformed token" "401" "$CODE"
get "kf_c_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
expect "a well-formed token nobody holds" "401" "$CODE"
get "$RV"
expect "a revoked link" "401" "$CODE"
get "kf_w_$(printf '%s' "$FULL" | cut -c6-)"
expect "a Widget-link prefix is not a calendar link" "401" "$CODE"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$F?t=$FULL")
expect "only GET" "405" "$code"

# ---------------------------------------------------------------------------------------------
section "the feed"
get "$FULL"
expect "answers" "200" "$CODE"
expect "as text/calendar, UTF-8" "text/calendar; charset=utf-8" "$CTYPE"
expect "cached five minutes" "max-age=300" "$CACHE"
expect "a calendar with the spec's header" "1 1 1 1 1" "$(echo "$(has 'BEGIN:VCALENDAR') $(has "PRODID:-//Kai's Flow//EN") $(has 'X-WR-TIMEZONE:Africa/Cairo') $(has 'REFRESH-INTERVAL;VALUE=DURATION:PT1H') $(has 'X-PUBLISHED-TTL:PT1H')")"
expect "CRLF line endings: no line without its CR" "0" "$(curl -sS "$F?t=$FULL" | grep -vc $'\r$')"
expect "no line past 75 octets" "0" "$(curl -sS "$F?t=$FULL" | tr -d '\r' | LC_ALL=C awk 'length($0) > 75' | wc -l | tr -d ' ')"
expect "the one-off, comma and semicolon escaped" "1" "$(has 'SUMMARY:CF Standup\, daily\; sync')"
expect "the Arabic title, unfolded, intact" "1" "$(unfolded | grep -cF 'SUMMARY:اجتماع الفريق الأسبوعي لمراجعة الخطة والميزانية والمهام المتبقية')"
HOL=$(sql -c "select to_char(date_trunc('day', now() + interval '5 days'), 'YYYYMMDD') || ' ' || to_char(date_trunc('day', now() + interval '6 days'), 'YYYYMMDD')")
expect "the all-day event is a date with an exclusive end: its day, and the next" "1 1 1" "$(echo "$(has 'DTSTART;VALUE=DATE:') $(has "DTSTART;VALUE=DATE:${HOL% *}") $(has "DTEND;VALUE=DATE:${HOL#* }")")"
expect "the weekly repeat is expanded into occurrences, with no RRULE" "true 0" "$(n=$(grep -c 'SUMMARY:CF Gym' <<<"$BODY"); echo "$([ "$n" -ge 20 ] && echo true || echo "false($n)") $(has 'RRULE')")"
expect "…each with its own UID (row id + start)" "true" "$(n=$(grep -c "^UID:.*-[0-9]\{8\}T[0-9]\{6\}Z@kaisflow" <<<"$BODY"); [ "$n" -ge 20 ] && echo true || echo "false($n)")"
expect "the Time block lists the task it holds" "1" "$(has 'DESCRIPTION:CF held task')"
expect "an open task's block is in" "1" "$(has 'SUMMARY:CF open task')"
expect "the block of a done task is out" "0" "$(has 'CF done task')"
expect "Google's event is not echoed back" "0" "$(has 'CF Google secret')"
expect "a subscribed calendar's event is not echoed back" "0" "$(has 'CF Subscribed secret')"
expect "a trashed event is out" "0" "$(has 'CF Trashed')"
expect "every time is UTC" "0" "$(grep -E '^DT(START|END):' <<<"$BODY" | grep -vc 'Z$')"
expect "each event has the stamps and is opaque and confirmed" "true" "$(e=$(grep -c '^BEGIN:VEVENT' <<<"$BODY"); [ "$e" -gt 0 ] && [ "$(grep -c '^DTSTAMP:' <<<"$BODY")" = "$e" ] && [ "$(grep -c '^LAST-MODIFIED:' <<<"$BODY")" = "$e" ] && [ "$(grep -c '^TRANSP:OPAQUE' <<<"$BODY")" = "$e" ] && [ "$(grep -c '^STATUS:CONFIRMED' <<<"$BODY")" = "$e" ] && echo true || echo false)"

# ---------------------------------------------------------------------------------------------
section "Busy only: no titles"
get "$BUSY"
expect "answers" "200" "$CODE"
expect "events are there, all 'Busy'" "true" "$(n=$(grep -c '^SUMMARY:' <<<"$BODY"); b=$(grep -c '^SUMMARY:Busy$' <<<"$BODY"); [ "$n" -gt 0 ] && [ "$n" = "$b" ] && echo true || echo "false($n/$b)")"
expect "no title, no description anywhere" "0" "$(grep -c 'CF \|اجتماع\|DESCRIPTION' <<<"$BODY")"

section "without scheduled tasks"
get "$NOTASK"
expect "no task block and no held task" "0 0 0" "$(echo "$(has 'CF open task') $(has 'CF held task') $(has 'DESCRIPTION')")"
expect "…the events and the Time block still are" "1 1" "$(echo "$(has 'SUMMARY:CF Standup') $(has 'SUMMARY:CF Deep work')")"

# ---------------------------------------------------------------------------------------------
section "ownership: a link only ever reads its own user's rows"
get "$TB"
expect "B's feed: B's event" "1" "$(has 'SUMMARY:CF B secret event')"
expect "B's feed has none of A's" "0" "$(grep -c 'CF Standup\|CF Gym\|CF Deep work\|CF open task\|CF Holiday\|اجتماع' <<<"$BODY")"
get "$FULL"
expect "A's feed has none of B's" "0" "$(has 'CF B secret')"

# ---------------------------------------------------------------------------------------------
section "the hourly limit"
sql -c "update calendar_feed_links set calls = 120, calls_hour = date_trunc('hour', now()) where token_hash = encode(sha256('$NOTASK'::bytea), 'hex')" >/dev/null
get "$NOTASK"
expect "past 120 calls this hour" "429" "$CODE"
get "$FULL"
expect "another link is not affected" 200 "$CODE"
sql -c "update calendar_feed_links set calls_hour = date_trunc('hour', now()) - interval '1 hour' where token_hash = encode(sha256('$NOTASK'::bytea), 'hex')" >/dev/null
get "$NOTASK"
expect "a new hour starts the count again" "200 1" "$CODE $(sql -c "select calls from calendar_feed_links where token_hash = encode(sha256('$NOTASK'::bytea), 'hex')")"
expect "a call stamps last_used_at; a revoked link's stays empty" "t t" "$(sql -c "select concat_ws(' ', (select last_used_at is not null from calendar_feed_links where token_hash = encode(sha256('$FULL'::bytea), 'hex')), (select last_used_at is null from calendar_feed_links where token_hash = encode(sha256('$RV'::bytea), 'hex')))")"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E '^calendar-feed:' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0 0" "$(sql -c "select concat_ws(' ',
  (select count(*) from tasks where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from calendar_events where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from calendar_feed_links where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from auth.users where id in ('$A_ID', '$B_ID')))")"

if [ "$FAIL" != 0 ]; then echo; echo "-- calendar-feed harness log (last 60 lines) --"; tail -60 "$TMP/harness.log"; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
