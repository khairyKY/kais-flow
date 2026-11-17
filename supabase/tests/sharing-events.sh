#!/usr/bin/env bash
# Partner sharing P2 - Free together and Shared events (v1.6.6, migration 0101) against real Postgres + PostgREST, three users:
#   A (Kai) and B (Reem) are connected, C is a stranger. Every reader and writer goes through the real API as that user (JWT),
#   so the grants, the RLS and the guard trigger are the real ones; calendar rows are placed around the days ahead by psql.
#
#   free together   windows only (never a row, a title, a Private item's name); 08:00-22:30 and 1 hour or more; a Private item
#                   counts as busy; "show as free" and unanswered invites don't; a repeating series is expanded; a stranger and a
#                   pause get nothing; it works at Busy only
#   propose         a shared event is two copies, one per person, each owned by its person; the invited one is dashed (invited)
#   answer          accept (both copies say so); decline (the invited copy goes, the other reads "declined")
#   no answer       stays on both until it starts, then share_events_expire drops both
#   edit            either person's plain write to their own copy changes both; colour and private stay their own
#   delete          "Delete for both" (both to Trash; a restore brings both back); "Remove from mine" (a plain delete: the
#                   other copy reads declined, mine is a plain event in Trash)
#   leave           the circle goes: each keeps a plain copy; an unanswered invite goes from the invited side
#   locked          the link columns can't be forged; a write to the other's row changes nothing; a third user can't make,
#                   answer, delete, edit or see one; a pause stops the writes that reach the other person
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/sharing-events.sh
#
# Needs curl, jq, psql. Side effects: three throwaway accounts, evt-a@ / evt-b@ / evt-c@example.com, deleted (with their rows)
# before the run and again at the end.
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

EMAILS="'evt-a@example.com', 'evt-b@example.com', 'evt-c@example.com'"
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
  out=$(curl -sS -w '\n%{http_code}' -X "$1" "$API_URL$3" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -H "Prefer: ${PREFER:-return=representation}" ${4:+--data "$4"})
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
rpc() { local b=${3:-'{}'}; api POST "$1" "/rest/v1/rpc/$2" "$b"; }  # JWT fn [json]
jqe() { jq -r "$1" <<<"${2:-$BODY}"; }
refused() { if [ "$CODE" -ge 400 ] || [ "$BODY" = "[]" ]; then echo refused; else echo "allowed($CODE $BODY)"; fi; }

section "setup"
drop_users
A_JSON=$(new_user evt-a@example.com); B_JSON=$(new_user evt-b@example.com); C_JSON=$(new_user evt-c@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON"); C_ID=$(jq -r .user.id <<<"$C_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON"); B_JWT=$(jq -r .access_token <<<"$B_JSON"); C_JWT=$(jq -r .access_token <<<"$C_JSON")
for v in "$A_ID" "$B_ID" "$C_ID" "$A_JWT" "$B_JWT" "$C_JWT"; do [ -n "$v" ] && [ "$v" != null ] || { echo "could not sign up test users" >&2; exit 2; }; done
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone, display_name) values (:'a', 'Africa/Cairo', 'Kai'), (:'b', 'Africa/Cairo', 'Reem')
  on conflict (user_id) do update set timezone = excluded.timezone, display_name = excluded.display_name;
SQL
rpc "$A_JWT" share_invite_create '{"p_relation":"partner"}'; CODE_A=$(jqe .code)
rpc "$B_JWT" share_invite_accept "{\"p_code\":\"$CODE_A\"}"
expect "A and B connect" "true" "$(jqe '.ok | tostring')"
CIRCLE=$(jqe .circle_id)

