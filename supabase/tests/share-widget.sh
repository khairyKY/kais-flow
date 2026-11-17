#!/usr/bin/env bash
# The her-day widget key (v1.6.6, partner sharing P2, migration 0104, function `share-widget`) against real Postgres +
# PostgREST, with three users: A shows a day, B is connected to A and holds the key, C is a stranger.
#
#   the key        only for someone you are connected with; shown once (only its hash is stored, the app can't read it back)
#   what it shows  A's day through share_day_data at the LOWER of both levels: Details has the goal and Top 3, Titles only
#                  titles, Busy nothing but blocks; a Private item is a Busy block; never a journal / people secret, never
#                  B's own day, never a raw row (no row id is in the answer)
#   the connection read live on every call: a lowered level and a pause apply on the next call; Stop = 410 for good (it can't
#                  be turned back on); a disconnect = 410 and the key is stopped for good (connecting again does not revive it)
#   other keys     the Widget link (kf_w_) is refused here, the her-day key (kf_p_) is refused by `widget`; a third user can
#                  neither make a key for A, read B's keys, stop them, nor call the reader
#   the limit      60 calls an hour
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/share-widget.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, openssl.
#
# Side effects: three throwaway accounts, swidget-a@ / swidget-b@ / swidget-c@example.com. Deleted (with every row they own,
# and their circles - cascade) before the run and again at the end.
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

EMAILS="'swidget-a@example.com', 'swidget-b@example.com', 'swidget-c@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# share-widget and widget under the harness, on the stack's database (SUPABASE_DB_URL, as the edge runtime gives it).
FN_PORT=${FN_PORT:-31399}
SUPABASE_URL=$API_URL SUPABASE_DB_URL=$DB_URL \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" share-widget widget \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "share-widget did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
F="http://127.0.0.1:$FN_PORT/share-widget"
W="http://127.0.0.1:$FN_PORT/widget"

PASSWORD='share-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
api() { # METHOD JWT PATH [JSON] -> CODE, BODY
  local out
  out=$(curl -sS -w '\n%{http_code}' -X "$1" "$API_URL$3" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -H 'Prefer: return=representation' ${4:+--data "$4"})
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
rpc() { local b=${3:-'{}'}; api POST "$1" "/rest/v1/rpc/$2" "$b"; }
jqe() { jq -r "$1" <<<"${2:-$BODY}"; }
has() { grep -cF -- "$1" <<<"${2:-$BODY}"; }
refused() { if [ "$CODE" -ge 400 ] 2>/dev/null; then echo refused; else echo "open($CODE $BODY)"; fi; }
new_token() { printf 'kf_p_%s' "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"; }
sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
mkkey() { # JWT owner_id -> token on stdout
  local tok; tok=$(new_token)
  api POST "$1" "/rest/v1/share_widget_links?select=id" "{\"owner_id\":\"$2\",\"token_hash\":\"$(sha "$tok")\",\"label\":\"Home PC\"}"
  case "$CODE" in 200|201) printf '%s' "$tok" ;; *) echo "share_widget_links insert -> $CODE $BODY" >&2; return 1 ;; esac
}
view() { # token -> CODE, BODY
  local out; out=$(curl -sS -w '\n%{http_code}' "$F?t=$1"); CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
setlevel() { sql -c "update share_grants set level = '$1' where owner_id in ('$A_ID','$B_ID')" >/dev/null; }

section "setup"
drop_users
A_JSON=$(new_user swidget-a@example.com); B_JSON=$(new_user swidget-b@example.com); C_JSON=$(new_user swidget-c@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON"); C_ID=$(jq -r .user.id <<<"$C_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON"); B_JWT=$(jq -r .access_token <<<"$B_JSON"); C_JWT=$(jq -r .access_token <<<"$C_JSON")
for v in "$A_ID" "$B_ID" "$C_ID" "$A_JWT" "$B_JWT" "$C_JWT"; do [ -n "$v" ] && [ "$v" != null ] || { echo "could not sign up test users" >&2; exit 2; }; done

# A's day around now(); titles are unique words so a leak is a grep. B's own day has one too (never in the key's answer).
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone, display_name) values (:'a', 'Africa/Cairo', 'Reem'), (:'b', 'Africa/Cairo', 'Kai')
  on conflict (user_id) do update set timezone = excluded.timezone, display_name = excluded.display_name;
insert into journal_entries (user_id, body, entry_date) values (:'a', 'ZZJOURNAL secret', current_date);
insert into people (user_id, name) values (:'a', 'ZZPERSON secret');
insert into tasks (id, user_id, title, notes, top3, top3_rank, due_at) values
  ('a0000000-0000-0000-0000-0000000000a1', :'a', 'T3GOAL', 'NOTEGOAL', true, 1, now() - interval '1 hour');
insert into tasks (id, user_id, title, top3, top3_rank) values ('a0000000-0000-0000-0000-0000000000a2', :'a', 'T3TWO', true, 2);
insert into tasks (id, user_id, title, private, top3, top3_rank) values ('a0000000-0000-0000-0000-0000000000a3', :'a', 'PVPICK', true, true, 3);
insert into tasks (id, user_id, title, top3, top3_rank) values ('b0000000-0000-0000-0000-0000000000b1', :'b', 'BOWNTASK', true, 1);
insert into calendar_events (id, user_id, title, starts_at, ends_at, type) values
  ('e0000000-0000-0000-0000-0000000000a1', :'a', 'EVNOW', now() - interval '10 minutes', now() + interval '50 minutes', 'event'),
  ('e0000000-0000-0000-0000-0000000000a2', :'a', 'EVNEXT', now() + interval '2 hours', now() + interval '3 hours', 'event'),
  ('e0000000-0000-0000-0000-0000000000b1', :'b', 'BOWNEVENT', now() - interval '5 minutes', now() + interval '30 minutes', 'event');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, private) values
  ('e0000000-0000-0000-0000-0000000000a3', :'a', 'PVTHERAPY', now() + interval '4 hours', now() + interval '5 hours', 'event', true);
