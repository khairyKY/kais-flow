#!/usr/bin/env bash
# Calendar subscriptions by link (function ics-sync, migration 0094; handoff 2026-11-06-*-ics-subscribe-handoff) against
# real Postgres, with the internet's feeds mocked: supabase/tests/harness/ics-mock.ts serves the REAL prayer-times feed
# (fixtures/prayer-times.ics, dates moved to today) and a feed the test edits; the runner sends every host under
# feeds.test there and answers their DNS (HARNESS_ICS_MOCK). Proves:
#   - the pure half (supabase/tests/ics.test.ts: parser, repeats, time zones, VALARM, the plan, the link guard) passes;
#   - who may call (no token, the anon key), and that a person's link, rows and subscriptions are theirs alone: the url
#     column is not selectable, nothing is writable through PostgREST, another user's id is "not found";
#   - the SSRF refusals: 127.0.0.1, localhost, ::1, the cloud metadata address, 10/8, 192.168/16, a name that resolves
#     to a private address, a redirect to the metadata address, ftp:// and file:// and passwords in the link — each
#     refused before any request is made (the runner's fetch log has no line for them); then the feed refusals: HTML,
#     404, over the size cap, a hang past the timeout, a redirect loop, a name that doesn't resolve;
#   - the real prayer feed through a webcal:// link: 644 events, Arabic titles, its colour, the 5-minute alarm as
#     remind_min on every row, source 'ics', external_ref {sub_id, uid, recurrence_id}; a second read changes nothing;
#     the same link again (webcal or https) is a duplicate; "Use the feed's reminders" off clears every remind_min, on
#     brings them back; a rename and a recolour rewrite the rows;
#   - a feed with a one-off in Europe/Berlin, a weekly repeat with an EXDATE and a moved instance, an all-day event:
#     the right rows at the right instants; an edited feed adds, updates and removes by uid + recurrence-id; a failing
#     feed is recorded on the subscription (status failing, error code) and leaves its events alone, then recovers;
#   - cron (service role) reads every user's subscriptions and never crosses users; Remove takes the events with it;
#     twenty subscriptions is the most; chat and the MCP tools leave source 'ics' out (the same promise as Google's).
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/ics.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, GNU date. Side effects: two throwaway accounts, ics-a@ / ics-b@example.com,
# deleted (with every row they own — cascade) before and after.
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

EMAILS="'ics-a@example.com', 'ics-b@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
section "the pure half (ics.test.ts)"
if "$DENO" test --no-lock --allow-env --allow-read "$ROOT/supabase/tests/ics.test.ts" > "$TMP/unit.log" 2>&1; then
  ok "ics.test.ts: $(sed 's/\x1b\[[0-9;]*m//g' "$TMP/unit.log" | grep -E '^(ok|FAILED) \|' | tail -1)"
else
  bad "ics.test.ts failed"; sed 's/\x1b\[[0-9;]*m//g' "$TMP/unit.log" | tail -40
fi

# ---------------------------------------------------------------------------------------------
# The feeds' stand-in, then the function under the harness on the stack's database.
# ---------------------------------------------------------------------------------------------
MOCK_PORT=${MOCK_PORT:-54398}
FN_PORT=${FN_PORT:-54399}
"$DENO" run --no-lock --no-prompt --quiet --allow-net=127.0.0.1 --allow-env --allow-read \
  "$ROOT/supabase/tests/harness/ics-mock.ts" "$MOCK_PORT" > "$TMP/mock.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 120); do curl -s -o /dev/null "http://127.0.0.1:$MOCK_PORT/__log" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$MOCK_PORT/__log" || { echo "the feed mock did not start:" >&2; cat "$TMP/mock.log" >&2; exit 2; }
MOCK="http://127.0.0.1:$MOCK_PORT"
FETCH_LOG="$TMP/fetch.log"; : > "$FETCH_LOG"

SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY SUPABASE_DB_URL=$DB_URL \
  HARNESS_ICS_MOCK=$MOCK HARNESS_FETCH_LOG=$FETCH_LOG ICS_MAX_BYTES=2000000 ICS_TIMEOUT_MS=3000 \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-write="$FETCH_LOG" --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" ics-sync \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "the function did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
F="http://127.0.0.1:$FN_PORT"

