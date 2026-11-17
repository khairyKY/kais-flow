#!/usr/bin/env bash
# Partner sharing (v1.6.6, migration 0100, function `share-view`) against real Postgres + PostgREST, with three users:
#   A shows his day, B is connected to A, C is a stranger. Every reader goes through the real API as that user (JWT),
#   so the grants and RLS are the real ones; the rows are placed around now() by psql as the owner.
#
#   connect          the 8-character code (alphabet, single use, expiry, wrong tries), the confirm step's peek, one pair
#   the matrix       every level (Busy / Titles / Details) x every kind (event, task block, Time block, Top 3, task list,
#                    Google / subscribed event, Private item) exactly as design-export/Partner sharing flows.html draws it
#   Private          a Private item is a Busy block at every level (itself, its task's block, a series' detached occurrence);
#                    an untimed Private task and a task in a Private Time block are never on the card
#   never shared     journal, people, interactions, the AI's tables: the RPCs can't reach them (function bodies read only
#                    calendar_events / tasks / app_settings's name and zone), the tables are closed to B, and the AI
#                    functions (chat, mcp) never call a sharing function
#   rules            the lower of the two levels both ways, a pause cuts both ways at once, a leave wipes everything
#                    (and tells the other side through share_pings), a third user sees nothing, grants can't be forged,
#                    deleting an account ends its connections
#   the view link    function share-view under the harness: 401 / 410 (revoked, expired) / 429, Busy masks titles, Titles shows
#                    them, Private is Busy on a link too, no Top 3 / tasks / notes ever, 8 days, 30 days at most, one more tap renews
# LOCAL Supabase stack only: refuses to run unless the API and database URLs are 127.0.0.1/localhost.
#
#   supabase/tests/sharing.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, openssl.
#
# Side effects: three throwaway accounts, share-a@ / share-b@ / share-c@example.com. Deleted (with every row they own,
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

EMAILS="'share-a@example.com', 'share-b@example.com', 'share-c@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
# share-view under the harness, on the stack's database (SUPABASE_DB_URL, as the edge runtime gives it).
# ---------------------------------------------------------------------------------------------
FN_PORT=${FN_PORT:-31398}
SUPABASE_URL=$API_URL SUPABASE_DB_URL=$DB_URL \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" share-view \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "share-view did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
F="http://127.0.0.1:$FN_PORT/share-view"