SQL

# connect A and B as partners (Details both ways)
rpc "$A_JWT" share_invite_create '{"p_relation":"partner"}'; CODE_A=$(jqe .code)
rpc "$B_JWT" share_invite_accept "{\"p_code\":\"$CODE_A\"}"
expect "A and B are connected" "true" "$(jqe '.ok | tostring')"
CIRCLE=$(jqe .circle_id)

# ---------------------------------------------------------------------------------------------
section "making a key"
api POST "$C_JWT" "/rest/v1/share_widget_links?select=id" "{\"owner_id\":\"$A_ID\",\"token_hash\":\"$(sha "$(new_token)")\"}"
expect "a stranger can't make a key for A" "refused" "$(refused)"
api POST "$B_JWT" "/rest/v1/share_widget_links?select=id" "{\"owner_id\":\"$B_ID\",\"token_hash\":\"$(sha "$(new_token)")\"}"
expect "nobody makes a key for their own day" "refused" "$(refused)"
api POST "$B_JWT" "/rest/v1/share_widget_links?select=id" "{\"user_id\":\"$A_ID\",\"owner_id\":\"$B_ID\",\"token_hash\":\"$(sha "$(new_token)")\"}"
expect "nor one that A would hold" "refused" "$(refused)"
K=$(mkkey "$B_JWT" "$A_ID") || exit 2
expect "B (connected) makes a key for A's day" "1" "$(sql -c "select count(*) from share_widget_links where user_id = '$B_ID' and owner_id = '$A_ID'")"
api GET "$B_JWT" "/rest/v1/share_widget_links?select=token_hash"
expect "the app can't read a hash back" "refused" "$(refused)"
api GET "$B_JWT" "/rest/v1/share_widget_links?select=id,owner_id,label,revoked_at"
expect "B lists their key (no hash)" "$A_ID" "$(jqe '.[0].owner_id')"
api GET "$C_JWT" "/rest/v1/share_widget_links?select=id"
expect "C sees no keys" "[]" "$BODY"
api GET "$A_JWT" "/rest/v1/share_widget_links?select=id"
expect "A (whose day it is) sees no key either: it is B's" "[]" "$BODY"
rpc "$B_JWT" share_widget_read "{\"p_hash\":\"$(sha "$K")\"}"
expect "the reader isn't callable by the app's role" "refused" "$(refused)"
expect "only the hash is stored" "0" "$(sql -c "select count(*) from share_widget_links where token_hash = '$K'")"