feed() { curl -sS -o /dev/null -X POST "$MOCK/__feed" -H 'Content-Type: application/json' --data "$1"; }
# call BODY TOKEN -> CODE, BODY
call() {
  local out
  out=$(curl -sS -X POST "$F/ics-sync" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' --data "$1" -w '\n%{http_code}')
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
# rest METHOD PATH TOKEN [JSON] -> CODE, BODY (PostgREST as that user)
rest() {
  local out
  out=$(curl -sS -X "$1" "$API_URL/rest/v1/$2" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+--data "$4"} -w '\n%{http_code}')
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
j() { jq -r "$1" <<<"$BODY" 2>/dev/null; }

PASSWORD='ics-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}

section "setup"
drop_users
A_JSON=$(new_user ics-a@example.com)
B_JSON=$(new_user ics-b@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON"); B_JWT=$(jq -r .access_token <<<"$B_JSON")
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign up test users: $A_JSON" >&2; exit 2; }
sql -c "insert into app_settings (user_id, timezone) values ('$A_ID', 'Africa/Cairo'), ('$B_ID', 'Africa/Cairo') on conflict (user_id) do update set timezone = excluded.timezone" >/dev/null
# An event of A's own that no subscription step may ever touch.
sql -c "insert into calendar_events (user_id, title, starts_at, ends_at) values ('$A_ID', 'ICS suite own event', now(), now() + interval '1 hour')" >/dev/null
info "harness: ics-sync on :$FN_PORT, feeds mock on :$MOCK_PORT; A=$A_ID B=$B_ID"

ics_rows() { sql -c "select count(*) from calendar_events where user_id = '$1' and source = 'ics'"; }
sub_rows() { sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and external_ref->>'sub_id' = '$1'"; }
sub_field() { sql -c "select $2 from calendar_subscriptions where id = '$1'"; }
ids_hash() { sql -c "select coalesce(md5(string_agg(id::text || updated_at::text, ',' order by id)), '') from calendar_events where user_id = '$A_ID' and source = 'ics' and external_ref->>'sub_id' = '$1'"; }

# ---------------------------------------------------------------------------------------------
section "who may call"
call '{"action":"refresh"}' ''
expect "no token" "401" "$CODE"
call '{"action":"refresh"}' "$ANON_KEY"
expect "the anon key" "401" "$CODE"
call '{"action":"nonsense"}' "$A_JWT"
expect "an unknown action" "400 bad_request" "$CODE $(j .error)"
call '{"action":"sync"}' "$A_JWT"
expect "a person can't run the cron's all-users sync (it is a user call: no such action)" "400 bad_request" "$CODE $(j .error)"
call '{"action":"preview"}' "$A_JWT"
expect "preview with no link" "400 bad_url" "$CODE $(j .error)"

# ---------------------------------------------------------------------------------------------
section "SSRF: refused before any request is made"
refuse() { # LINK CODE LABEL
  call "$(jq -cn --arg u "$1" '{action: "preview", url: $u}')" "$A_JWT"
  expect "$3" "$2" "$CODE $(j .error)"
}
refuse 'http://127.0.0.1:1/a.ics' '400 blocked' "loopback 127.0.0.1"
refuse 'http://localhost:1/a.ics' '400 blocked' "localhost"
refuse 'http://[::1]:1/a.ics' '400 blocked' "::1"
refuse 'http://169.254.169.254/latest/meta-data/' '400 blocked' "the cloud metadata address"
refuse 'http://10.0.0.5/a.ics' '400 blocked' "10.0.0.0/8"
refuse 'http://192.168.1.1/a.ics' '400 blocked' "192.168.0.0/16"
refuse 'http://172.16.0.9/a.ics' '400 blocked' "172.16.0.0/12"
refuse 'http://2130706433/a.ics' '400 blocked' "127.0.0.1 written as one number"
refuse 'http://[::ffff:127.0.0.1]/a.ics' '400 blocked' "127.0.0.1 as an IPv6-mapped address"
refuse 'https://printer.local/a.ics' '400 blocked' ".local name"
refuse 'https://intranet/a.ics' '400 blocked' "a name with no dot"
refuse 'https://rebind.feeds.test/prayer.ics' '400 blocked' "a name that resolves to a private address (10.0.0.7)"
refuse 'https://redirect-private.feeds.test/redirect-private' '400 blocked' "a redirect to the metadata address (every hop is checked)"
refuse 'ftp://x.feeds.test/a.ics' '400 bad_url' "ftp://"
refuse 'file:///etc/passwd' '400 bad_url' "file://"
refuse 'https://user:pass@x.feeds.test/prayer.ics' '400 bad_url' "a password in the link"
refuse 'not a link' '400 bad_url' "not a link"
expect "none of those reached fetch (the runner logs every outbound request but Supabase's)" "0" "$(grep -c -E '127\.0\.0\.1:1/|localhost|\[::1\]|169\.254|10\.0\.0\.5|192\.168|172\.16|2130706433|printer\.local|intranet|ftp:|file:|user:pass|rebind' "$FETCH_LOG")"
expect "…the redirect's first hop was the only request that one made" "1" "$(grep -c 'redirect-private.feeds.test/redirect-private' "$FETCH_LOG")"

section "the feed refuses back"
refuse 'https://a.feeds.test/html' '400 not_ics' "an HTML page is not a calendar"
refuse 'https://a.feeds.test/404' '502 http_error' "a 404"
refuse 'https://a.feeds.test/huge' '400 too_large' "a body over the size cap"
refuse 'https://a.feeds.test/slow' '502 timeout' "a feed that hangs past the timeout"
refuse 'https://a.feeds.test/redirect-loop' '502 unreachable' "a redirect loop"
refuse 'https://nxdomain.feeds.test/a.ics' '502 unreachable' "a name that doesn't resolve"
call "$(jq -cn --arg u 'https://a.feeds.test/redirect-ok' '{action: "preview", url: $u}')" "$A_JWT"
expect "a redirect to a public address is followed" "200 644" "$CODE $(j .events)"
expect "nothing was stored by a preview or a refusal" "0 0" "$(sql -c "select count(*) from calendar_subscriptions where user_id in ('$A_ID', '$B_ID')") $(ics_rows "$A_ID")"

# ---------------------------------------------------------------------------------------------
section "the real prayer feed, through its webcal:// link"
PRAYER_LINK='webcal://p.feeds.test/prayer.ics?latitude=30.7952538&longitude=30.9785009&method=5&alarm=5&duration=25&jumuah=true&jumuahDuration=60&color=%23E91E63&lang=ar'
call "$(jq -cn --arg u "$PRAYER_LINK" '{action: "preview", url: $u}')" "$A_JWT"
expect "preview: name, event count, colour, reminders, host" "200 مواقيت الصلاة 644 #E91E63 true p.feeds.test" "$CODE $(j '[.name, .events, .color, .reminders, .host] | join(" ")')"
call "$(jq -cn --arg u "$PRAYER_LINK" '{action: "add", url: $u}')" "$A_JWT"
expect "add: 200, every event new" "200 644 644 0 0" "$CODE $(j '[.fetched, .new, .updated, .removed] | join(" ")')"
SUBP=$(j .id)
expect "644 rows, source ics, all this subscription's" "644 644" "$(ics_rows "$A_ID") $(sub_rows "$SUBP")"
expect "the subscription: name from X-WR-CALNAME, colour from the feed, host, ok, 644" "مواقيت الصلاة #E91E63 p.feeds.test ok 644 true" "$(sub_field "$SUBP" "concat_ws(' ', name, color, host, status, event_count, (synced_at is not null)::text)")"
expect "the link is stored https, whole, server-side" "https://p.feeds.test/prayer.ics?latitude=30.7952538&longitude=30.9785009&method=5&alarm=5&duration=25&jumuah=true&jumuahDuration=60&color=%23E91E63&lang=ar" "$(sub_field "$SUBP" url)"
expect "titles: the five prayers and more, in Arabic" "8" "$(sql -c "select count(distinct title) from calendar_events where user_id = '$A_ID' and source = 'ics'")"
expect "Fajr is there" "true" "$(sql -c "select (count(*) > 0)::text from calendar_events where user_id = '$A_ID' and source = 'ics' and title = 'الفجر'")"
expect "the 5-minute VALARM is remind_min on every row" "644" "$(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and remind_min = 5")"
expect "the feed's colour is on every row, busy, a plain event, timed" "644" "$(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and color = '#E91E63' and busy and type = 'event' and not all_day")"
expect "external_ref: source, id = sub/uid/, sub_id, uid, calendar name" "644" "$(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and external_ref->>'source' = 'ics' and external_ref->>'sub_id' = '$SUBP' and external_ref->>'id' = '$SUBP/' || (external_ref->>'uid') || '/' || (external_ref->>'recurrence_id') and external_ref->>'calendar' = 'مواقيت الصلاة'")"
expect "a prayer lasts 25 minutes (duration=25)" "true" "$(sql -c "select (min(ends_at - starts_at) = interval '25 minutes')::text from calendar_events where user_id = '$A_ID' and source = 'ics' and title = 'الفجر'")"
expect "Cairo's 04:xx Fajr lands in UTC at 02:xx or 01:xx (a feed time in TZID=Africa/Cairo, no VTIMEZONE)" "true" "$(sql -c "select (min(extract(hour from starts_at)) between 0 and 3)::text from calendar_events where user_id = '$A_ID' and source = 'ics' and title = 'الفجر'")"
expect "A's own event is untouched" "1" "$(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and title = 'ICS suite own event' and source = 'native'")"
H1=$(ids_hash "$SUBP")
call "$(jq -cn --arg id "$SUBP" '{action: "refresh", id: $id}')" "$A_JWT"
expect "a second read: nothing new, nothing changed, nothing gone" "200 644 0 0 0" "$CODE $(j '[.fetched, .new, .updated, .removed] | join(" ")')"
expect "…and not a row was rewritten" "$H1" "$(ids_hash "$SUBP")"
call "$(jq -cn --arg u "$PRAYER_LINK" '{action: "add", url: $u}')" "$A_JWT"
expect "the same webcal link again is a duplicate" "409 duplicate" "$CODE $(j .error)"
call "$(jq -cn '{action: "add", url: "https://p.feeds.test/prayer.ics?latitude=30.7952538&longitude=30.9785009&method=5&alarm=5&duration=25&jumuah=true&jumuahDuration=60&color=%23E91E63&lang=ar"}')" "$A_JWT"
expect "…and so is its https spelling" "409 duplicate" "$CODE $(j .error)"