# Days ahead on Cairo's clock. d(N, "HH:MM") = that wall time N days from today, as a UTC instant.
d() { sql -c "select to_char(((date_trunc('day', now() at time zone 'Africa/Cairo') + interval '$1 days' + time '$2') at time zone 'Africa/Cairo') at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"; }
# A row of someone's, placed by psql as the owner (title, start, end, extra columns)
put() { sql -c "insert into calendar_events (user_id, title, starts_at, ends_at${5:+, $5}) values ('$1', '$2', '$3', '$4'${6:+, $6})" >/dev/null; }
ev() { sql -c "select $2 from calendar_events where $1"; }  # a column list over a filter, as the owner
free() { rpc "$1" shared_free_together "{\"p_partner\":\"$2\",\"p_from\":\"$3\",\"p_to\":\"$4\"}"; }
uuid() { cat /proc/sys/kernel/random/uuid; }
# The windows of the last answer, as Cairo wall times (08:00-10:00 ...), and how many cross an instant, and the latest end - read by the database
wins() { sql -v j="${1:-$BODY}" <<'SQL'
select coalesce(string_agg(to_char((w->>'starts_at')::timestamptz at time zone 'Africa/Cairo', 'HH24:MI') || '-' || to_char((w->>'ends_at')::timestamptz at time zone 'Africa/Cairo', 'HH24:MI'), ' ' order by (w->>'starts_at')::timestamptz), '')
from jsonb_array_elements(:'j'::jsonb->'windows') w
SQL
}
across() { sql -v j="$BODY" <<SQL
select count(*) from jsonb_array_elements(:'j'::jsonb->'windows') w where (w->>'starts_at')::timestamptz < '$1' and (w->>'ends_at')::timestamptz > '$1'
SQL
}
lastend() { sql -v j="$BODY" <<'SQL'
select max((w->>'ends_at')::timestamptz) from jsonb_array_elements(:'j'::jsonb->'windows') w
SQL
}

# ---------------------------------------------------------------------------------------------
section "free together: windows only"
D3=$(d 3 00:00); D4=$(d 4 00:00)  # a day, on Cairo's clock
# Cairo 08:00-22:30 = 06:00-20:30Z in winter, 05:00-19:30Z in summer; read the bounds back from the server's own answer instead
put "$A_ID" "ZZALECTURE" "$(d 3 10:00)" "$(d 3 12:00)"
put "$B_ID" "ZZBLAB" "$(d 3 13:00)" "$(d 3 14:30)"
put "$B_ID" "ZZBPRIVATE" "$(d 3 16:00)" "$(d 3 17:30)" private true
put "$A_ID" "ZZAFREEFLAG" "$(d 3 19:00)" "$(d 3 20:00)" busy false
put "$A_ID" "ZZASHORT" "$(d 3 14:50)" "$(d 3 15:00)"
put "$B_ID" "ZZBLATE" "$(d 3 21:00)" "$(d 3 22:00)"
free "$A_JWT" "$B_ID" "$D3" "$D4"
expect "the answer is ok" "true" "$(jqe '.ok | tostring')"
expect "it carries only these keys" "ok,partner_zone,windows,zone" "$(jq -r 'keys | join(",")' <<<"$BODY")"
expect "a window has only a start and an end" "ends_at,starts_at" "$(jq -r '[.windows[] | keys | join(",")] | unique | join(" ")' <<<"$BODY")"
expect "no title or row of either person is in it" "0" "$(grep -c -E 'ZZ|title|private' <<<"$BODY")"
W=$(wins)
info "windows (Cairo): $W"
expect "free = 08:00-22:30 minus both calendars, an hour or more" "08:00-10:00 12:00-13:00 15:00-16:00 17:30-21:00" "$W"
expect "the 20-minute gap and the 30-minute tail are not offered" "0" "$(grep -c -E '14:|22:' <<<"$W")"
expect "B's Private item counts as busy (16:00-17:30 is not offered)" "0" "$(grep -c -E '16:[0-9][0-9]-17:[0-9][0-9]' <<<"$W")"
expect "an event shown as free doesn't block (A's 19:00-20:00 is inside 17:30-21:00)" "1" "$(grep -c '17:30-21:00' <<<"$W")"
free "$B_JWT" "$A_ID" "$D3" "$D4"
expect "the same windows from the other side" "$W" "$(wins)"
free "$A_JWT" "$B_ID" "$(d -5 00:00)" "$(d -4 00:00)"
expect "a day in the past has no window" "" "$(wins)"
free "$A_JWT" "$B_ID" "$D3" "$(d 40 00:00)"
expect "at most 14 days come back" "t" "$(sql -c "select '$(lastend)'::timestamptz <= '$D3'::timestamptz + interval '15 days'")"
free "$C_JWT" "$A_ID" "$D3" "$D4"
expect "a stranger asking about A gets nothing" "false none null" "$(jqe '[.ok, .error, .windows] | map(tostring) | join(" ")')"
free "$C_JWT" "$B_ID" "$D3" "$D4"
expect "a stranger asking about B gets nothing" "false none null" "$(jqe '[.ok, .error, .windows] | map(tostring) | join(" ")')"
free "$A_JWT" "$A_ID" "$D3" "$D4"
expect "asking about oneself gets nothing" "false" "$(jqe '.ok | tostring')"
sql -c "update share_grants set level = 'busy' where circle_id = '$CIRCLE'" >/dev/null
free "$A_JWT" "$B_ID" "$D3" "$D4"
expect "at Busy only it still works (Busy is all it needs)" "true" "$(jqe '.ok | tostring')"
expect "…and returns the same windows" "$W" "$(wins)"
sql -c "update share_grants set level = 'details' where circle_id = '$CIRCLE'" >/dev/null
# a repeating event of B's: every day 13:00-14:00 Cairo is gone from the windows; one occurrence skipped is back
put "$B_ID" "ZZBDAILY" "$(d 5 15:00)" "$(d 5 16:00)" recurrence_rule "'FREQ=DAILY;COUNT=3'"
free "$A_JWT" "$B_ID" "$(d 6 00:00)" "$(d 7 00:00)"
expect "a repeating event is expanded (day 6 has 15:00-16:00 busy: no window crosses it)" "0" "$(across "$(d 6 15:30)")"
free "$A_JWT" "$B_ID" "$(d 8 00:00)" "$(d 9 00:00)"
expect "…and COUNT=3 ends it (day 8 is free at 15:30)" "1" "$(across "$(d 8 15:30)")"
sql -c "delete from calendar_events where user_id in ('$A_ID','$B_ID')" >/dev/null

