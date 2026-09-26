#!/usr/bin/env bash
# notify prunes dead push devices — and only them. `jsr:@negrel/webpush` throws PushMessageError
# with the push service's reply on `.response`; notify used to read `e.status` (always undefined),
# so a 404/410 never deleted anything.
# LOCAL Supabase stack only: refuses to run unless the API URL is 127.0.0.1/localhost.
#
#   supabase/tests/notify-prune.sh      (harness mode: notify under plain Deno via
#                                       supabase/tests/harness/runner.ts; the mock push service
#                                       answers per device from a status file)
#
# Needs deno (on PATH or $DENO), curl, jq, psql, node. FN_DIR overrides the functions directory the
# harness serves (default supabase/functions) — that is how the same checks were run against the
# pre-fix notify.
#
# Side effects: the accounts notify-prune-a@ / notify-prune-b@example.com (created on first run);
# their push_subscriptions are deleted, seeded and deleted again at the end. The service-role
# digest reaches every stored device on the stack; any device that isn't one of this script's
# lands at the mock as an unknown device and is answered 201, so it is never pruned.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DENO=${DENO:-deno}
FN_DIR=${FN_DIR:-$ROOT/supabase/functions}
export DENO_NO_UPDATE_CHECK=1

STATUS=$(cd "$ROOT" && npx supabase status -o env 2>/dev/null)
val() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\(.*\)\"$/\1/p" | head -1; }
API_URL=$(val API_URL)
ANON_KEY=$(val ANON_KEY)
SERVICE_ROLE_KEY=$(val SERVICE_ROLE_KEY)
DB_URL=$(val DB_URL)

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "refusing: API_URL '$API_URL' is not a local stack" >&2; exit 2 ;;
esac
[ -n "$ANON_KEY" ] && [ -n "$SERVICE_ROLE_KEY" ] && [ -n "$DB_URL" ] || { echo "could not read keys from supabase status" >&2; exit 2; }

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
info() { printf '  INFO  %s\n' "$1"; }
section() { printf '\n== %s\n' "$1"; }
expect() { if [ "$2" = "$3" ]; then ok "$1 -> $3"; else bad "$1 -> got '$3', want '$2'"; fi; }
sql() { psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; rm -rf "$TMP"; }
trap cleanup EXIT

wait_port() { # url
  for _ in $(seq 1 120); do curl -s -o /dev/null "$1" && return 0; sleep 0.5; done
  echo "timed out waiting for $1" >&2; return 1
}

# ---------------------------------------------------------------------------------------------
# Mock push service (answers per device from $STATUS_FILE) + notify under the harness.
# ---------------------------------------------------------------------------------------------
PUSH_PORT=${PUSH_PORT:-54397}
FN_PORT=${FN_PORT:-54396}
PUSH_LOG=$TMP/push.log; : > "$PUSH_LOG"
STATUS_FILE=$TMP/status.json; echo '{}' > "$STATUS_FILE"
MOCK_PUSH_STATUS=$STATUS_FILE node "$ROOT/supabase/tests/harness/mock-push.mjs" "$PUSH_PORT" 127.0.0.1 \
  np-a1,np-a2,np-a3,np-b1,np-b2 "$TMP/subs.json" "$PUSH_LOG" &
PIDS+=($!)
for _ in $(seq 1 40); do [ -s "$TMP/subs.json" ] && break; sleep 0.25; done

VAPID_KEYS=$("$DENO" run --no-lock --quiet "$ROOT/supabase/tests/harness/vapid.ts") || { echo "could not generate VAPID keys" >&2; exit 2; }
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY VAPID_KEYS=$VAPID_KEYS \
  HARNESS_PUSH_MOCK="http://127.0.0.1:$PUSH_PORT/push" \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$FN_DIR" "$FN_PORT" notify \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
wait_port "http://127.0.0.1:$FN_PORT/" || exit 2

