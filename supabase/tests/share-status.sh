#!/usr/bin/env bash
# Partner sharing P2 - status and notices (v1.6.6, migration 0103) against real Postgres + PostgREST, with three users:
#   A shows his day (Kai), B is connected to A (Reem), C is a stranger. Every reader goes through the real API as that user (JWT),
#   so the grants and RLS are the real ones; rows are placed around now() by psql as the owner, which fires the real triggers.
#
#   status     opt-in (off until the owner turns it on for her), only at Details (the lower of the two levels), never while paused,
#              own words win, auto words from the current block (Focusing until, At the gym, In class, Busy until - never the title),
#              a Private block / task / Time block gives no words, the 24-hour cap on write and on read, tonight = quiet hours,
#              a third user and the app's roles can't read or write it
#   notices    every kind Off until chosen; the payload is masked to the viewer's level (Titles / Details the title, Busy "something");
#              a Private item (itself, its task, its series) never notifies and takes a waiting notice back when it turns Private
#              or is trashed; Google/subscribed imports and paused circles don't notify; one notice per kind and person per
#              5 minutes (a burst folds into n); quiet hours HOLD (release_at = when they end), then it is due; push is due only
#              when released and once; a third user gets nothing; a disconnect keeps nothing; the generic door (a kind the app
#              doesn't know yet) masks the same way
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/share-status.sh
#
# Needs curl, jq, psql. Side effects: three throwaway accounts, shst-a@ / shst-b@ / shst-c@example.com, deleted (with every row
# they own, and their circles - cascade) before the run and again at the end.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)

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