# ---------------------------------------------------------------------------------------------
# helpers: users, the API as a user
# ---------------------------------------------------------------------------------------------
PASSWORD='share-local-only-password'
new_user() { # email -> JSON session
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
# api METHOD JWT PATH [JSON] -> CODE and BODY (the response body, one line)
api() {
  local out
  out=$(curl -sS -w '\n%{http_code}' -X "$1" "$API_URL$3" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' -H 'Prefer: return=representation' ${4:+--data "$4"})
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
rpc() { local b=${3:-'{}'}; api POST "$1" "/rest/v1/rpc/$2" "$b"; }  # JWT fn [json]
day() { rpc "$1" shared_day "{\"p_owner\":\"$2\",\"p_from\":\"$(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%SZ)\",\"p_to\":\"$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ)\"}"; }
closed() { if [ "$BODY" = "[]" ] || [ "$CODE" = 401 ] || [ "$CODE" = 403 ] || [ "$CODE" = 404 ]; then echo closed; else echo "open($CODE $BODY)"; fi; }  # nothing came back, or the API refused
jqe() { jq -r "$1" <<<"${2:-$BODY}"; }   # an expression over BODY (or $2)
setlevel() { sql -c "update share_grants set level = '$1' where owner_id in ('$A_ID','$B_ID')" >/dev/null; }  # both ways, as the owner
has() { grep -cF -- "$1" <<<"${2:-$BODY}"; }

section "setup"
drop_users
A_JSON=$(new_user share-a@example.com); B_JSON=$(new_user share-b@example.com); C_JSON=$(new_user share-c@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON"); C_ID=$(jq -r .user.id <<<"$C_JSON")
A_JWT=$(jq -r .access_token <<<"$A_JSON"); B_JWT=$(jq -r .access_token <<<"$B_JSON"); C_JWT=$(jq -r .access_token <<<"$C_JSON")
for v in "$A_ID" "$B_ID" "$C_ID" "$A_JWT" "$B_JWT" "$C_JWT"; do [ -n "$v" ] && [ "$v" != null ] || { echo "could not sign up test users" >&2; exit 2; }; done

# A's day, one of every kind, around now(). Titles are unique words so a leak is a grep.
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone, display_name) values (:'a', 'Africa/Cairo', 'Kai'), (:'b', 'Africa/Cairo', 'Reem')
  on conflict (user_id) do update set timezone = excluded.timezone, display_name = excluded.display_name;
-- the never-shared tables, with a secret in each
insert into journal_entries (user_id, body, entry_date) values (:'a', 'ZZJOURNAL secret', current_date);
insert into people (user_id, name) values (:'a', 'ZZPERSON secret');
insert into notes (user_id, body) values (:'a', 'ZZNOTE secret') on conflict do nothing;
-- tasks: Top 3 (goal with notes, a pick, one done today), a due-today task with notes, Private ones
insert into tasks (id, user_id, title, notes, top3, top3_rank, due_at) values
  ('a0000000-0000-0000-0000-000000000001', :'a', 'T3GOAL', 'NOTEGOAL', true, 1, now() - interval '1 hour');
insert into tasks (id, user_id, title, top3, top3_rank) values ('a0000000-0000-0000-0000-000000000002', :'a', 'T3TWO', true, 2);
insert into tasks (id, user_id, title, top3, top3_rank, status, completed_at) values ('a0000000-0000-0000-0000-000000000003', :'a', 'T3DONE', true, 3, 'done', now());
insert into tasks (id, user_id, title, notes, private, top3, top3_rank) values ('a0000000-0000-0000-0000-000000000004', :'a', 'PVPICK', 'PVNOTE', true, true, 4);
insert into tasks (id, user_id, title, notes, due_at) values
  ('a0000000-0000-0000-0000-000000000005', :'a', 'TLDUE', 'NOTEDUE', (date_trunc('day', now() at time zone 'Africa/Cairo') + interval '15 hours') at time zone 'Africa/Cairo');
insert into tasks (id, user_id, title, private, due_at) values
  ('a0000000-0000-0000-0000-000000000006', :'a', 'PVUNTIMED', true, (date_trunc('day', now() at time zone 'Africa/Cairo') + interval '16 hours') at time zone 'Africa/Cairo');
insert into tasks (id, user_id, title) values ('a0000000-0000-0000-0000-000000000007', :'a', 'TBLOCKTASK');
-- calendar: event, task block, Time block, Google, subscribed, Private event, Private task's block, a Private series + its occurrence, a private Time block, trashed, a free one
insert into calendar_events (id, user_id, title, starts_at, ends_at, type) values
  ('e0000000-0000-0000-0000-000000000001', :'a', 'EVLECTURE', now() + interval '1 hour', now() + interval '2 hours', 'event'),
  ('e0000000-0000-0000-0000-000000000002', :'a', 'TBDEEPWORK', now() + interval '3 hours', now() + interval '5 hours', 'time_block'),
  ('e0000000-0000-0000-0000-000000000010', :'a', 'PVBLOCK', now() + interval '6 hours', now() + interval '7 hours', 'time_block');
update calendar_events set private = true where id = 'e0000000-0000-0000-0000-000000000010';
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, task_id) values
  ('e0000000-0000-0000-0000-000000000003', :'a', 'TKBLOCK', now() + interval '8 hours', now() + interval '9 hours', 'task', 'a0000000-0000-0000-0000-000000000007'),
  ('e0000000-0000-0000-0000-000000000008', :'a', 'PVTASKBLOCK', now() + interval '10 hours', now() + interval '11 hours', 'task', 'a0000000-0000-0000-0000-000000000004');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, source) values
  ('e0000000-0000-0000-0000-000000000004', :'a', 'GCDENTIST', now() + interval '12 hours', now() + interval '13 hours', 'event', 'gcal'),
  ('e0000000-0000-0000-0000-000000000005', :'a', 'ICSPRAYER', now() + interval '14 hours', now() + interval '15 hours', 'event', 'ics');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, private) values
  ('e0000000-0000-0000-0000-000000000006', :'a', 'PVTHERAPY', now() + interval '16 hours', now() + interval '17 hours', 'event', true),
  ('e0000000-0000-0000-0000-000000000011', :'a', 'PVSERIES', now() + interval '18 hours', now() + interval '19 hours', 'event', true);
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, series_id) values
  ('e0000000-0000-0000-0000-000000000012', :'a', 'PVOCCURRENCE', now() + interval '20 hours', now() + interval '21 hours', 'event', 'e0000000-0000-0000-0000-000000000011');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, recurrence_rule, recurrence_exdates) values
  ('e0000000-0000-0000-0000-000000000013', :'a', 'RCGYM', now() + interval '22 hours', now() + interval '23 hours', 'event', 'FREQ=WEEKLY', '{}');
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, deleted_at) values
  ('e0000000-0000-0000-0000-000000000007', :'a', 'TRTRASHED', now() + interval '1 hour', now() + interval '2 hours', 'event', now());
insert into calendar_events (id, user_id, title, starts_at, ends_at, type, busy) values
  ('e0000000-0000-0000-0000-000000000014', :'a', 'FRFREE', now() + interval '24 hours', now() + interval '25 hours', 'event', false);
-- a task in the Private Time block, a Top 3 pick: never on the card
insert into tasks (id, user_id, title, top3, top3_rank, slot_id) values
  ('a0000000-0000-0000-0000-000000000008', :'a', 'INPRIVATEBLOCK', true, 5, 'e0000000-0000-0000-0000-000000000010');