# call TOKEN BODY -> sets CODE, BODY
call() {
  BODY=$(curl -sS -o - -w '\n%{http_code}' -X POST "http://127.0.0.1:$FN_PORT/notify" \
    -H "Authorization: Bearer $1" -H 'Content-Type: application/json' --data "$2")
  CODE=${BODY##*$'\n'}
  BODY=${BODY%$'\n'*}
}

# ---------------------------------------------------------------------------------------------
# Test accounts and devices. A: np-a1 (FCM), np-a2 (Mozilla), np-a3 (Apple); B: np-b1, np-b2.
# ---------------------------------------------------------------------------------------------
PASSWORD='notify-prune-local-only-password'
sign_in() { # email -> JSON
  local out
  out=$(curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}")
  if [ "$(printf '%s' "$out" | jq -r '.access_token // empty')" = "" ]; then
    curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
      -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
    out=$(curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
      -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}")
  fi
  printf '%s' "$out"
}
A_JSON=$(sign_in notify-prune-a@example.com)
B_JSON=$(sign_in notify-prune-b@example.com)
A_TOKEN=$(printf '%s' "$A_JSON" | jq -r .access_token); A_ID=$(printf '%s' "$A_JSON" | jq -r .user.id)
B_ID=$(printf '%s' "$B_JSON" | jq -r .user.id)
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign in test users" >&2; exit 2; }

SUBS=$(cat "$TMP/subs.json")
sub_keys() { printf '%s' "$SUBS" | jq -c ".\"$1\""; }
seed() {
  sql -v a="$A_ID" -v b="$B_ID" -v ka1="$(sub_keys np-a1)" -v ka2="$(sub_keys np-a2)" -v ka3="$(sub_keys np-a3)" \
    -v kb1="$(sub_keys np-b1)" -v kb2="$(sub_keys np-b2)" <<'SQL' >/dev/null
delete from push_subscriptions where user_id in (:'a', :'b');
insert into push_subscriptions (user_id, endpoint, keys, device_label) values
  (:'a', 'https://fcm.googleapis.com/fcm/send/notify-prune/np-a1', (:'ka1')::jsonb, 'np-a1'),
  (:'a', 'https://updates.push.services.mozilla.com/wpush/v2/notify-prune/np-a2', (:'ka2')::jsonb, 'np-a2'),
  (:'a', 'https://web.push.apple.com/notify-prune/np-a3', (:'ka3')::jsonb, 'np-a3'),
  (:'b', 'https://fcm.googleapis.com/fcm/send/notify-prune/np-b1', (:'kb1')::jsonb, 'np-b1'),
  (:'b', 'https://wns2-np.notify.windows.com/w/notify-prune/np-b2', (:'kb2')::jsonb, 'np-b2');
SQL
}
# Every row in the table (not just ours), as "id label" lines — so "nothing else was deleted" is
# checked against the whole of push_subscriptions.
snapshot() { sql -c "select id || ' ' || coalesce(device_label, '-') from push_subscriptions" | LC_ALL=C sort > "$1"; }
gone_labels() { LC_ALL=C comm -23 "$1" "$2" | cut -d' ' -f2 | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//'; }
our_labels() { sql -c "select string_agg(device_label, ' ' order by device_label) from push_subscriptions where user_id in ('$A_ID', '$B_ID')"; }
answered() { jq -r 'select(.device | startswith("np-")) | "\(.device)=\(.status)"' "$PUSH_LOG" | sort | tr '\n' ' ' | sed 's/ $//'; }

section "setup"
info "harness: notify from $FN_DIR on :$FN_PORT, push mock :$PUSH_PORT"
info "users: A=$A_ID  B=$B_ID"

# ---------------------------------------------------------------------------------------------
section "user path (A sends a test push, runs as A under RLS): one device answers 410"
seed
echo '{"np-a2":410,"np-a3":500}' > "$STATUS_FILE"
snapshot "$TMP/before1"
info "rows in push_subscriptions before: $(wc -l < "$TMP/before1" | tr -d ' ') (ours: $(our_labels))"
: > "$PUSH_LOG"
call "$A_TOKEN" '{"kind":"test"}'
expect "A test: status" 200 "$CODE"
expect "mock answered" "np-a1=201 np-a2=410 np-a3=500" "$(answered)"
expect "A test: attempted/sent/pruned" "3/1/1" "$(printf '%s' "$BODY" | jq -r '"\(.attempted)/\(.sent)/\(.pruned)"')"
snapshot "$TMP/after1"
expect "rows deleted from the whole table" "np-a2" "$(gone_labels "$TMP/before1" "$TMP/after1")"
expect "a 500 is not a prune: np-a3 kept; B untouched" "np-a1 np-a3 np-b1 np-b2" "$(our_labels)"

# ---------------------------------------------------------------------------------------------
section "cron path (service role, morning_digest): each user's gone device, nothing else"
seed
echo '{"np-a3":404,"np-b2":410}' > "$STATUS_FILE"
snapshot "$TMP/before2"
info "rows in push_subscriptions before: $(wc -l < "$TMP/before2" | tr -d ' ') (ours: $(our_labels))"
: > "$PUSH_LOG"
call "$SERVICE_ROLE_KEY" '{"kind":"morning_digest"}'
expect "digest: status" 200 "$CODE"
expect "mock answered" "np-a1=201 np-a2=201 np-a3=404 np-b1=201 np-b2=410" "$(answered)"
expect "digest: per-user attempted/sent/pruned" "A 3/2/1;B 2/1/1" \
  "$(printf '%s' "$BODY" | jq -r --arg a "$A_ID" --arg b "$B_ID" \
      '[.users[] | select(.user_id == $a or .user_id == $b)] | sort_by(.user_id != $a)
       | map((if .user_id == $a then "A" else "B" end) + " \(.attempted)/\(.sent)/\(.pruned)") | join(";")')"
expect "digest: top-level pruned counts only these two" 2 "$(printf '%s' "$BODY" | jq -r .pruned)"
snapshot "$TMP/after2"
expect "rows deleted from the whole table" "np-a3 np-b2" "$(gone_labels "$TMP/before2" "$TMP/after2")"
expect "what's left of ours" "np-a1 np-a2 np-b1" "$(our_labels)"

sql -c "delete from push_subscriptions where user_id in ('$A_ID', '$B_ID')" >/dev/null
expect "cleanup: none of our rows left" 0 "$(sql -c "select count(*) from push_subscriptions where user_id in ('$A_ID', '$B_ID')")"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