# ---------------------------------------------------------------------------------------------
section "what the key shows: Details (Partner, both ways)"
view "$K"
expect "200, ok, A's name, Details" "200 ok Reem details" "$CODE $(jqe '[.status, .name, .level] | join(" ")')"
expect "now, then next" "EVNOW EVNEXT" "$(jqe '[.now_block.title, .next_blocks[0].title] | join(" ")')"
expect "her goal, and the Top 3 count (a Private pick isn't in it)" "T3GOAL 2" "$(jqe '[.goal.title, (.top3 | length | tostring)] | join(" ")')"
expect "Private is a Busy block (after EVNEXT), with no title" "true 0" "$(jqe '(.next_blocks[1].busy | tostring)') $(has PVTHERAPY)"
expect "no secret of A's, no row of B's, no ids" "0 0 0 0 0" "$(has ZZJOURNAL) $(has ZZPERSON) $(has BOWN) $(has PVPICK) $(has 'e0000000-')"
expect "Heather, her colour" "heather" "$(jqe '.now_block.color')"
expect "the feed names the same colour on the feed itself" "heather" "$(jqe '.color')"
# 0105: the colour is the VIEWER's pick for her (B's own member row); the key is B's, so it reads B's pick
sql -c "update circle_members set color = '#E58F99' where user_id = '$B_ID'" >/dev/null
view "$K"; expect "B picks Rose for her: the feed and every block say rose" "rose rose" "$(jqe '[.color, .now_block.color] | join(" ")')"
sql -c "update circle_members set color = '#B59CE3' where user_id = '$A_ID'" >/dev/null
view "$K"; expect "A's own pick for B changes nothing for B's key (per viewer)" "rose" "$(jqe .color)"
sql -c "update circle_members set color = '#8972B3' where circle_id = '$CIRCLE'" >/dev/null

section "the connection is read live on every call"
setlevel titles; view "$K"
expect "Titles: titles and times, no goal, no Top 3" "titles EVNOW null 0" "$(jqe '[.level, .now_block.title, (.goal | tostring), (.top3 | length | tostring)] | join(" ")')"
expect "…and no task title or note" "0 0" "$(has T3GOAL) $(has NOTEGOAL)"
setlevel busy; view "$K"
expect "Busy: blocks, no titles at all" "busy true 0 0" "$(jqe '[.level, (.now_block.busy | tostring)] | join(" ")') $(has EVNOW) $(has EVNEXT)"
sql -c "update share_grants set level = 'details' where owner_id = '$A_ID'; update share_grants set level = 'titles' where owner_id = '$B_ID'" >/dev/null
view "$K"; expect "the LOWER of the two: A shows Details, B shows Titles, the key gets Titles" "titles" "$(jqe .level)"
setlevel details
sql -c "update circles set paused_until = now() + interval '3 hours'" >/dev/null
view "$K"; expect "paused: name and when it ends, no blocks" "200 paused Reem 0 0" "$CODE $(jqe '[.status, .name] | join(" ")') $(has now_block) $(has EVNOW)"
sql -c "update circles set paused_until = null" >/dev/null
view "$K"; expect "resumed: the day is back" "ok" "$(jqe .status)"