EMAILS="'shst-a@example.com', 'shst-b@example.com', 'shst-c@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }
TMP=$(mktemp -d)
cleanup() { drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

PASSWORD='shst-local-only-password'
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
rpc() { local b=${3:-'{}'}; api POST "$1" "/rest/v1/rpc/$2" "$b"; }  # JWT fn [json]
jqe() { jq -r "$1" <<<"${2:-$BODY}"; }
refused() { if [ "$CODE" = 401 ] || [ "$CODE" = 403 ] || [ "$CODE" = 404 ] || [ "$CODE" = 42501 ]; then echo refused; else echo "open($CODE $BODY)"; fi; }
has() { grep -cF -- "$1" <<<"${2:-$BODY}"; }

# What B sees of A's status (null = nothing), and B's notices (masked payloads).
statbody() { rpc "$B_JWT" share_status_of "{\"p_owner\":\"$A_ID\"}"; }
# the words B reads (in a subshell: what B was told is also appended to $TMP/seen, for the "nothing leaked" greps)
words() { statbody; printf '%s
' "$BODY" >> "$TMP/seen"; jqe '.words // "null"'; }
twoxx() { if [ "$CODE" -ge 200 ] && [ "$CODE" -lt 300 ]; then echo ok; else echo "not ok($CODE $BODY)"; fi; }
notices() { api GET "$B_JWT" "/rest/v1/share_notices?select=id,kind,payload,n,release_at&dismissed_at=is.null&order=created_at"; }
setlevel() { sql -c "update share_grants set level = '$1' where owner_id in ('$A_ID','$B_ID')" >/dev/null; }
reset_notices() { sql -c "delete from share_notices" >/dev/null; }
# a notice's 5-minute window has run out: the next event starts a new notice
close_window() { sql -c "update share_notices set window_end = now() - interval '1 second'" >/dev/null; }
ev() { # id title offset-hours [extra columns as 'col=val,...' handled by caller] - a native event 2 days out
  sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type) values ('$1', '$A_ID', '$2', now() + interval '2 days', now() + interval '2 days 1 hour', 'event')" >/dev/null
}

section "setup"
drop_users
A_JSON=$(new_user shst-a@example.com); B_JSON=$(new_user shst-b@example.com); C_JSON=$(new_user shst-c@example.com)
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
expect "A and B are connected as Partner (Details both ways)" "true" "$([ -n "$CIRCLE" ] && [ "$CIRCLE" != null ] && echo true || echo false)"
info "users A=$A_ID B=$B_ID C=$C_ID circle=$CIRCLE"

# ---------------------------------------------------------------------------------------------
section "status: off until A turns it on, and only for B"
rpc "$A_JWT" share_status_set '{"p_words":"Commuting","p_clear":"hour"}'
expect "A sets own words" "ok" "$(twoxx)"
expect "B sees no status: A hasn't turned it on for B" "null" "$(words)"
rpc "$A_JWT" share_status_on_set "{\"p_circle\":\"$CIRCLE\",\"p_on\":true}"
expect "A turns it on" "ok" "$(twoxx)"
expect "B now sees A's own words" "Commuting" "$(words)"
statbody
expect "…as own words, clearing within the hour" "words true" "$(echo "$(jqe '.source') $(sql -c "select words_until between now() + interval '59 minutes' and now() + interval '61 minutes' from share_status where user_id = '$A_ID'")" | sed 's/ t$/ true/')"
rpc "$C_JWT" share_status_of "{\"p_owner\":\"$A_ID\"}"
expect "C (no connection) gets nothing" "null" "$(jqe 'tostring')"
rpc "$A_JWT" share_status_of "{\"p_owner\":\"$A_ID\"}"
expect "A asking for A through the viewer door gets nothing" "null" "$(jqe 'tostring')"
for t in share_status share_notices; do
  api GET "$C_JWT" "/rest/v1/$t?select=*"; expect "C can't read $t rows" "[]" "$(if [ "$CODE" = 200 ]; then echo "$BODY"; else echo "[]"; fi)"
done
api GET "$B_JWT" "/rest/v1/share_status?select=*"
expect "B can't read A's status table directly (no grant)" "refused" "$(refused)"
api PATCH "$A_JWT" "/rest/v1/share_status?user_id=eq.$A_ID" '{"words":"hacked"}'
expect "A can't write the status table directly either (only the functions do)" "refused" "$(refused)"
rpc "$B_JWT" share_status_core "{\"p_owner\":\"$A_ID\"}"
expect "the unchecked reader isn't callable by the app's role" "refused" "$(refused)"
rpc "$C_JWT" share_status_on_set "{\"p_circle\":\"$CIRCLE\",\"p_on\":true}"
expect "C can't flip a switch on a circle that isn't theirs" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"

section "status: only at Details, never while paused"
setlevel titles
expect "at Titles there is no status at all" "null" "$(words)"
setlevel busy
expect "at Busy there is none either" "null" "$(words)"
setlevel details
expect "back at Details it is there" "Commuting" "$(words)"
sql -c "update share_grants set level = 'titles' where owner_id = '$B_ID'" >/dev/null
expect "the lower of the two levels decides (B shows Titles)" "null" "$(words)"
setlevel details
sql -c "update circles set paused_until = now() + interval '1 hour' where id = '$CIRCLE'" >/dev/null
expect "paused: no status" "null" "$(words)"
sql -c "update circles set paused_until = null where id = '$CIRCLE'" >/dev/null
rpc "$A_JWT" share_status_on_set "{\"p_circle\":\"$CIRCLE\",\"p_on\":false}"
expect "turned off again: nothing" "null" "$(words)"
rpc "$A_JWT" share_status_on_set "{\"p_circle\":\"$CIRCLE\",\"p_on\":true}"

section "status: auto words from the current block (never the title)"
rpc "$A_JWT" share_status_set '{}'
expect "cleared own words: nothing is current, so no status" "null" "$(words)"
sql -v a="$A_ID" <<'SQL' >/dev/null
insert into areas (id, user_id, name) values ('f0000000-0000-0000-0000-000000000001', :'a', 'Gym'), ('f0000000-0000-0000-0000-000000000002', :'a', 'Anatomy lab');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, area_id) values
  ('e1000000-0000-0000-0000-000000000001', :'a', 'ZZLEGDAY', now() - interval '30 minutes', now() + interval '30 minutes', 'time_block', 'f0000000-0000-0000-0000-000000000001');
SQL
expect "a block in the Gym area says 'At the gym'" "At the gym" "$(words)"
statbody
expect "…its source is auto, until the block ends" "auto true" "$(echo "$(jqe '.source') $(sql -c "select ('$(jqe '.until')'::timestamptz) between now() + interval '29 minutes' and now() + interval '31 minutes'" | sed 's/^t$/true/')")"
expect "…the title is nowhere in what B reads" "0" "$(grep -c ZZLEGDAY "$TMP/seen")"
sql -c "update calendar_events set area_id = 'f0000000-0000-0000-0000-000000000002', title = 'ZZHISTOLOGY' where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
expect "an Anatomy lab block says 'In class'" "In class" "$(words)"
sql -c "update calendar_events set area_id = null where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
expect "a block with no area says 'Busy until <time>'" "true" "$([[ "$(words)" =~ ^Busy\ until\ [0-9]{1,2}(:[0-9]{2})?$ ]] && echo true || echo "false($(words))")"
sql -c "update calendar_events set busy = false where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
expect "a block shown as free says nothing" "null" "$(words)"
sql -c "update calendar_events set busy = true, source = 'gcal' where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
expect "a Google event says nothing" "null" "$(words)"
sql -c "update calendar_events set source = 'native', recurrence_rule = 'FREQ=WEEKLY' where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
expect "a repeating block says nothing until the owner's app names the occurrence" "null" "$(words)"
sql -c "update calendar_events set recurrence_rule = null, starts_at = now() - interval '30 hours', ends_at = now() + interval '1 hour' where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
expect "a block that started over 24 hours ago says nothing (a status never lives past a day)" "null" "$(words)"
sql -c "update calendar_events set starts_at = now() - interval '30 minutes', ends_at = now() + interval '30 minutes' where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
expect "back inside a day" "true" "$([[ "$(words)" =~ ^Busy\ until ]] && echo true || echo "false")"