section "reminders switch, rename, recolour"
call "$(jq -cn --arg id "$SUBP" '{action: "update", id: $id, use_alarms: false}')" "$A_JWT"
expect "reminders off: every row rewritten" "200 644" "$CODE $(j .updated)"
expect "…no remind_min left" "0 false" "$(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and remind_min is not null") $(sub_field "$SUBP" use_alarms)"
call "$(jq -cn --arg id "$SUBP" '{action: "update", id: $id, use_alarms: true}')" "$A_JWT"
expect "reminders on: they come back" "644" "$(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and remind_min = 5")"
call "$(jq -cn --arg id "$SUBP" '{action: "update", id: $id, name: "الصلاة", color: "#B59CE3"}')" "$A_JWT"
expect "rename + recolour: the subscription and every row" "200 الصلاة #B59CE3 644 644" "$CODE $(sub_field "$SUBP" "concat_ws(' ', name, color)") $(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and color = '#B59CE3'") $(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and source = 'ics' and external_ref->>'calendar' = 'الصلاة'")"
call "$(jq -cn --arg id "$SUBP" '{action: "update", id: $id, color: "teal"}')" "$A_JWT"
expect "a colour that isn't #RRGGBB is refused" "400 bad_request" "$CODE $(j .error)"

# ---------------------------------------------------------------------------------------------
section "whose they are: PostgREST, the url column, another user"
rest GET "calendar_subscriptions?select=id,name,host,color,use_alarms,status,error,synced_at,event_count" "$A_JWT"
expect "A reads their subscription's columns (no url)" "200 1" "$CODE $(jq 'length' <<<"$BODY")"
rest GET "calendar_subscriptions?select=url" "$A_JWT"
expect "A can't select the url" "42501" "$(j .code)"
rest GET "calendar_subscriptions?select=*" "$A_JWT"
expect "…nor select *" "42501" "$(j .code)"
rest POST "calendar_subscriptions" "$A_JWT" '{"url":"https://x.feeds.test/a.ics","host":"x.feeds.test","name":"x"}'
expect "A can't insert (the function does)" "42501" "$(j .code)"
rest PATCH "calendar_subscriptions?id=eq.$SUBP" "$A_JWT" '{"name":"hijack"}'
expect "…can't update" "42501" "$(j .code)"
rest DELETE "calendar_subscriptions?id=eq.$SUBP" "$A_JWT"
expect "…can't delete" "42501" "$(j .code)"
rest GET "calendar_subscriptions?select=id" "$B_JWT"
expect "B sees none of A's subscriptions" "200 0" "$CODE $(jq 'length' <<<"$BODY")"
rest GET "calendar_events?select=id&source=eq.ics" "$B_JWT"
expect "B sees none of A's subscribed events" "200 0" "$CODE $(jq 'length' <<<"$BODY")"
rest GET "calendar_events?select=id&source=eq.ics" "$A_JWT"
expect "A sees theirs" "200" "$CODE"
call "$(jq -cn --arg id "$SUBP" '{action: "refresh", id: $id}')" "$B_JWT"
expect "B can't refresh A's" "404 not_found" "$CODE $(j .error)"
call "$(jq -cn --arg id "$SUBP" '{action: "update", id: $id, name: "x"}')" "$B_JWT"
expect "…update A's" "404 not_found" "$CODE $(j .error)"
call "$(jq -cn --arg id "$SUBP" '{action: "remove", id: $id}')" "$B_JWT"
expect "…remove A's" "404 not_found" "$CODE $(j .error)"
expect "A's are as they were" "644 الصلاة" "$(sub_rows "$SUBP") $(sub_field "$SUBP" name)"

# ---------------------------------------------------------------------------------------------
section "a feed with repeats, zones and an all-day event; edited, then down"
d() { date -u -d "$1 days" +%Y%m%d; }
iso() { date -u -d "$1" +%Y-%m-%dT%H:%M:%S.000Z; }
# feed_text ONE ALLDAY_TITLE NEW: ONE=1 includes the Berlin one-off; NEW=1 adds "Brand new".
feed_text() {
  printf 'BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Suite feed
'
  if [ "$1" = 1 ]; then
    printf 'BEGIN:VEVENT
UID:one@suite
DTSTART;TZID=Europe/Berlin:%sT100000
DTEND;TZID=Europe/Berlin:%sT110000
SUMMARY:One-off in Berlin
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
END:VALARM
END:VEVENT
' "$(d 3)" "$(d 3)"
  fi
  printf 'BEGIN:VEVENT
UID:weekly@suite
DTSTART:%sT090000Z
DTEND:%sT093000Z
RRULE:FREQ=WEEKLY;COUNT=5
EXDATE:%sT090000Z
SUMMARY:Weekly
END:VEVENT
' "$(d 2)" "$(d 2)" "$(d 9)"
  printf 'BEGIN:VEVENT
UID:weekly@suite
RECURRENCE-ID:%sT090000Z
DTSTART:%sT110000Z
DTEND:%sT113000Z
SUMMARY:Weekly (moved)
END:VEVENT
' "$(d 16)" "$(d 16)" "$(d 16)"
  printf 'BEGIN:VEVENT
UID:allday@suite
DTSTART;VALUE=DATE:%s
DTEND;VALUE=DATE:%s
SUMMARY:%s
END:VEVENT
' "$(d 1)" "$(d 2)" "$2"
  if [ "$3" = 1 ]; then
    printf 'BEGIN:VEVENT
UID:new@suite
DTSTART:%sT120000Z
DTEND:%sT130000Z
SUMMARY:Brand new
END:VEVENT
' "$(d 4)" "$(d 4)"
  fi
  printf 'END:VCALENDAR
'
}
feed "$(jq -cn --arg t "$(feed_text 1 'All day' 0)" '{text: $t}')"
call "$(jq -cn '{action: "add", url: "https://f.feeds.test/feed.ics", color: "#4A9266"}')" "$A_JWT"
expect "add: 6 events (one-off, weekly ×4 with the EXDATE gone and one moved, all-day)" "200 6 6" "$CODE $(j .fetched) $(j .new)"
SUBF=$(j .id)
expect "named from the feed, coloured as asked" "Suite feed #4A9266" "$(sub_field "$SUBF" "concat_ws(' ', name, color)")"
FR() { sql -c "select $1 from calendar_events where user_id = '$A_ID' and source = 'ics' and external_ref->>'sub_id' = '$SUBF' $2"; }
expect "the Berlin one-off: 10:00 Berlin as a UTC instant, with its 15-minute alarm" "$(TZ=UTC date -u -d "TZ=\"Europe/Berlin\" $(date -u -d '+3 days' +%Y-%m-%d) 10:00" +%Y-%m-%dT%H:%M:%S.000Z) 15" "$(FR "to_char(starts_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.000\"Z\"') || ' ' || remind_min" "and title = 'One-off in Berlin'")"
expect "the weekly: four rows — the EXDATE'd one is gone, the third is the moved one" "Weekly|Weekly (moved)|Weekly|Weekly" "$(FR "string_agg(title, '|' order by starts_at)" "and external_ref->>'uid' = 'weekly@suite'")"
expect "the moved instance is at 11:00Z on its day" "$(iso "$(d 16) 11:00")" "$(FR "to_char(starts_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.000\"Z\"')" "and title = 'Weekly (moved)'")"
expect "the EXDATE'd day has none" "0" "$(FR "count(*)" "and external_ref->>'uid' = 'weekly@suite' and starts_at::date = '$(date -u -d '9 days' +%Y-%m-%d)'")"
expect "the all-day event: a date in no zone, end exclusive, no reminder" "true $(date -u -d '1 days' +%Y-%m-%d)T00:00:00Z $(date -u -d '2 days' +%Y-%m-%d)T00:00:00Z" "$(FR "all_day::text || ' ' || to_char(starts_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') || ' ' || to_char(ends_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')" "and title = 'All day'")"
expect "no reminder on the others (the feed has no VALARM there)" "5" "$(FR "count(*)" "and remind_min is null")"