SQL
info "users A=$A_ID B=$B_ID C=$C_ID"

# ---------------------------------------------------------------------------------------------
section "before any connection: nobody sees anything"
day "$B_JWT" "$A_ID"
expect "B (not connected) gets no level, no blocks" "null null" "$(jqe '[(.level|tostring), (.blocks|tostring)] | join(" ")')"
for t in tasks calendar_events journal_entries people notes; do
  api GET "$B_JWT" "/rest/v1/$t?user_id=eq.$A_ID&select=id"
  expect "B can't select A's $t (RLS: nothing)" "closed" "$(closed)"
done
rpc "$A_JWT" shared_day "{\"p_owner\":\"$A_ID\",\"p_from\":\"2020-01-01T00:00:00Z\",\"p_to\":\"2030-01-01T00:00:00Z\"}"
expect "A asking for A through the lane RPC gets nothing (it is for other people)" "null" "$(jqe '.level | tostring')"
rpc "$B_JWT" share_day_data "{\"p_owner\":\"$A_ID\",\"p_level\":\"details\",\"p_from\":\"2020-01-01T00:00:00Z\",\"p_to\":\"2030-01-01T00:00:00Z\"}"
expect "the unmasked reader isn't callable by the app's role" "true" "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] || [ "$CODE" = 404 ] && echo true || echo "false($CODE)")"
for fn in share_bump share_bump_circle share_name share_invite_find; do
  rpc "$B_JWT" "$fn" '{"p_owner":"'"$A_ID"'"}'
  expect "internal $fn isn't callable by the app's role" "true" "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] || [ "$CODE" = 404 ] && echo true || echo "false($CODE)")"
done
api GET "$B_JWT" "/rest/v1/share_attempts?select=*"
expect "share_attempts is closed to the app" "true" "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo true || echo "false($CODE $BODY)")"

# ---------------------------------------------------------------------------------------------
section "connect: the code"
rpc "$A_JWT" share_invite_create '{"p_relation":"partner"}'
INV=$BODY; CODE_A=$(jqe .code "$INV")
expect "the code is 8 characters of A-Z and 2-9 without 0/O/1/I" "true" "$([[ "$CODE_A" =~ ^[A-HJ-NP-Z2-9]{8}$ ]] && echo true || echo "false($CODE_A)")"
expect "it is good for 24 hours" "t" "$(sql -c "select expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute' from share_invites where code = '$CODE_A'")"
rpc "$A_JWT" share_invite_create '{"p_relation":"sibling"}'
expect "a relation outside Partner / Family / Friend is refused" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
rpc "$A_JWT" share_invite_peek "{\"p_code\":\"$CODE_A\"}"
expect "the inviter's own code is a bad code (peek)" "false bad_code" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
api GET "$B_JWT" "/rest/v1/share_invites?select=code"
expect "B can't read A's invites" "[]" "$BODY"
api GET "$A_JWT" "/rest/v1/share_invites?select=code&used_at=is.null"
expect "A lists their own waiting invite, with its code" "$CODE_A" "$(jqe '.[0].code')"
rpc "$B_JWT" share_invite_peek "{\"p_code\":\"${CODE_A:0:4}-$(tr 'A-Z' 'a-z' <<<"${CODE_A:4}")\"}"
expect "peek (the confirm screen): who and as what, dash and lower case fine" "true Kai partner details" "$(jqe '[.ok, .from_name, .relation, .level] | map(tostring) | join(" ")')"
rpc "$B_JWT" share_invite_accept "{\"p_code\":\"$CODE_A\"}"
expect "accept connects" "true" "$(jqe '.ok | tostring')"
CIRCLE=$(jqe .circle_id)
rpc "$B_JWT" share_invite_accept "{\"p_code\":\"$CODE_A\"}"
expect "a used code fails, and says what a wrong one says" "false bad_code" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
rpc "$C_JWT" share_invite_peek "{\"p_code\":\"$CODE_A\"}"
expect "…for a third person too" "false bad_code" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
expect "one circle, two members, two grants; Partner = Details both ways, the lane on" "1 2 2 details details t" "$(sql -c "select concat_ws(' ', (select count(*) from circles), (select count(*) from circle_members), (select count(*) from share_grants), (select string_agg(level, ' ') from share_grants), (select bool_and(show_lane) from circle_members))" | sed 's/details details/details details/')"