section "status: a repeating block, named by the owner's app (Kai's weekly Lecture in the Classes area)"
sql -c "delete from calendar_events where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into areas (id, user_id, name) values ('f0000000-0000-0000-0000-000000000003', :'a', 'Classes');
-- a weekly series: ONE row, anchored three weeks back, repeating every week (the app expands it)
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, area_id, recurrence_rule, recurrence_exdates) values
  ('e1000000-0000-0000-0000-000000000010', :'a', 'ZZLECTURE', now() - interval '21 days 30 minutes', now() - interval '21 days' + interval '30 minutes', 'event', 'f0000000-0000-0000-0000-000000000003', 'FREQ=WEEKLY', '{}'),
  ('e1000000-0000-0000-0000-000000000011', :'b', 'ZZBSERIES', now() - interval '21 days 30 minutes', now() - interval '21 days' + interval '30 minutes', 'event', null, 'FREQ=WEEKLY', '{}');
SQL
BS=$(sql -c "select (now() - interval '30 minutes')::timestamptz"); BE=$(sql -c "select (now() + interval '30 minutes')::timestamptz")
blk() { rpc "$A_JWT" share_status_block "{\"p_event\":\"$1\",\"p_starts\":\"${2:-$BS}\",\"p_ends\":\"${3:-$BE}\"}"; }
LEC=e1000000-0000-0000-0000-000000000010
expect "the app hasn't said it is in the Lecture: nothing" "null" "$(words)"
blk $LEC
expect "A's app is in this week's Lecture occurrence: 'In class'" "In class" "$(words)"
statbody
expect "…auto, until the occurrence ends" "auto true" "$(echo "$(jqe '.source') $(sql -c "select ('$(jqe '.until')'::timestamptz) between now() + interval '29 minutes' and now() + interval '31 minutes'" | sed 's/^t$/true/')")"
expect "…and the title is nowhere in what B reads" "0" "$(grep -c ZZLECTURE "$TMP/seen")"
setlevel titles
expect "only at Details: at Titles nothing" "null" "$(words)"
setlevel details
sql -c "update calendar_events set private = true where id = '$LEC'" >/dev/null
expect "a Private series gives no words, at once (checked at read time)" "null" "$(words)"
sql -c "update calendar_events set private = false where id = '$LEC'" >/dev/null
expect "…and speaks again when it is not Private" "In class" "$(words)"
sql -c "update share_status set auto = false where user_id = '$A_ID'" >/dev/null
expect "'From the Now card' off: nothing" "null" "$(words)"
sql -c "update share_status set auto = true where user_id = '$A_ID'" >/dev/null
sql -c "update share_status set block_ends = now() - interval '1 minute' where user_id = '$A_ID'" >/dev/null
expect "the occurrence has ended: it lapses by itself" "null" "$(words)"
blk $LEC; sql -c "update share_status set block_set_at = now() - interval '25 hours', block_starts = now() - interval '25 hours' where user_id = '$A_ID'" >/dev/null
expect "an occurrence 'set' 25 hours ago is not said" "null" "$(words)"
blk e1000000-0000-0000-0000-000000000011
expect "another person's series is refused (it clears)" "null" "$(words)"
blk $LEC "$BS" "$(sql -c "select (now() + interval '30 hours')::timestamptz")"
expect "an occurrence longer than a day is refused" "null" "$(words)"
blk $LEC "$(sql -c "select (now() - interval '2 hours')::timestamptz")" "$(sql -c "select (now() - interval '1 hour')::timestamptz")"
expect "one already over is refused" "null" "$(words)"
sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type) values ('e1000000-0000-0000-0000-000000000012', '$A_ID', 'ZZONEOFF', now() - interval '30 minutes', now() + interval '30 minutes', 'event')" >/dev/null
blk e1000000-0000-0000-0000-000000000012
expect "a one-off can't be named this way (the server finds it itself, so: its own 'Busy until', not In class)" "true" "$([[ "$(words)" =~ ^Busy.until ]] && echo true || echo false)"
sql -c "delete from calendar_events where id = 'e1000000-0000-0000-0000-000000000012'" >/dev/null
blk $LEC
sql -c "update calendar_events set deleted_at = now() where id = '$LEC'" >/dev/null
expect "a trashed series says nothing" "null" "$(words)"
sql -c "update calendar_events set deleted_at = null where id = '$LEC'" >/dev/null
rpc "$A_JWT" share_status_block '{}'
expect "the app leaving the class clears it" "null" "$(words)"
expect "the block fields are cleared on the row" "t" "$(sql -c "select block_event_id is null and block_starts is null and block_set_at is null from share_status where user_id = '$A_ID'")"
sql -c "delete from calendar_events where id in ('$LEC', 'e1000000-0000-0000-0000-000000000011')" >/dev/null