feed "$(jq -cn --arg t "$(feed_text 0 'All day (renamed)' 1)" '{text: $t}')"
call "$(jq -cn --arg id "$SUBF" '{action: "refresh", id: $id}')" "$A_JWT"
expect "the feed was edited (one removed, one renamed, one new): refresh lands exactly that" "200 6 1 1 1" "$CODE $(j .fetched) $(j .new) $(j .updated) $(j .removed)"
expect "…the rows say so: the renamed one, the new one, the weekly's three plain and one moved" "1 1 3 1" "$(FR "(count(*) filter (where title = 'All day (renamed)')) || ' ' || (count(*) filter (where title = 'Brand new')) || ' ' || (count(*) filter (where title = 'Weekly')) || ' ' || (count(*) filter (where title = 'Weekly (moved)'))" "")"
expect "…the removed one is gone" "0" "$(FR count "and title = 'One-off in Berlin'")"
H2=$(ids_hash "$SUBF")

feed '{"down":true}'
call "$(jq -cn --arg id "$SUBF" '{action: "refresh", id: $id}')" "$A_JWT"
expect "the feed went down: refresh says so" "502 http_error" "$CODE $(j .error)"
expect "…the subscription records it (failing, the code)" "failing http_error" "$(sub_field "$SUBF" "concat_ws(' ', status, error)")"
expect "…and its events are exactly as they were" "6 $H2" "$(sub_rows "$SUBF") $(ids_hash "$SUBF")"
feed "$(jq -cn --arg t "$(feed_text 0 'All day (renamed)' 1)" '{text: $t, down: false}')"
call "$(jq -cn --arg id "$SUBF" '{action: "refresh", id: $id}')" "$A_JWT"
expect "back up: ok again, error cleared" "200 ok true" "$CODE $(sub_field "$SUBF" status) $(sub_field "$SUBF" "(error is null)::text")"