section "Stop is for good"
KID=$(sql -c "select id from share_widget_links where user_id = '$B_ID' limit 1")
api PATCH "$C_JWT" "/rest/v1/share_widget_links?id=eq.$KID&select=id" '{"revoked_at":"2020-01-01T00:00:00Z"}'
expect "C can't stop B's key" "[]" "$BODY"
api PATCH "$B_JWT" "/rest/v1/share_widget_links?id=eq.$KID&select=id" "{\"revoked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
view "$K"; expect "B presses Stop: 410 revoked at once" "410 gone revoked 0" "$CODE $(jqe '[.error, .reason] | join(" ")') $(has EVNOW)"
api PATCH "$B_JWT" "/rest/v1/share_widget_links?id=eq.$KID&select=id" '{"revoked_at":null}'
view "$K"; expect "it can't be turned back on" "410" "$CODE"
view "kf_p_$(printf 'x%.0s' $(seq 1 43))"; expect "a key nobody made is 401" "401" "$CODE"
view "nonsense"; expect "a token of the wrong shape is 401" "401" "$CODE"

section "a disconnect stops it, for good"
K2=$(mkkey "$B_JWT" "$A_ID") || exit 2
K3=$(mkkey "$A_JWT" "$B_ID") || exit 2
view "$K3"; expect "A's key for B's day works too (each holds their own)" "ok Kai" "$(jqe '[.status, .name] | join(" ")')"
view "$K2"; expect "the second key works" "ok" "$(jqe .status)"
api DELETE "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE"
view "$K2"; expect "disconnected: 410, no blocks (the cut already stopped the key, so it says revoked)" "410 gone revoked 0" "$CODE $(jqe '[.error, .reason] | join(" ")') $(has EVNOW)"
view "$K3"; expect "…both directions" "410" "$CODE"
expect "both keys are stopped in the database (not just refused)" "2" "$(sql -c "select count(*) from share_widget_links where revoked_at is not null and id <> '$KID'")"
rpc "$A_JWT" share_invite_create '{"p_relation":"partner"}'; CODE_B=$(jqe .code)
rpc "$B_JWT" share_invite_accept "{\"p_code\":\"$CODE_B\"}"
view "$K2"; expect "connecting again does not bring the old key back" "410 revoked" "$CODE $(jqe .reason)"
K4=$(mkkey "$B_JWT" "$A_ID") || exit 2
view "$K4"; expect "a new key for the new connection works" "ok" "$(jqe .status)"

section "other keys, and a stranger"
WTOK="kf_w_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
api POST "$B_JWT" "/rest/v1/widget_links?select=id" "{\"token_hash\":\"$(sha "$WTOK")\",\"label\":\"Desktop\"}"
expect "B makes a Widget link (their own day's key)" "true" "$([ "$CODE" = 200 ] || [ "$CODE" = 201 ] && echo true || echo "false($CODE $BODY)")"
view "$WTOK"; expect "the Widget link is refused by share-widget" "401" "$CODE"
expect "the her-day key is refused by the Widget function" "401" "$(curl -sS -o /dev/null -w '%{http_code}' "$W?t=$K4")"
OWN=$(curl -sS "$W?t=$WTOK")
expect "the Widget link still reads B's own day, not A's" "1 0" "$(has BOWNEVENT "$OWN") $(has EVNOW "$OWN")"
view "$K4"; expect "the her-day key never carries B's own day" "0" "$(has BOWN)"
rpc "$C_JWT" shared_day "{\"p_owner\":\"$A_ID\",\"p_from\":\"2020-01-01T00:00:00Z\",\"p_to\":\"2030-01-01T00:00:00Z\"}"
expect "a third user gets nothing of A" "null 0" "$(jqe '.level | tostring') $(has EVNOW)"
sql -c "update share_widget_links set calls = 60, calls_hour = date_trunc('hour', now()) where token_hash = '$(sha "$K4")'" >/dev/null
view "$K4"; expect "past 60 calls this hour" "429" "$CODE"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E '^share-widget:' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0" "$(sql -c "select (select count(*) from share_widget_links where user_id in ('$A_ID','$B_ID','$C_ID')) || ' ' || (select count(*) from widget_links where user_id in ('$A_ID','$B_ID','$C_ID'))" | sed 's/^\(.\) \(.\)$/\1 \2/')"

if [ "$FAIL" != 0 ]; then echo; echo "-- harness log (last 60 lines) --"; tail -60 "$TMP/harness.log"; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