# ---------------------------------------------------------------------------------------------
section "propose, answer, no answer"
S1=$(d 4 18:00); E1=$(d 4 20:00)
EV_A=$(uuid)
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$EV_A\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZDATE\",\"p_starts_at\":\"$S1\",\"p_ends_at\":\"$E1\",\"p_color\":\"iris\"}"
expect "A proposes: ok" "true" "$(jqe '.ok | tostring')"
SID=$(jqe .shared_id)
expect "two copies, one per person" "$A_ID $B_ID" "$(ev "shared_id = '$SID'" "string_agg(user_id::text, ' ' order by (user_id = '$B_ID'))")"
expect "A's copy: accepted, waiting on B, with A's colour" "accepted invited iris $B_ID" "$(ev "id = '$EV_A'" "concat_ws(' ', share_status, share_peer_status, color, shared_with)")"
expect "B's copy: invited (dashed), A already on it, no colour of A's" "invited accepted  $A_ID" "$(ev "shared_id = '$SID' and user_id = '$B_ID'" "concat_ws(' ', share_status, share_peer_status, coalesce(color, ''), shared_with)")"
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$EV_A\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZDATE\",\"p_starts_at\":\"$S1\",\"p_ends_at\":\"$E1\"}"
expect "the same call again answers the same event (a retry is not a second one)" "true $SID 2" "$(jqe '[.ok, .shared_id] | map(tostring) | join(" ")') $(ev "shared_id = '$SID'" 'count(*)')"
api GET "$B_JWT" "/rest/v1/calendar_events?select=id,user_id,title,share_status,share_peer_status,shared_with&title=eq.ZZDATE"
EV_B=$(jqe '.[0].id')
expect "B reads her own copy through the API, invited" "$B_ID invited" "$(jqe '.[0] | [.user_id, .share_status] | join(" ")')"
expect "…and only hers (A's copy is not readable)" "1" "$(jqe 'length')"
api GET "$A_JWT" "/rest/v1/calendar_events?select=id,user_id&title=eq.ZZDATE"
expect "A reads only his own copy" "1 $A_ID" "$(jqe 'length') $(jqe '.[0].user_id')"
# an invitation isn't on B's calendar for real: A's lane never carries it, nor B's busy time
rpc "$A_JWT" shared_day "{\"p_owner\":\"$B_ID\",\"p_from\":\"$(d 4 00:00)\",\"p_to\":\"$(d 5 00:00)\"}"
expect "an unanswered invite is not in B's day for A (not drawn, not busy)" "0" "$(jqe '.blocks | length')"
rpc "$B_JWT" shared_day "{\"p_owner\":\"$A_ID\",\"p_from\":\"$(d 4 00:00)\",\"p_to\":\"$(d 5 00:00)\"}"
expect "the shared event is not drawn a second time in A's lane on B's calendar" "0" "$(jqe '.blocks | length')"
free "$A_JWT" "$B_ID" "$(d 4 00:00)" "$(d 5 00:00)"
expect "B's invited copy doesn't block B; A's own accepted copy blocks A (18:00-20:00 is not offered)" "0" "$(across "$S1")"
rpc "$B_JWT" shared_event_respond "{\"p_event\":\"$EV_B\",\"p_accept\":true}"
expect "B accepts" "true" "$(jqe '.ok | tostring')"
expect "both copies say accepted" "accepted/accepted accepted/accepted" "$(ev "shared_id = '$SID'" "string_agg(share_status || '/' || share_peer_status, ' ')")"
rpc "$B_JWT" shared_event_respond "{\"p_event\":\"$EV_B\",\"p_accept\":true}"
expect "accepting twice is fine" "true" "$(jqe '.ok | tostring')"
# decline: a second proposal
EV2=$(uuid)
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$EV2\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZNOPE\",\"p_starts_at\":\"$(d 5 18:00)\",\"p_ends_at\":\"$(d 5 19:00)\"}"
SID2=$(jqe .shared_id); EV2B=$(ev "shared_id = '$SID2' and user_id = '$B_ID'" id)
rpc "$B_JWT" shared_event_respond "{\"p_event\":\"$EV2B\",\"p_accept\":false}"
expect "B declines: the invited copy is gone, A's reads declined" "0 declined" "$(ev "id = '$EV2B'" 'count(*)') $(ev "id = '$EV2'" 'share_peer_status')"
# no answer
EV3=$(uuid)
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$EV3\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZLATER\",\"p_starts_at\":\"$(d 6 18:00)\",\"p_ends_at\":\"$(d 6 19:00)\"}"
expect "an unanswered proposal stays on both calendars" "2" "$(ev "title = 'ZZLATER'" 'count(*)')"
sql -c "select share_events_expire()" >/dev/null
expect "…even when the sweep runs (it hasn't started)" "2" "$(ev "title = 'ZZLATER'" 'count(*)')"
EV4=$(uuid)
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$EV4\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZSTARTED\",\"p_starts_at\":\"$(d 6 20:00)\",\"p_ends_at\":\"$(d 6 21:00)\"}"
sql -c "update calendar_events set starts_at = now() - interval '30 minutes', ends_at = now() + interval '30 minutes' where title = 'ZZSTARTED'" >/dev/null
sql -c "select share_events_expire()" >/dev/null
expect "once it has started the unanswered proposal drops from both" "0" "$(ev "title = 'ZZSTARTED'" 'count(*)')"
expect "…and the others stay" "2 2" "$(ev "title = 'ZZLATER'" 'count(*)') $(ev "title = 'ZZDATE'" 'count(*)')"
rpc "$A_JWT" share_events_expire; expect "the sweep isn't callable by the app" "refused" "$(refused)"
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$(uuid)\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZPAST\",\"p_starts_at\":\"$(d -3 18:00)\",\"p_ends_at\":\"$(d -3 19:00)\"}"
expect "a proposal in the past is refused" "refused" "$(refused)"