section "status: Focus round"
sql -c "delete from calendar_events where id = 'e1000000-0000-0000-0000-000000000001'" >/dev/null
FOCUS_AT=$(sql -c "select (now() + interval '45 minutes')::timestamptz")
rpc "$A_JWT" share_status_focus "{\"p_until\":\"$FOCUS_AT\"}"
expect "A's device starts a Focus round" "ok" "$(twoxx)"
expect "B reads 'Focusing until <time>' on A's own clock" "Focusing until $(sql -c "select share_clock('$FOCUS_AT'::timestamptz, 'Africa/Cairo')")" "$(words)"
rpc "$A_JWT" share_status_auto '{"p_on":false}'
expect "'From the Now card' off: no auto words, so nothing" "null" "$(words)"
rpc "$A_JWT" share_status_set '{"p_words":"In class","p_clear":"hour"}'
expect "…but own words are still said" "In class" "$(words)"
rpc "$A_JWT" share_status_set '{}'; rpc "$A_JWT" share_status_auto '{"p_on":true}'
expect "auto back on, own words cleared: the Focus round again" "true" "$([[ "$(words)" =~ ^Focusing\ until ]] && echo true || echo false)"
rpc "$A_JWT" share_status_set '{"p_words":"Reading","p_clear":"hour"}'
expect "own words win over the Focus round" "Reading" "$(words)"
rpc "$A_JWT" share_status_set '{}'
rpc "$A_JWT" share_status_focus '{"p_until":null}'
expect "the round ends: the status clears at once" "null" "$(words)"
rpc "$A_JWT" share_status_focus "{\"p_until\":\"$(sql -c "select (now() - interval '1 minute')::timestamptz")\"}"
expect "a round that is already over says nothing" "null" "$(words)"

section "status: Private gives no words"
sql -v a="$A_ID" <<'SQL' >/dev/null
insert into tasks (id, user_id, title, private) values ('a1000000-0000-0000-0000-000000000001', :'a', 'ZZPVTASK', true);
insert into tasks (id, user_id, title) values ('a1000000-0000-0000-0000-000000000002', :'a', 'ZZOPENTASK');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, private) values
  ('e1000000-0000-0000-0000-000000000002', :'a', 'ZZPVBLOCK', now() - interval '30 minutes', now() + interval '30 minutes', 'time_block', true);
SQL
expect "inside a Private block: no words" "null" "$(words)"
rpc "$A_JWT" share_status_focus "{\"p_until\":\"$FOCUS_AT\"}"
expect "…even with a Focus round going (the Private block blanks it)" "null" "$(words)"
sql -c "delete from calendar_events where id = 'e1000000-0000-0000-0000-000000000002'" >/dev/null
expect "the Private block gone: the Focus round speaks" "true" "$([[ "$(words)" =~ ^Focusing\ until ]] && echo true || echo false)"
rpc "$A_JWT" share_status_focus "{\"p_until\":\"$FOCUS_AT\",\"p_task\":\"a1000000-0000-0000-0000-000000000001\"}"
expect "a Focus round on a Private task says nothing" "null" "$(words)"
sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type, private) values ('e1000000-0000-0000-0000-000000000003', '$A_ID', 'ZZPVSLOT', now() - interval '1 hour', now() + interval '1 hour', 'time_block', true); update tasks set slot_id = 'e1000000-0000-0000-0000-000000000003' where id = 'a1000000-0000-0000-0000-000000000002'" >/dev/null
rpc "$A_JWT" share_status_focus "{\"p_until\":\"$FOCUS_AT\",\"p_task\":\"a1000000-0000-0000-0000-000000000002\"}"
expect "a Focus round on a task inside a Private Time block says nothing" "null" "$(words)"
sql -c "delete from calendar_events where id = 'e1000000-0000-0000-0000-000000000003'" >/dev/null
sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type, task_id) values ('e1000000-0000-0000-0000-000000000004', '$A_ID', 'ZZPVTBLOCK', now() - interval '30 minutes', now() + interval '30 minutes', 'task', 'a1000000-0000-0000-0000-000000000001')" >/dev/null
rpc "$A_JWT" share_status_focus '{"p_until":null}'
expect "the block of a Private task: no words" "null" "$(words)"
sql -c "delete from calendar_events where id = 'e1000000-0000-0000-0000-000000000004'" >/dev/null
expect "none of the Private words ever appeared in a reply" "0" "$(grep -c ZZ "$TMP/seen")"