# ---------------------------------------------------------------------------------------------
section "cron: every user's subscriptions, never across users"
call "$(jq -cn '{action: "add", url: "https://g.feeds.test/feed.ics"}')" "$B_JWT"
expect "B subscribes to a feed (the same text, their own copy)" "200 6" "$CODE $(j .fetched)"
SUBB=$(j .id)
expect "B has 6 rows, A's are unchanged" "6 $((644 + 6))" "$(ics_rows "$B_ID") $(ics_rows "$A_ID")"
sql -c "update calendar_subscriptions set synced_at = '2020-01-01' where user_id in ('$A_ID', '$B_ID')" >/dev/null
sql -c "delete from calendar_events where user_id = '$B_ID' and source = 'ics' and title = 'Brand new'" >/dev/null
call '{"action":"sync"}' "$SERVICE_ROLE_KEY"
expect "the service role's sync runs" "200" "$CODE"
TOTAL=$(sql -c "select count(*) from calendar_subscriptions")
expect "…it read every subscription on the stack" "$TOTAL" "$(j .subs)"
expect "…ours all re-read (synced_at moved), all ok" "3 3" "$(sql -c "select count(*) from calendar_subscriptions where user_id in ('$A_ID', '$B_ID') and synced_at > '2021-01-01'") $(sql -c "select count(*) from calendar_subscriptions where user_id in ('$A_ID', '$B_ID') and status = 'ok'")"
expect "…B's deleted row came back for B only" "6 $((644 + 6))" "$(ics_rows "$B_ID") $(ics_rows "$A_ID")"
expect "…no row is anyone else's: every subscribed event's user owns its subscription" "0" "$(sql -c "select count(*) from calendar_events e where e.source = 'ics' and e.user_id in ('$A_ID', '$B_ID') and not exists (select 1 from calendar_subscriptions s where s.id::text = e.external_ref->>'sub_id' and s.user_id = e.user_id)")"