# ---------------------------------------------------------------------------------------------
section "edit: either person, for both"
api PATCH "$A_JWT" "/rest/v1/calendar_events?id=eq.$EV_A" "{\"title\":\"ZZDATE two\",\"starts_at\":\"$(d 4 19:00)\",\"ends_at\":\"$(d 4 21:00)\"}"
expect "A renames and moves his copy" "200" "$CODE"
expect "B's copy follows: title and time" "ZZDATE two $(d 4 19:00)" "$(ev "id = '$EV_B'" "title || ' ' || to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')")"
expect "…and says who did it (both copies carry A)" "$A_ID" "$(ev "shared_id = '$SID'" "string_agg(distinct share_edited_by::text, ' ')")"
api PATCH "$B_JWT" "/rest/v1/calendar_events?id=eq.$EV_B" "{\"title\":\"ZZDATE three\",\"ends_at\":\"$(d 4 22:00)\"}"
expect "B edits hers" "200" "$CODE"
expect "A's copy follows" "ZZDATE three $(d 4 22:00)" "$(ev "id = '$EV_A'" "title || ' ' || to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')")"
expect "…and the editor is now B" "$B_ID" "$(ev "id = '$EV_A'" share_edited_by)"
api PATCH "$B_JWT" "/rest/v1/calendar_events?id=eq.$EV_B" '{"color":"rose"}'
expect "colour stays each person's own (A still iris)" "iris" "$(ev "id = '$EV_A'" color)"
api PATCH "$B_JWT" "/rest/v1/calendar_events?id=eq.$EV_B" '{"private":true}'
expect "a shared event can't be Private" "f" "$(ev "id = '$EV_B'" private)"
api PATCH "$B_JWT" "/rest/v1/calendar_events?id=eq.$EV_A" '{"title":"ZZHACK"}'
expect "B can't write A's row (RLS: nothing changed)" "ZZDATE three" "$(ev "id = '$EV_A'" title)"
api PATCH "$C_JWT" "/rest/v1/calendar_events?id=eq.$EV_B" '{"title":"ZZHACK"}'
expect "a third user can't write it" "ZZDATE three" "$(ev "id = '$EV_B'" title)"
api GET "$C_JWT" "/rest/v1/calendar_events?shared_id=eq.$SID&select=id"
expect "a third user can't read either copy" "[]" "$BODY"
api PATCH "$A_JWT" "/rest/v1/calendar_events?id=eq.$EV_A" "{\"shared_id\":\"$(uuid)\",\"shared_with\":\"$C_ID\",\"share_status\":\"invited\",\"share_peer_status\":\"declined\",\"shared_circle\":\"$(uuid)\"}"
expect "the link columns can't be forged on an update" "$SID $B_ID accepted accepted" "$(ev "id = '$EV_A'" "concat_ws(' ', shared_id, shared_with, share_status, share_peer_status)")"
api POST "$A_JWT" "/rest/v1/calendar_events" "{\"title\":\"ZZFORGED\",\"starts_at\":\"$(d 7 10:00)\",\"ends_at\":\"$(d 7 11:00)\",\"shared_id\":\"$SID\",\"shared_circle\":\"$CIRCLE\",\"shared_with\":\"$B_ID\",\"share_status\":\"accepted\"}"
expect "…or on an insert (a forged copy is a plain event)" "1  " "$(ev "title = 'ZZFORGED'" "count(*)") $(ev "title = 'ZZFORGED'" "coalesce(shared_id::text, '')") $(ev "title = 'ZZFORGED'" "coalesce(shared_with::text, '')")"
expect "…and the real event still has exactly two copies" "2" "$(ev "shared_id = '$SID'" 'count(*)')"
FORGED=$(ev "title = 'ZZFORGED'" id)
PREFER='resolution=merge-duplicates,return=representation' api POST "$A_JWT" "/rest/v1/calendar_events?on_conflict=id" "{\"id\":\"$EV_A\",\"title\":\"ZZDATE four\",\"starts_at\":\"$(d 4 19:00)\",\"ends_at\":\"$(d 4 21:00)\",\"shared_id\":null,\"share_status\":null}"
expect "an upsert that carries empty link columns doesn't unlink it (the outbox writes whole rows)" "$SID ZZDATE four" "$(ev "id = '$EV_A'" "shared_id || ' ' || title")"
expect "…and the edit reached B" "ZZDATE four" "$(ev "id = '$EV_B'" title)"