section "status: never past 24 hours, and tonight is quiet hours"
rpc "$A_JWT" share_status_set '{"p_words":"Away","p_clear":"manual"}'
expect "'When I clear it' is capped at 24 hours" "t" "$(sql -c "select words_until <= now() + interval '24 hours 1 minute' and words_until > now() + interval '23 hours' from share_status where user_id = '$A_ID'")"
sql -c "update share_status set words = 'Sleeping', words_set_at = now(), words_until = now() + interval '100 hours' where user_id = '$A_ID'" >/dev/null
expect "a row that asks for 100 hours is clamped on the row itself" "t" "$(sql -c "select words_until <= words_set_at + interval '24 hours' from share_status where user_id = '$A_ID'")"
sql -c "update share_status set words_set_at = now() - interval '25 hours', words_until = now() + interval '1 hour' where user_id = '$A_ID'" >/dev/null
expect "words set 25 hours ago are not said, whatever their end time" "null" "$(words)"
sql -c "update share_status set focus_until = now() + interval '100 hours' where user_id = '$A_ID'" >/dev/null
expect "a Focus round can't be written past 24 hours either" "t" "$(sql -c "select focus_until <= focus_set_at + interval '24 hours' from share_status where user_id = '$A_ID'")"
sql -c "update share_status set focus_until = null, words = null where user_id = '$A_ID'" >/dev/null
sql -c "update app_settings set quiet_hours_on = true, quiet_from = '22:30', quiet_to = '07:00' where user_id = '$A_ID'" >/dev/null
rpc "$A_JWT" share_status_set '{"p_words":"At the gym"}'
expect "the default clear time is tonight, at quiet hours (or when they end, if it is already night)" "true" "$(sql -c "select (words_until at time zone 'Africa/Cairo')::time in ('22:30:00', '07:00:00') and words_until > now() and words_until <= now() + interval '24 hours' from share_status where user_id = '$A_ID'" | sed 's/^t$/true/')"
rpc "$A_JWT" share_status_set '{"p_words":"this is a status that is far too long to be a few words"}'
expect "words over 40 characters are refused" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
rpc "$A_JWT" share_status_set '{"p_words":"x","p_clear":"never"}'
expect "an unknown clear time is refused" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
rpc "$A_JWT" share_status_set '{}'

# ---------------------------------------------------------------------------------------------
section "notices: every kind Off until chosen"
reset_notices
ev e2000000-0000-0000-0000-000000000001 ZZDINNER
expect "nothing stored for B: she hasn't switched 'added' on" "0" "$(sql -c "select count(*) from share_notices")"
rpc "$B_JWT" share_notice_settings
expect "B's settings: the circle, status off, no notice kinds" "false {}" "$(jqe '.[0] | "\(.status_on) \(.notice_prefs | tostring)"')"
rpc "$B_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"added\",\"p_mode\":\"loud\"}"
expect "a mode outside off / in_app / push is refused" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
rpc "$B_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"Added;drop\",\"p_mode\":\"push\"}"
expect "a kind that isn't a lower-case word is refused" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
rpc "$C_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"added\",\"p_mode\":\"push\"}"
expect "C can't set a switch on a circle that isn't theirs" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
rpc "$B_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"added\",\"p_mode\":\"in_app\"}"
expect "B switches 'added' to In-app" "ok" "$(twoxx)"
rpc "$A_JWT" share_notice_settings
expect "A's own settings are A's (nothing of B's)" "{}" "$(jqe '.[0].notice_prefs | tostring')"