# an expired code, a cancelled code, wrong tries
rpc "$A_JWT" share_invite_create '{"p_relation":"family"}'; CODE_X=$(jqe .code)
sql -c "update share_invites set expires_at = now() - interval '1 minute' where code = '$CODE_X'" >/dev/null
rpc "$C_JWT" share_invite_accept "{\"p_code\":\"$CODE_X\"}"
expect "an expired code fails" "false bad_code" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
rpc "$A_JWT" share_invite_create '{"p_relation":"family"}'; CODE_Y=$(jqe .code); ID_Y=$(jqe .id)
api PATCH "$A_JWT" "/rest/v1/share_invites?id=eq.$ID_Y" "{\"cancelled_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
expect "Cancel on a waiting invite" "true" "$([ "$CODE" = 200 ] && echo true || echo "false($CODE)")"
rpc "$C_JWT" share_invite_accept "{\"p_code\":\"$CODE_Y\"}"
expect "a cancelled code fails" "false bad_code" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
sql -c "delete from share_attempts" >/dev/null
rpc "$A_JWT" share_invite_create '{"p_relation":"friend"}'; CODE_Z=$(jqe .code)
for i in 1 2 3 4 5; do rpc "$C_JWT" share_invite_peek '{"p_code":"ZZZZZZZZ"}'; done
rpc "$C_JWT" share_invite_peek "{\"p_code\":\"$CODE_Z\"}"
expect "five wrong tries: even the right code waits 15 minutes" "false try_later" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
sql -c "update share_attempts set blocked_until = null, fails = 0" >/dev/null
for _ in 1 2 3 4; do rpc "$A_JWT" share_invite_create '{"p_relation":"friend"}'; done
expect "five waiting invites are fine" "true" "$([ "$CODE" = 200 ] && echo true || echo "false($CODE)")"
rpc "$A_JWT" share_invite_create '{"p_relation":"friend"}'
expect "a sixth waiting invite is refused" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
sql -c "delete from share_invites where used_at is null" >/dev/null