# ---------------------------------------------------------------------------------------------
section "delete: for both, or from mine"
rpc "$C_JWT" shared_event_delete_both "{\"p_event\":\"$EV_B\"}"
expect "a third user can't delete it for both" "false" "$(jqe '.ok | tostring')"
rpc "$C_JWT" shared_event_respond "{\"p_event\":\"$EV_B\",\"p_accept\":false}"
expect "…or decline it" "false" "$(jqe '.ok | tostring')"
rpc "$C_JWT" shared_event_create "{\"p_id\":\"$(uuid)\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZSNEAK\",\"p_starts_at\":\"$(d 8 10:00)\",\"p_ends_at\":\"$(d 8 11:00)\"}"
expect "…or make one in A and B's circle" "refused" "$(refused)"
rpc "$B_JWT" shared_event_delete_both "{\"p_event\":\"$EV_B\"}"
expect "B deletes for both" "true" "$(jqe '.ok | tostring')"
expect "both copies are in their own Trash" "2" "$(ev "shared_id = '$SID' and deleted_at is not null" 'count(*)')"
api PATCH "$A_JWT" "/rest/v1/calendar_events?id=eq.$EV_A" '{"deleted_at":null}'
expect "Undo (a restore of A's copy) brings both back" "0" "$(ev "shared_id = '$SID' and deleted_at is not null" 'count(*)')"
rpc "$A_JWT" shared_event_delete_both "{\"p_event\":\"$EV_A\"}"
expect "A deletes for both" "true 2" "$(jqe '.ok | tostring') $(ev "shared_id = '$SID' and deleted_at is not null" 'count(*)')"
api PATCH "$B_JWT" "/rest/v1/calendar_events?id=eq.$EV_B" '{"deleted_at":null}'
expect "…and B's restore brings both back" "0" "$(ev "shared_id = '$SID' and deleted_at is not null" 'count(*)')"
# remove from mine
api PATCH "$B_JWT" "/rest/v1/calendar_events?id=eq.$EV_B" "{\"deleted_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
expect "B removes it from hers (a plain delete): A's copy reads declined, still A's" "declined $SID" "$(ev "id = '$EV_A'" "share_peer_status || ' ' || shared_id")"
expect "…B's copy is a plain event in Trash" "true  " "$(ev "id = '$EV_B'" "(deleted_at is not null)::text || ' ' || coalesce(shared_id::text, '') || ' ' || coalesce(shared_with::text, '')")"
api PATCH "$A_JWT" "/rest/v1/calendar_events?id=eq.$EV_A" '{"title":"ZZDATE five"}'
expect "A's later edits don't reach the removed copy" "ZZDATE four" "$(ev "id = '$EV_B'" title)"
rpc "$A_JWT" shared_event_delete_both "{\"p_event\":\"$EV_A\"}"
expect "A can still delete his own copy (nobody else is on it)" "true" "$(jqe '.ok | tostring')"
api DELETE "$A_JWT" "/rest/v1/calendar_events?id=eq.$EV_A"
sql -c "delete from calendar_events where title like 'ZZ%'" >/dev/null