section "notices: masked to the level, in Reem's words"
reset_notices
ev e2000000-0000-0000-0000-000000000002 ZZDINNER
notices
expect "B has one notice: 'added', the title at Details" "1 added added ZZDINNER" "$(jqe '"\(length) \(.[0].kind) \(.[0].payload.verb) \(.[0].payload.what)"')"
expect "…the item's id is not in it (refs is not readable)" "0" "$(has e2000000-0000-0000-0000-000000000002)"
api GET "$B_JWT" "/rest/v1/share_notices?select=refs"
expect "B can't select refs (no column grant)" "refused" "$(refused)"
api GET "$A_JWT" "/rest/v1/share_notices?select=id"
expect "A sees none: a notice is the recipient's only" "[]" "$BODY"
api GET "$C_JWT" "/rest/v1/share_notices?select=id"
expect "C sees none (a third user gets nothing)" "[]" "$BODY"
reset_notices; setlevel titles
ev e2000000-0000-0000-0000-000000000003 ZZTITLES
notices
expect "at Titles: the title" "ZZTITLES" "$(jqe '.[0].payload.what')"
reset_notices; setlevel busy
ev e2000000-0000-0000-0000-000000000004 ZZSECRET
notices
expect "at Busy only: 'something', never the title" "something" "$(jqe '.[0].payload.what')"
expect "…the title is nowhere in B's reply" "0" "$(has ZZSECRET)"
expect "…and not at rest either (the stored payload is the masked one)" "0" "$(sql -c "select count(*) from share_notices where payload::text like '%ZZSECRET%'")"
reset_notices
sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type, busy) values ('e2000000-0000-0000-0000-000000000005', '$A_ID', 'ZZFREE', now() + interval '2 days', now() + interval '2 days 1 hour', 'event', false)" >/dev/null
expect "an event shown as free doesn't even appear at Busy only, so it doesn't notify" "0" "$(sql -c "select count(*) from share_notices")"
setlevel titles
sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type, busy) values ('e2000000-0000-0000-0000-000000000006', '$A_ID', 'ZZFREE2', now() + interval '2 days', now() + interval '2 days 1 hour', 'event', false)" >/dev/null
expect "…at Titles it does" "1" "$(sql -c "select count(*) from share_notices")"
setlevel details

section "notices: a Private item never notifies"
reset_notices
sql -v a="$A_ID" <<'SQL' >/dev/null
insert into tasks (id, user_id, title, private) values ('a2000000-0000-0000-0000-000000000001', :'a', 'ZZPVT2', true);
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, private) values
  ('e3000000-0000-0000-0000-000000000001', :'a', 'ZZPVEV', now() + interval '2 days', now() + interval '2 days 1 hour', 'event', true),
  ('e3000000-0000-0000-0000-000000000002', :'a', 'ZZPVSERIES', now() + interval '3 days', now() + interval '3 days 1 hour', 'event', true);
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, series_id) values
  ('e3000000-0000-0000-0000-000000000003', :'a', 'ZZPVOCC', now() + interval '4 days', now() + interval '4 days 1 hour', 'event', 'e3000000-0000-0000-0000-000000000002');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, task_id) values
  ('e3000000-0000-0000-0000-000000000004', :'a', 'ZZPVTBLK', now() + interval '5 days', now() + interval '5 days 1 hour', 'task', 'a2000000-0000-0000-0000-000000000001');
SQL
expect "a Private event, a Private series' occurrence and a Private task's block: no notice, at any level" "0" "$(sql -c "select count(*) from share_notices")"
sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type, source) values ('e3000000-0000-0000-0000-000000000005', '$A_ID', 'ZZGCAL', now() + interval '2 days', now() + interval '2 days 1 hour', 'event', 'gcal'), ('e3000000-0000-0000-0000-000000000006', '$A_ID', 'ZZICS', now() + interval '2 days', now() + interval '2 days 1 hour', 'event', 'ics')" >/dev/null
expect "Google and subscribed imports don't notify" "0" "$(sql -c "select count(*) from share_notices")"
sql -c "insert into calendar_events (id, user_id, title, starts_at, ends_at, type) values ('e3000000-0000-0000-0000-000000000007', '$A_ID', 'ZZPAST', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'event')" >/dev/null
expect "something already in the past doesn't notify" "0" "$(sql -c "select count(*) from share_notices")"
ev e3000000-0000-0000-0000-000000000008 ZZTURNS
expect "an ordinary event notifies" "1" "$(sql -c "select count(*) from share_notices")"
sql -c "update calendar_events set private = true where id = 'e3000000-0000-0000-0000-000000000008'" >/dev/null
expect "…turned Private before it was seen: the notice goes with it" "0" "$(sql -c "select count(*) from share_notices")"
ev e3000000-0000-0000-0000-000000000009 ZZTRASH
sql -c "update calendar_events set deleted_at = now() where id = 'e3000000-0000-0000-0000-000000000009'" >/dev/null
expect "…an event trashed before it was seen: gone too" "0" "$(sql -c "select count(*) from share_notices")"
sql -c "insert into tasks (id, user_id, title) values ('a2000000-0000-0000-0000-000000000002', '$A_ID', 'ZZTASK3'); insert into calendar_events (id, user_id, title, starts_at, ends_at, type, task_id) values ('e3000000-0000-0000-0000-00000000000a', '$A_ID', 'ZZTBLK3', now() + interval '2 days', now() + interval '2 days 1 hour', 'task', 'a2000000-0000-0000-0000-000000000002')" >/dev/null
expect "a task's block notifies" "1" "$(sql -c "select count(*) from share_notices")"
sql -c "update tasks set private = true where id = 'a2000000-0000-0000-0000-000000000002'" >/dev/null
expect "…its task turned Private: the notice goes" "0" "$(sql -c "select count(*) from share_notices")"
expect "no Private word was ever stored" "0" "$(sql -c "select count(*) from share_notices where payload::text like '%ZZPV%'")"