# ---------------------------------------------------------------------------------------------
section "the matrix: every level x every kind (B looks at A)"
BOTH() { :; }
for LV in busy titles details; do
  setlevel "$LV"
  day "$B_JWT" "$A_ID"; D=$BODY
  expect "[$LV] B's level is $LV" "$LV" "$(jqe .level "$D")"
  blk() { jq -c --arg id "$1" '.blocks[] | select(.id == $id)' <<<"$D"; }
  masked() { jq -r --arg id "$1" '[.blocks[] | select(.id == $id)] | if length == 0 then "absent" else (.[0] | if (.masked == true and (has("title") | not) and (has("kind") | not)) then "busy" else "titled:" + (.title // "") end) end' <<<"$D"; }
  if [ "$LV" = busy ]; then WANT="busy"; else WANT=titled; fi
  for kv in "e0000000-0000-0000-0000-000000000001:EVLECTURE:Event" "e0000000-0000-0000-0000-000000000003:TKBLOCK:Task block" "e0000000-0000-0000-0000-000000000002:TBDEEPWORK:Time block" \
            "e0000000-0000-0000-0000-000000000004:GCDENTIST:Google event" "e0000000-0000-0000-0000-000000000005:ICSPRAYER:Subscribed event"; do
    id=${kv%%:*}; rest=${kv#*:}; title=${rest%%:*}; label=${rest#*:}
    if [ "$LV" = busy ]; then expect "[$LV] $label is a Busy block: no title, no kind" "busy" "$(masked "$id")"
    else expect "[$LV] $label shows its title and time" "titled:$title" "$(masked "$id")"; fi
  done
  expect "[$LV] a Private event is a Busy block" "busy" "$(masked e0000000-0000-0000-0000-000000000006)"
  expect "[$LV] a Private task's block is a Busy block" "busy" "$(masked e0000000-0000-0000-0000-000000000008)"
  expect "[$LV] a Private Time block is a Busy block" "busy" "$(masked e0000000-0000-0000-0000-000000000010)"
  expect "[$LV] a Private series is a Busy block" "busy" "$(masked e0000000-0000-0000-0000-000000000011)"
  expect "[$LV] …and the occurrence dragged out of it" "busy" "$(masked e0000000-0000-0000-0000-000000000012)"
  expect "[$LV] a trashed event isn't there" "absent" "$(masked e0000000-0000-0000-0000-000000000007)"
  if [ "$LV" = busy ]; then expect "[$LV] a 'show as free' event doesn't block her time" "absent" "$(masked e0000000-0000-0000-0000-000000000014)"
  else expect "[$LV] a 'show as free' event is shown" "titled:FRFREE" "$(masked e0000000-0000-0000-0000-000000000014)"; fi
  expect "[$LV] a repeat carries its rule, so the app can draw every occurrence" "FREQ=WEEKLY" "$(jq -r '.blocks[] | select(.id == "e0000000-0000-0000-0000-000000000013") | .recurrence_rule' <<<"$D")"
  if [ "$LV" = details ]; then
    expect "[$LV] Top 3: the goal first, its notes, a pick, the done one; not the Private one nor the one in a Private block" "T3GOAL T3TWO T3DONE" "$(jq -r '[.top3[].title] | join(" ")' <<<"$D")"
    expect "[$LV] Top 3: goal flag, notes, done flag" "true NOTEGOAL true" "$(jq -r '[(.top3[0].goal|tostring), .top3[0].notes, (.top3[2].done|tostring)] | join(" ")' <<<"$D")"
    expect "[$LV] task list: due today, with its notes; not the Private untimed one" "TLDUE NOTEDUE" "$(jq -r '[.tasks[].title, .tasks[].notes] | join(" ")' <<<"$D")"
  else
    expect "[$LV] no Top 3 and no tasks" "0 0" "$(jq -r '[(.top3 | length), (.tasks | length)] | join(" ")' <<<"$D")"
  fi
  # what must never be in any answer, at any level
  for secret in PVTHERAPY PVTASKBLOCK PVBLOCK PVSERIES PVOCCURRENCE PVPICK PVNOTE PVUNTIMED INPRIVATEBLOCK TRTRASHED ZZJOURNAL ZZPERSON ZZNOTE; do
    [ "$(has "$secret" "$D")" = 0 ] || bad "[$LV] '$secret' leaked into B's answer"
  done
  ok "[$LV] none of the Private / trashed / never-shared words are in the answer"
  if [ "$LV" = busy ]; then
    for w in EVLECTURE TKBLOCK TBDEEPWORK GCDENTIST ICSPRAYER RCGYM T3GOAL TLDUE NOTEGOAL NOTEDUE; do [ "$(has "$w" "$D")" = 0 ] || bad "[busy] '$w' leaked"; done
    ok "[busy] no title, note or task of anything is in the answer"
  fi
  expect "[$LV] the only keys a block has are the masked ones (no notes, place, guests, colour, link)" "true" "$(jq -r '[.blocks[] | keys[]] | unique | all(. as $k | ["all_day","ends_at","id","kind","masked","recurrence_exdates","recurrence_rule","starts_at","title"] | index($k))' <<<"$D")"
done

# ---------------------------------------------------------------------------------------------
section "the lower of the two levels, both ways"
setlevel details
api PATCH "$B_JWT" "/rest/v1/share_grants?owner_id=eq.$B_ID" '{"level":"titles"}'
expect "B lowers their own grant" "titles" "$(jqe '.[0].level')"
day "$B_JWT" "$A_ID"; expect "B now sees A at Titles (B shows less)" "titles 0" "$(jqe '[.level, (.top3 | length | tostring)] | join(" ")')"
day "$A_JWT" "$B_ID"; expect "A sees B at Titles too" "titles" "$(jqe .level)"
api PATCH "$B_JWT" "/rest/v1/share_grants?owner_id=eq.$A_ID" '{"level":"details"}'
expect "B can't change A's grant (no row)" "[]" "$BODY"
api PATCH "$B_JWT" "/rest/v1/share_grants?owner_id=eq.$B_ID" '{"owner_id":"'"$C_ID"'"}'
expect "a grant's owner can't be rewritten" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
api POST "$B_JWT" "/rest/v1/share_grants" "{\"circle_id\":\"$CIRCLE\",\"owner_id\":\"$A_ID\",\"viewer_id\":\"$B_ID\",\"level\":\"details\"}"
expect "B can't make a grant as A" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
api POST "$B_JWT" "/rest/v1/circle_members" "{\"circle_id\":\"$CIRCLE\",\"user_id\":\"$C_ID\"}"
expect "no one can add a member through the API" "true" "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo true || echo "false($CODE)")"
api PATCH "$B_JWT" "/rest/v1/share_grants?owner_id=eq.$B_ID" '{"level":"owner"}'
expect "a level outside Busy / Titles / Details is refused" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
setlevel details

section "a third user sees nothing"
day "$C_JWT" "$A_ID"; expect "C asking for A" "null" "$(jqe '.level | tostring')"
day "$C_JWT" "$B_ID"; expect "C asking for B" "null" "$(jqe '.level | tostring')"
for t in circles circle_members share_grants share_pings share_invites share_links; do
  col=id; [ "$t" = share_pings ] && col=user_id
  api GET "$C_JWT" "/rest/v1/$t?select=$col"
  expect "C reads no row of $t" "closed" "$(closed)"
done
rpc "$C_JWT" share_connections; expect "C has no connections" "[]" "$BODY"
rpc "$B_JWT" share_connections
expect "B's connection: the partner's name, both levels, the lane on, not paused" "Kai details details true null" "$(jqe '.[0] | [.partner_name, .my_level, .their_level, (.show_lane|tostring), (.paused_until|tostring)] | join(" ")')"

# ---------------------------------------------------------------------------------------------
section "pings: the narrow Realtime signal"
expect "share_pings is the only sharing table in the Realtime publication" "share_pings" "$(sql -c "select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and (tablename like 'share%' or tablename like 'circle%')")"
expect "its row is a user and a timestamp, nothing else" "at user_id" "$(sql -c "select string_agg(column_name, ' ' order by column_name) from information_schema.columns where table_name = 'share_pings'")"
sql -c "delete from share_pings" >/dev/null
sql -c "update tasks set title = 'T3GOAL' where id = 'a0000000-0000-0000-0000-000000000001'" >/dev/null
expect "A's write pings B, not A" "$B_ID" "$(sql -c "select string_agg(user_id::text, ',') from share_pings")"
sql -c "delete from share_pings" >/dev/null
sql -c "update tasks set title = 'PVPICK' where id = 'a0000000-0000-0000-0000-000000000004'" >/dev/null
expect "a write to something that stays Private pings nobody" "0" "$(sql -c "select count(*) from share_pings")"
api GET "$B_JWT" "/rest/v1/share_pings?select=user_id,at"
expect "B reads only their own ping row" "true" "$(jq -r 'length <= 1 and all(.[]; .user_id == "'"$B_ID"'")' <<<"$BODY")"

# ---------------------------------------------------------------------------------------------
section "pause: cuts both ways at once"
api PATCH "$A_JWT" "/rest/v1/circles?id=eq.$CIRCLE" "{\"paused_until\":\"$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)\"}"
expect "A pauses for an hour" "true" "$([ "$CODE" = 200 ] && echo true || echo "false($CODE $BODY)")"
day "$B_JWT" "$A_ID"; expect "B sees nothing of A while paused (and no blocks)" "null null" "$(jqe '[(.level|tostring), (.blocks|tostring)] | join(" ")')"
expect "…but is told it is a pause" "true" "$(jqe '(.paused_until != null) | tostring')"
day "$A_JWT" "$B_ID"; expect "A sees nothing of B either" "null" "$(jqe '.level | tostring')"
rpc "$B_JWT" share_connections; expect "B's connection says it is paused, not by B" "true false" "$(jqe '.[0] | [((.paused_until != null)|tostring), (.paused_by_me|tostring)] | join(" ")')"
sql -c "delete from share_pings" >/dev/null
sql -c "update tasks set title = 'T3GOAL' where id = 'a0000000-0000-0000-0000-000000000001'" >/dev/null
expect "while paused A's writes ping nobody" "0" "$(sql -c "select count(*) from share_pings")"
api PATCH "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE" '{"paused_until":null}'
expect "either side can resume (B)" "true" "$([ "$CODE" = 200 ] && echo true || echo "false($CODE)")"
day "$B_JWT" "$A_ID"; expect "resumed: B sees A again" "details" "$(jqe .level)"
api PATCH "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE" '{"paused_until":"2000-01-01T00:00:00Z"}'
day "$B_JWT" "$A_ID"; expect "a pause that has ended shows again at once" "details" "$(jqe .level)"
api PATCH "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE" '{"created_by":"'"$B_ID"'"}'
expect "a circle's owner column is not writable" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
api PATCH "$C_JWT" "/rest/v1/circles?id=eq.$CIRCLE" '{"paused_until":null}'
expect "C can't touch it" "[]" "$BODY"

# ---------------------------------------------------------------------------------------------
section "never shared: journal, health, people, AI chat"
SHARE_FNS=$(sql -c "select string_agg(p.oid::regprocedure::text, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'share\_%' or p.proname like 'shared\_%' or p.proname like 'circle%')")
info "sharing functions: $(tr ',' ' ' <<<"$SHARE_FNS" | wc -w)"
OTHER_TABLES=$(sql -c "select string_agg(tablename, '|') from pg_tables where schemaname = 'public' and tablename not in ('calendar_events', 'tasks', 'app_settings', 'areas') and tablename not like 'share%' and tablename not like 'circle%'")
LEAKY=$(sql -c "select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and (p.proname like 'share\_%' or p.proname like 'shared\_%' or p.proname like 'circle%') and pg_get_functiondef(p.oid) ~* '\m(from|join|into|update|table)[[:space:]]+(public\.)?($OTHER_TABLES)\M'")
expect "no sharing function's body names any table but calendar_events, tasks, app_settings, areas (0103: only an area's name, to pick the words 'At the gym' / 'In class') and its own" "" "$LEAKY"
expect "the one use of app_settings is the name and the zone" "display_name,timezone" "$(sql -c "select string_agg(distinct m[1], ',' order by m[1]) from pg_proc p join pg_namespace n on n.oid = p.pronamespace, regexp_matches(pg_get_functiondef(p.oid), 's\.(display_name|timezone)', 'g') m where n.nspname = 'public' and p.prokind = 'f' and (p.proname like 'share\_%' or p.proname like 'shared\_%')")"
NOCALL=$(grep -rIl -E "shared_day|share_day_data|share_connections|share_invite|share-view" "$ROOT/supabase/functions/mcp" "$ROOT/supabase/functions/chat" "$ROOT/supabase/functions/_shared/retrieval.ts" "$ROOT/supabase/functions/search" "$ROOT/supabase/functions/capture" 2>/dev/null | wc -l | tr -d ' ')
expect "chat, MCP, search and capture never call a sharing function" "0" "$NOCALL"
for t in journal_entries people interactions notes activity_log inbox_items captures routines books quotes app_settings; do
  api GET "$B_JWT" "/rest/v1/$t?user_id=eq.$A_ID&select=*"
  expect "B can't read A's $t" "closed" "$(closed)"
done
day "$B_JWT" "$A_ID"
expect "the answer holds no journal, person or note text at details" "0" "$(has ZZ)"

# ---------------------------------------------------------------------------------------------
section "the view link (no account): function share-view"
new_token() { printf 'kf_v_%s' "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"; }
sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
mklink() { # JWT level -> token on stdout
  local tok; tok=$(new_token)
  api POST "$1" "/rest/v1/share_links?select=id" "{\"token_hash\":\"$(sha "$tok")\",\"level\":\"$2\"}"
  case "$CODE" in 200|201) printf '%s' "$tok" ;; *) echo "share_links insert -> $CODE $BODY" >&2; return 1 ;; esac
}
view() { # token -> CODE, BODY
  local out; out=$(curl -sS -D "$TMP/h" -w '\n%{http_code}' "$F?t=$1"); CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
L_BUSY=$(mklink "$A_JWT" busy) || exit 2
L_TITLES=$(mklink "$A_JWT" titles) || exit 2
api POST "$A_JWT" "/rest/v1/share_links?select=id" "{\"token_hash\":\"$(sha "$(new_token)")\",\"level\":\"details\"}"
expect "Details is not offered on a link" "true" "$([ "$CODE" -ge 400 ] && echo true || echo "false($CODE)")"
api GET "$A_JWT" "/rest/v1/share_links?select=token_hash"
expect "the app can't read a hash back" "true" "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo true || echo "false($CODE)")"
expect "a link is stored as its SHA-256 only, 30 days" "t" "$(sql -c "select (token_hash = '$(sha "$L_BUSY")' and expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute') from share_links where level = 'busy' and user_id = '$A_ID'")"

view "nonsense"; expect "a malformed token" "401" "$CODE"
view "$(new_token)"; expect "a well-formed token nobody holds" "401" "$CODE"
view "kf_c_$(printf '%s' "$L_BUSY" | cut -c6-)"; expect "a calendar-link prefix is not a view link" "401" "$CODE"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$F?t=$L_BUSY"); expect "only GET" "405" "$code"

view "$L_BUSY"
expect "a Busy link answers" "200" "$CODE"
expect "the owner's name, zone, level, 8 days" "Kai Africa/Cairo busy 8" "$(jqe '[.name, .zone, .level, (.days | length | tostring)] | join(" ")')"
expect "no title, no kind, no Private word, no Top 3, no tasks, no notes" "0" "$(grep -c -E 'EVLECTURE|TKBLOCK|TBDEEPWORK|GCDENTIST|ICSPRAYER|RCGYM|PV[A-Z]+|T3[A-Z]+|TLDUE|NOTE|ZZ|"top3"|"tasks"|"title"|"kind"' <<<"$BODY")"
expect "…but today has blocks, as times only" "true" "$(jqe '[.days[].blocks[]] | length > 5 and all(.[]; (keys | sort) == ["all_day","ends_at","starts_at"])')"
view "$L_TITLES"
expect "a Titles link answers" "200 titles" "$CODE $(jqe .level)"
expect "titles of events, task blocks, Time blocks, Google and subscribed events" "5" "$(grep -o -E 'EVLECTURE|TKBLOCK|TBDEEPWORK|GCDENTIST|ICSPRAYER' <<<"$BODY" | sort -u | wc -l | tr -d ' ')"
expect "Private is Busy on a link too, trashed isn't there, nothing from the card or the other tables" "0" "$(grep -c -E 'PV[A-Z]+|TRTRASHED|T3[A-Z]+|TLDUE|NOTE|ZZ|"top3"|"tasks"|"kind"|"masked"' <<<"$BODY")"
expect "a repeat is plain occurrences: its rule is not on the page" "true 0" "$(echo "$(jqe '[.days[].blocks[] | select(.title == "RCGYM")] | length >= 1 | tostring') $(has RRULE)")"
expect "a call stamps last_used_at" "t" "$(sql -c "select last_used_at is not null from share_links where token_hash = '$(sha "$L_TITLES")'")"

# revoke, expire, renew, limit
LID=$(sql -c "select id from share_links where token_hash = '$(sha "$L_BUSY")'")
api PATCH "$A_JWT" "/rest/v1/share_links?id=eq.$LID&select=id" "{\"revoked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
view "$L_BUSY"; expect "Stop sharing: a revoked link is gone at once" "410 revoked" "$CODE $(jqe .reason)"
api PATCH "$A_JWT" "/rest/v1/share_links?id=eq.$LID&select=id" '{"revoked_at":null}'
view "$L_BUSY"; expect "…and it can be turned back on" "200" "$CODE"
sql -c "update share_links set expires_at = now() - interval '1 minute' where id = '$LID'" >/dev/null
view "$L_BUSY"; expect "after its 30 days it is gone" "410 expired" "$CODE $(jqe .reason)"
api PATCH "$A_JWT" "/rest/v1/share_links?id=eq.$LID&select=id" "{\"expires_at\":\"$(date -u -d '+400 days' +%Y-%m-%dT%H:%M:%SZ)\"}"
expect "Renew: one tap pushes it out, never past 30 days from now" "t" "$(sql -c "select expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute' from share_links where id = '$LID'")"
view "$L_BUSY"; expect "…and the link works again" "200" "$CODE"
# another user's link cannot be managed by A, and C's own link only ever shows C
api PATCH "$B_JWT" "/rest/v1/share_links?id=eq.$LID&select=id" '{"revoked_at":"2020-01-01T00:00:00Z"}'; expect "B can't stop A's link" "[]" "$BODY"
sql -c "update share_links set calls = 120, calls_hour = date_trunc('hour', now()) where id = '$LID'" >/dev/null
view "$L_BUSY"; expect "past 120 calls this hour" "429" "$CODE"
view "$L_TITLES"; expect "another link is not affected" "200" "$CODE"
# a link is independent of the connection: a pause or a leave never reaches it, and the answer never needs B
L_C=$(mklink "$C_JWT" busy) || exit 2
view "$L_C"; expect "C's link shows C's day only (empty), none of A's" "0" "$(grep -c -E 'EV|TK|PV|T3' <<<"$BODY")"

# ---------------------------------------------------------------------------------------------
section "leave: instant, nothing kept, the other side is told"
sql -c "delete from share_pings" >/dev/null
api DELETE "$B_JWT" "/rest/v1/circles?id=eq.$CIRCLE"
expect "B disconnects" "true" "$([ "$CODE" = 200 ] && echo true || echo "false($CODE $BODY)")"
day "$B_JWT" "$A_ID"; expect "B sees nothing of A at once" "null" "$(jqe '.level | tostring')"
day "$A_JWT" "$B_ID"; expect "A sees nothing of B at once" "null" "$(jqe '.level | tostring')"
expect "nothing is kept: no circle, member or grant left" "0 0 0" "$(sql -c "select concat_ws(' ', (select count(*) from circles), (select count(*) from circle_members), (select count(*) from share_grants))")"
expect "both sides were pinged, so both screens drop it" "2" "$(sql -c "select count(*) from share_pings where user_id in ('$A_ID','$B_ID')")"
rpc "$B_JWT" share_connections; expect "B's connections: empty" "[]" "$BODY"
view "$L_TITLES"; expect "a view link is not a connection: it still works" "200" "$CODE"

section "connecting again, and account deletion"
rpc "$A_JWT" share_invite_create '{"p_relation":"friend"}'; CODE_N=$(jqe .code)
rpc "$C_JWT" share_invite_accept "{\"p_code\":\"$CODE_N\",\"p_level\":\"busy\"}"
expect "Friend: accepter starts at Busy, the lane is off" "true busy busy false" "$(echo "$(jqe '.ok|tostring') $(sql -c "select string_agg(level, ' ' order by owner_id = '$C_ID') from share_grants") $(sql -c "select bool_or(show_lane)::text from circle_members")")"
rpc "$A_JWT" share_invite_create '{"p_relation":"friend"}'; CODE_M=$(jqe .code)
rpc "$C_JWT" share_invite_accept "{\"p_code\":\"$CODE_M\"}"
expect "the same two people can't connect twice" "false already_connected" "$(jqe '[.ok, .error] | map(tostring) | join(" ")')"
sql -c "delete from auth.users where id = '$C_ID'" >/dev/null
expect "deleting an account ends its connections, pending invites and links" "0 0 0 0" "$(sql -c "select concat_ws(' ', (select count(*) from circles), (select count(*) from circle_members), (select count(*) from share_grants), (select count(*) from share_links where user_id = '$C_ID'))")"
view "$L_C"; expect "…and its view link is gone" "401" "$CODE"
expect "the other side was pinged, the deleted one wasn't (no error)" "1" "$(sql -c "select count(*) from share_pings where user_id = '$A_ID'")"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E '^share-view:' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0 0 0" "$(sql -c "select concat_ws(' ', (select count(*) from tasks where user_id in ('$A_ID','$B_ID')), (select count(*) from calendar_events where user_id in ('$A_ID','$B_ID')), (select count(*) from share_links where user_id in ('$A_ID','$B_ID','$C_ID')), (select count(*) from share_invites where created_by in ('$A_ID','$B_ID','$C_ID')), (select count(*) from journal_entries where user_id = '$A_ID'))")"

if [ "$FAIL" != 0 ]; then echo; echo "-- share-view harness log (last 60 lines) --"; tail -60 "$TMP/harness.log"; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