# ---------------------------------------------------------------------------------------------
section "pause and leave"
EVP=$(uuid)
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$EVP\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZHIKE\",\"p_starts_at\":\"$(d 9 10:00)\",\"p_ends_at\":\"$(d 9 12:00)\"}"
EVPB=$(ev "title = 'ZZHIKE' and user_id = '$B_ID'" id)
rpc "$B_JWT" shared_event_respond "{\"p_event\":\"$EVPB\",\"p_accept\":true}"
EVQ=$(uuid)
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$EVQ\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZUNANSWERED\",\"p_starts_at\":\"$(d 9 14:00)\",\"p_ends_at\":\"$(d 9 15:00)\"}"
api PATCH "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE" '{"paused_until":"infinity"}'
rpc "$A_JWT" shared_event_create "{\"p_id\":\"$(uuid)\",\"p_circle\":\"$CIRCLE\",\"p_title\":\"ZZPAUSED\",\"p_starts_at\":\"$(d 9 16:00)\",\"p_ends_at\":\"$(d 9 17:00)\"}"
expect "paused: making one is refused (nothing made)" "false paused 0" "$(jqe '[.ok, .error] | map(tostring) | join(" ")') $(ev "title = 'ZZPAUSED'" 'count(*)')"
rpc "$A_JWT" shared_event_delete_both "{\"p_event\":\"$EVP\"}"
expect "paused: delete for both is refused" "false paused" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
free "$A_JWT" "$B_ID" "$D3" "$D4"
expect "paused: free together offers nothing" "false paused" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
api PATCH "$A_JWT" "/rest/v1/calendar_events?id=eq.$EVP" '{"title":"ZZHIKE paused"}'
expect "paused: an edit stays on the editor's copy" "ZZHIKE" "$(ev "id = '$EVPB'" title)"
api PATCH "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE" '{"paused_until":null}'
api PATCH "$A_JWT" "/rest/v1/calendar_events?id=eq.$EVP" '{"title":"ZZHIKE back"}'
expect "resumed: edits reach the other again" "ZZHIKE back" "$(ev "id = '$EVPB'" title)"
# leave
api DELETE "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE"
expect "B disconnects: the circle is gone" "0" "$(sql -c "select count(*) from circles where id = '$CIRCLE'")"
expect "each keeps a plain copy of their own (Hike: two rows, nothing linked)" "2 0" "$(ev "title like 'ZZHIKE%'" 'count(*)') $(ev "title like 'ZZHIKE%' and (shared_id is not null or shared_with is not null or share_status is not null)" 'count(*)')"
expect "an unanswered proposal stays only with the one who made it, as a plain event" "1 $A_ID" "$(ev "title = 'ZZUNANSWERED'" 'count(*)') $(ev "title = 'ZZUNANSWERED'" 'user_id')"
api PATCH "$A_JWT" "/rest/v1/calendar_events?id=eq.$EVP" '{"title":"ZZHIKE solo"}'
expect "after leaving, A's edit reaches nobody" "ZZHIKE back" "$(ev "id = '$EVPB'" title)"