section "notices: a pause and a stranger"
sql -c "update circles set paused_until = now() + interval '1 hour' where id = '$CIRCLE'" >/dev/null
ev e4000000-0000-0000-0000-000000000001 ZZPAUSED
expect "while paused nothing is sent" "0" "$(sql -c "select count(*) from share_notices")"
sql -c "update circles set paused_until = null where id = '$CIRCLE'" >/dev/null
expect "A's event reaches only B (C has no connection: no rows for C at all)" "0" "$(sql -c "select count(*) from share_notices where recipient_id = '$C_ID'")"

section "notices: one per 5 minutes"
reset_notices
sql -c "update app_settings set quiet_hours_on = false where user_id = '$B_ID'" >/dev/null
ev e5000000-0000-0000-0000-000000000001 ZZONE; ev e5000000-0000-0000-0000-000000000002 ZZTWO; ev e5000000-0000-0000-0000-000000000003 ZZTHREE
expect "three adds in a burst are ONE notice, n = 3" "1 3 3" "$(sql -c "select concat_ws(' ', count(*), max(n), max(cardinality(refs))) from share_notices")"
notices
expect "B reads one notice, n = 3" "1 3" "$(jqe '"\(length) \(.[0].n)"')"
expect "…released 5 minutes after the first (quiet hours off)" "t" "$(sql -c "select release_at between created_at + interval '4 minutes 59 seconds' and created_at + interval '5 minutes 1 second' from share_notices")"
close_window
ev e5000000-0000-0000-0000-000000000004 ZZFOUR
expect "after the 5 minutes, the next add is a new notice" "2" "$(sql -c "select count(*) from share_notices")"

section "notices: quiet hours hold, then release"
reset_notices
sql -c "update app_settings set quiet_hours_on = true, timezone = 'UTC', quiet_from = (now() - interval '1 hour')::time, quiet_to = (now() + interval '3 hours')::time where user_id = '$B_ID'" >/dev/null
ev e6000000-0000-0000-0000-000000000001 ZZQUIET
expect "inside B's quiet hours the notice is held until they end (about 3 hours out)" "t" "$(sql -c "select release_at between now() + interval '2 hours 55 minutes' and now() + interval '3 hours 5 minutes' from share_notices")"
rpc "$B_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"added\",\"p_mode\":\"push\"}"
reset_notices
ev e6000000-0000-0000-0000-000000000002 ZZQUIET2
expect "a push notice is held too: not due" "0" "$(sql -c "select count(*) from share_notices_due()")"
sql -c "update share_notices set created_at = created_at - interval '4 hours', window_end = window_end - interval '4 hours', release_at = release_at - interval '4 hours', expires_at = expires_at - interval '4 hours'" >/dev/null
expect "quiet hours over (time passed): it is due, one line, from Kai" "1 Kai added ZZQUIET2" "$(sql -c "select concat_ws(' ', count(*), max(actor_name), max(kind), max(payload->>'what')) from share_notices_due()")"
expect "…for B" "$B_ID" "$(sql -c "select recipient_id from share_notices_due()")"
sql -c "select share_notices_pushed(array(select id from share_notices_due()))" >/dev/null
expect "once pushed it is not due again" "0" "$(sql -c "select count(*) from share_notices_due()")"
reset_notices
sql -c "update app_settings set quiet_hours_on = false where user_id = '$B_ID'" >/dev/null
ev e6000000-0000-0000-0000-000000000003 ZZLOUD
expect "outside quiet hours a push waits only for its 5-minute window" "0" "$(sql -c "select count(*) from share_notices_due()")"
sql -c "update share_notices set release_at = now() - interval '1 second'" >/dev/null
expect "window over: due" "1" "$(sql -c "select count(*) from share_notices_due()")"
notices; NID=$(jqe '.[0].id')
api PATCH "$B_JWT" "/rest/v1/share_notices?id=eq.$NID&select=id" '{"dismissed_at":"2026-01-01T00:00:00Z"}'
expect "B dismisses it" "1" "$(jqe 'length')"
expect "a dismissed notice is not pushed" "0" "$(sql -c "select count(*) from share_notices_due()")"
api PATCH "$B_JWT" "/rest/v1/share_notices?id=eq.$NID&select=id" '{"payload":{"what":"x"}}'
expect "B can only dismiss: the payload isn't writable" "refused" "$(refused)"
api PATCH "$A_JWT" "/rest/v1/share_notices?id=eq.$NID&select=id" '{"dismissed_at":"2026-01-01T00:00:00Z"}'
expect "A can't touch B's notices" "[]" "$(if [ "$CODE" = 200 ]; then echo "$BODY"; else echo "[]"; fi)"
rpc "$B_JWT" share_notices_due '{}'
expect "the push list isn't callable by the app's role" "refused" "$(refused)"
rpc "$B_JWT" share_notice_emit "{\"p_actor\":\"$A_ID\",\"p_kind\":\"added\",\"p_group\":\"x\",\"p_detail\":{},\"p_busy\":{}}"
expect "neither is the door itself" "refused" "$(refused)"