section "the AI never sees them"
expect "chat's search hits drop source gcal and ics" "1" "$(grep -c "in('source', \['gcal', 'ics'\])" "$ROOT/supabase/functions/chat/index.ts")"
expect "the MCP search drops them" "1" "$(grep -c "e.source in ('gcal', 'ics')" "$ROOT/supabase/functions/mcp/store.ts")"
NATIVE=$(grep -c -E "source = 'native'|eq\('source', 'native'\)" "$ROOT/supabase/functions/mcp/store.ts" "$ROOT/supabase/functions/chat/index.ts" | awk -F: '{s += $2} END {print s}')
if [ "$NATIVE" -ge 3 ]; then ok "chat's snapshot and the MCP events / getEvent read only source = 'native' -> $NATIVE places"; else bad "chat's snapshot and the MCP events / getEvent read only source = 'native' -> only $NATIVE places"; fi
expect "…and the rows chat would have to look up are found by that filter (A: 650)" "650" "$(rest GET "calendar_events?select=id&source=in.(gcal,ics)" "$A_JWT"; jq 'length' <<<"$BODY")"

# ---------------------------------------------------------------------------------------------
section "Remove, and the cap"
call "$(jq -cn --arg id "$SUBF" '{action: "remove", id: $id}')" "$A_JWT"
expect "Remove: its 6 events go with it" "200 6 0 0" "$CODE $(j .removed) $(sub_rows "$SUBF") $(sql -c "select count(*) from calendar_subscriptions where id = '$SUBF'")"
expect "…the other subscription and A's own event stay" "644 1" "$(sub_rows "$SUBP") $(sql -c "select count(*) from calendar_events where user_id = '$A_ID' and title = 'ICS suite own event'")"
expect "…B's are untouched" "6" "$(ics_rows "$B_ID")"
sql -c "insert into calendar_subscriptions (user_id, url, host, name) select '$A_ID', 'https://cap.feeds.test/none?n=' || n, 'cap.feeds.test', 'cap ' || n from generate_series(1, 19) n" >/dev/null
expect "A is at 20 subscriptions" "20" "$(sql -c "select count(*) from calendar_subscriptions where user_id = '$A_ID'")"
call "$(jq -cn '{action: "add", url: "https://h.feeds.test/prayer.ics"}')" "$A_JWT"
expect "a twenty-first is refused" "409 too_many" "$CODE $(j .error)"
expect "…and nothing was fetched for it" "0" "$(grep -c 'h.feeds.test' "$FETCH_LOG")"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E 'ics-sync:.*(db |server_error)' "$TMP/harness.log")"
expect "no link in any log line" "0" "$(grep -c -E 'feeds\.test|prayer\.ics' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0" "$(sql -c "select concat_ws(' ',
  (select count(*) from calendar_events where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from calendar_subscriptions where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from auth.users where id in ('$A_ID', '$B_ID')))")"

if [ "$FAIL" != 0 ]; then echo; echo "-- harness log (last 60 lines) --"; tail -60 "$TMP/harness.log"; echo "-- mock log --"; tail -40 "$TMP/mock.log"; curl -sS "$MOCK/__log" | tail -40; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