# ---------------------------------------------------------------------------------------------
section "never shared, and no other access"
SHARE_FNS=$(sql -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'share\_%' or p.proname like 'shared\_%')")
info "sharing functions: $SHARE_FNS"
OTHER_TABLES=$(sql -c "select string_agg(tablename, '|') from pg_tables where schemaname = 'public' and tablename not in ('calendar_events', 'tasks', 'app_settings') and tablename not like 'share%' and tablename not like 'circle%'")
LEAKY=$(sql -c "select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and (p.proname like 'share\_%' or p.proname like 'shared\_%' or p.proname like 'circle%') and pg_get_functiondef(p.oid) ~* '\m(from|join|into|update|table)[[:space:]]+(public\.)?($OTHER_TABLES)\M'")
expect "no sharing function (this migration's too) names a table but calendar_events, tasks, app_settings and its own" "" "$LEAKY"
expect "the link columns are all that 0101 added to calendar_events" "share_edited_by,share_peer_status,share_status,shared_circle,shared_id,shared_with" "$(sql -c "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name = 'calendar_events' and (column_name like 'share%')")"
for fn in share_ctx_set share_active share_zone share_busy share_cal_guard share_cal_sync share_cal_unlink; do
  rpc "$B_JWT" "$fn" '{}'
  expect "internal $fn isn't callable by the app" "refused" "$(refused)"
done
NOCALL=$(grep -rIl -E "shared_event_|shared_free_together|share_events_expire" "$ROOT/supabase/functions/mcp" "$ROOT/supabase/functions/chat" "$ROOT/supabase/functions/_shared/retrieval.ts" "$ROOT/supabase/functions/search" "$ROOT/supabase/functions/capture" 2>/dev/null | wc -l | tr -d ' ')
expect "chat, MCP, search and capture never call them" "0" "$NOCALL"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0" "$(sql -c "select concat_ws(' ', (select count(*) from calendar_events where title like 'ZZ%'), (select count(*) from circle_members where user_id in ('$A_ID', '$B_ID', '$C_ID')))")"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