section "notices: the generic door (a kind the app doesn't know yet)"
reset_notices
rpc "$B_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"listx\",\"p_mode\":\"in_app\"}"
setlevel details
told=$(sql -c "select share_notice_emit('$A_ID', 'listx', 'groceries', '{\"verb\":\"ticked\",\"what\":\"2 on ZZGROCERIES\"}', '{\"verb\":\"ticked\",\"what\":\"some things\"}')")
expect "emit reports one person told" "1" "$told"
expect "at Details B gets the detail payload" "ticked 2 on ZZGROCERIES" "$(sql -c "select payload->>'verb' || ' ' || (payload->>'what') from share_notices where kind = 'listx'")"
reset_notices; setlevel busy
sql -c "select share_notice_emit('$A_ID', 'listx', 'groceries', '{\"verb\":\"ticked\",\"what\":\"2 on ZZGROCERIES\"}', '{\"verb\":\"ticked\",\"what\":\"some things\"}')" >/dev/null
expect "at Busy only B gets the busy payload and nothing of the detail" "some things 0" "$(echo "$(sql -c "select payload->>'what' from share_notices where kind = 'listx'") $(sql -c "select count(*) from share_notices where payload::text like '%ZZGROCERIES%'")")"
reset_notices
rpc "$B_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"listx\",\"p_mode\":\"off\"}"
expect "switched back Off: nothing stored (and the key is gone)" "0 {\"added\": \"push\"}" "$(echo "$(sql -c "select share_notice_emit('$A_ID', 'listx', 'g', '{\"verb\":\"x\"}', '{\"verb\":\"x\"}')") $(sql -c "select notice_prefs from circle_members where user_id = '$B_ID'")")"
setlevel details

section "never shared, and disconnecting"
expect "no status or notice function reads the journal, health, people, notes, chat or AI tables" "0" "$(sql -c "select count(*) from pg_proc where proname ~ '^share_(status|notice)' and prosrc ~* '(journal_entries|interactions|\\mpeople\\M|\\mnotes\\M|\mchat_|\mai_|health)'")"
rpc "$A_JWT" share_status_set '{"p_words":"Commuting","p_clear":"hour"}'
ev e7000000-0000-0000-0000-000000000001 ZZLAST
rpc "$A_JWT" share_notice_pref_set "{\"p_circle\":\"$CIRCLE\",\"p_kind\":\"added\",\"p_mode\":\"in_app\"}"
api DELETE "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE"
expect "B disconnects" "ok" "$(twoxx)"
expect "no notices are kept" "0" "$(sql -c "select count(*) from share_notices")"
expect "and B sees no status any more" "null" "$(words)"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0" "$(sql -c "select concat_ws(' ', (select count(*) from share_status where user_id in ('$A_ID','$B_ID')), (select count(*) from share_notices where actor_id in ('$A_ID','$B_ID')), (select count(*) from calendar_events where user_id in ('$A_ID','$B_ID')))")"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
