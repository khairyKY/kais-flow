#!/usr/bin/env bash
# SEC-2 integration checks — follow-ups from the 2026-09-26 security review (migration 0036):
#   1. per-user daily AI allowance on chat / transcribe / parse-capture (ai_usage, ai_usage_bump)
#   2. requireUser rejects anonymous users
#   3. notify only POSTs to known Web Push services; push_subscriptions endpoint check constraint
#   4. slipping view owner filters — same rows as before for every account under RLS
# LOCAL Supabase stack only: refuses to run unless the API URL is 127.0.0.1/localhost.
#
#   supabase/tests/sec2.sh      (always harness mode: functions under plain Deno via
#                               supabase/tests/harness/runner.ts — no gateway, no Docker changes)
#
# Needs deno (on PATH or $DENO), curl, jq, psql, node. Groq is never contacted: the harness stubs
# api.groq.com (HARNESS_GROQ_STUB=1) and logs every outbound fetch, so "no Groq call" is checked,
# not assumed. The functions run with small limits: AI_DAILY_LIMIT_CHAT=2, _PARSE=3, _STT=2.
#
# Side effects, all limited to the test accounts sec2-a@ / sec2-b@ / sec2-anon@example.com
# (created on first run): their ai_usage, push_subscriptions, domains, projects, areas, tasks and
# activity_log rows are deleted and re-seeded, and deleted again at the end.
#   - Anonymous sign-ins are off locally, so an anonymous user is simulated by setting
#     auth.users.is_anonymous = true on sec2-anon (reset to false at the start and the end).
#   - The hostile push endpoints are seeded the way a pre-0036 row exists in production: in ONE
#     transaction the 0036 check constraint is dropped, the rows inserted and the constraint re-added
#     from its own pg_get_constraintdef() — NOT VALID, exactly as 0036 leaves it. The script then
#     asserts the constraint is byte-identical to before.
#   - The slipping old-vs-new comparisons and the cross-account activity row run in rolled-back
#     transactions, except one foreign activity_log row (owned by sec2-b) that the end-to-end
#     digest check needs; it is deleted at the end.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DENO=${DENO:-deno}
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

PASS=0; FAIL=0; SKIP=0
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
# Mock push service + functions under the harness.
# ---------------------------------------------------------------------------------------------
PUSH_PORT=${PUSH_PORT:-54395}
FN_PORT=${FN_PORT:-54393}
BROKEN_PORT=${BROKEN_PORT:-54394}
PUSH_LOG=$TMP/push.log; : > "$PUSH_LOG"
FETCH_LOG=$TMP/fetch.log; : > "$FETCH_LOG"
BROKEN_FETCH_LOG=$TMP/fetch-broken.log; : > "$BROKEN_FETCH_LOG"
node "$ROOT/supabase/tests/harness/mock-push.mjs" "$PUSH_PORT" 127.0.0.1 a1,a2,a3,a4,b1 "$TMP/subs.json" "$PUSH_LOG" &
PIDS+=($!)
for _ in $(seq 1 40); do [ -s "$TMP/subs.json" ] && break; sleep 0.25; done

VAPID_KEYS=$("$DENO" run --no-lock --quiet "$ROOT/supabase/tests/harness/vapid.ts") || { echo "could not generate VAPID keys" >&2; exit 2; }
run_harness() { # port service_role_key fetch_log names...
  local port=$1 key=$2 log=$3; shift 3
  SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$key VAPID_KEYS=$VAPID_KEYS \
    AI_DAILY_LIMIT_CHAT=2 AI_DAILY_LIMIT_PARSE=3 AI_DAILY_LIMIT_STT=2 \
    HARNESS_PUSH_MOCK="http://127.0.0.1:$PUSH_PORT/push" HARNESS_FETCH_LOG=$log HARNESS_GROQ_STUB=1 \
    "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-write="$TMP" \
    --allow-net=127.0.0.1,localhost \
    "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$port" "$@" \
    > "$TMP/harness-$port.log" 2>&1 &
  PIDS+=($!)
}
run_harness "$FN_PORT" "$SERVICE_ROLE_KEY" "$FETCH_LOG" transcribe parse-capture chat search notify
# Same code, but the service-role key PostgREST sees is not a valid key: the allowance check
# itself fails ('unavailable'), which is how a database outage reaches the functions.
run_harness "$BROKEN_PORT" "not-a-valid-service-role-key" "$BROKEN_FETCH_LOG" transcribe parse-capture chat
wait_port "http://127.0.0.1:$FN_PORT/" && wait_port "http://127.0.0.1:$BROKEN_PORT/" || exit 2

# call PORT FN TOKEN BODY [curl args...] -> sets CODE, BODY, HDRS
call_at() {
  local port=$1 fn=$2 token=$3 body=$4; shift 4
  local auth=()
  [ -n "$token" ] && auth=(-H "Authorization: Bearer $token")
  : > "$TMP/hdrs"
  BODY=$(curl -sS -D "$TMP/hdrs" -o - -w '\n%{http_code}' -X POST "http://127.0.0.1:$port/$fn" "${auth[@]}" \
    -H 'Content-Type: application/json' --data "$body" "$@")
  CODE=${BODY##*$'\n'}
  BODY=${BODY%$'\n'*}
  HDRS=$(tr -d '\r' < "$TMP/hdrs")
}
call() { call_at "$FN_PORT" "$@"; }
audio_at() { # port token
  local port=$1 token=$2 auth=()
  [ -n "$token" ] && auth=(-H "Authorization: Bearer $token")
  printf 'not really webm' > "$TMP/clip.webm"
  BODY=$(curl -sS -o - -w '\n%{http_code}' -X POST "http://127.0.0.1:$port/transcribe" "${auth[@]}" -F "audio=@$TMP/clip.webm")
  CODE=${BODY##*$'\n'}
  BODY=${BODY%$'\n'*}
}
PARSE_BODY='{"raw_text":"buy milk tomorrow","context":{"domains":[],"projects":[],"today":"2026-09-26","timezone":"Africa/Cairo"}}'
CHAT_BODY='{"messages":[{"role":"user","content":"sec2zebra"}]}'
# kind token -> one Groq-backed call against the main harness
ai_call() {
  case $1 in
    parse) call parse-capture "$2" "$PARSE_BODY" ;;
    chat) call chat "$2" "$CHAT_BODY" ;;
    stt) audio_at "$FN_PORT" "$2" ;;
  esac
}
groq_calls() { grep -c '"url":"https://api.groq.com' "${1:-$FETCH_LOG}" | tr -d ' '; }
short() { printf '%s' "$1" | tr -d '\n' | cut -c1-120; }

# ---------------------------------------------------------------------------------------------
# Test accounts.
# ---------------------------------------------------------------------------------------------
PASSWORD='sec2-local-only-password'
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
sql -c "update auth.users set is_anonymous = false where email = 'sec2-anon@example.com'" >/dev/null
A_JSON=$(sign_in sec2-a@example.com)
B_JSON=$(sign_in sec2-b@example.com)
C_JSON=$(sign_in sec2-anon@example.com)
A_TOKEN=$(printf '%s' "$A_JSON" | jq -r .access_token); A_ID=$(printf '%s' "$A_JSON" | jq -r .user.id)
B_TOKEN=$(printf '%s' "$B_JSON" | jq -r .access_token); B_ID=$(printf '%s' "$B_JSON" | jq -r .user.id)
C_TOKEN=$(printf '%s' "$C_JSON" | jq -r .access_token); C_ID=$(printf '%s' "$C_JSON" | jq -r .user.id)
for id in "$A_ID" "$B_ID" "$C_ID"; do
  [ -n "$id" ] && [ "$id" != null ] || { echo "could not sign in test users" >&2; exit 2; }
done
IDS="'$A_ID','$B_ID','$C_ID'"

wipe() {
  sql <<SQL >/dev/null
delete from ai_usage where user_id in ($IDS);
delete from push_subscriptions where user_id in ($IDS);
delete from activity_log where user_id in ($IDS);
delete from tasks where user_id in ($IDS);
delete from areas where user_id in ($IDS);
delete from projects where user_id in ($IDS);
delete from domains where user_id in ($IDS);
SQL
}
wipe

section "setup"
info "harness: functions=http://127.0.0.1:$FN_PORT/<fn> (quota broken: :$BROKEN_PORT)  push mock=:$PUSH_PORT"
info "users: A=$A_ID  B=$B_ID  anon-candidate C=$C_ID"
info "clock: $(sql -F ' ' -c "select 'utc now=' || to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI'), 'cairo now=' || to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI')")"
CAIRO_TODAY=$(sql -c "select (now() at time zone 'Africa/Cairo')::date")

# =============================================================================================
section "1 — daily AI allowance: N allowed, then 429 daily_limit before any Groq call"
# Yesterday (Cairo) A was far over every limit. That must not count today.
sql -v a="$A_ID" <<'SQL' >/dev/null
insert into ai_usage (user_id, day, kind, count)
select :'a', (now() at time zone 'Africa/Cairo')::date - 1, k, 999 from unnest(array['chat','parse','stt']) k;
SQL
info "seeded: A has count=999 for chat/parse/stt on $(sql -c "select (now() at time zone 'Africa/Cairo')::date - 1") (Cairo yesterday)"

check_kind() { # kind limit
  local kind=$1 limit=$2 i codes=""
  : > "$FETCH_LOG"
  for i in $(seq 1 "$limit"); do ai_call "$kind" "$A_TOKEN"; codes="$codes$CODE "; done
  expect "A $kind: first $limit calls today" "$(printf '200 %.0s' $(seq 1 "$limit"))" "$codes"
  expect "A $kind: Groq reached once per allowed call" "$limit" "$(groq_calls)"
  : > "$FETCH_LOG"
  ai_call "$kind" "$A_TOKEN"
  expect "A $kind: call $((limit + 1)) status" 429 "$CODE"
  expect "A $kind: call $((limit + 1)) body" '{"error":"daily_limit"}' "$BODY"
  expect "A $kind: call $((limit + 1)) made no Groq call" 0 "$(groq_calls)"
}
check_kind parse 3
info "parse-capture 200 body: $(call parse-capture "$B_TOKEN" "$PARSE_BODY"; short "$BODY")"   # (B's first parse)
check_kind chat 2
check_kind stt 2

: > "$FETCH_LOG"
ai_call parse "$A_TOKEN"; expect "A parse still over after the other kinds ran" 429 "$CODE"
expect "A parse over: still no Groq call" 0 "$(groq_calls)"

section "1 — per user: B is unaffected by A"
ai_call chat "$B_TOKEN"; expect "B chat" 200 "$CODE"
ai_call stt "$B_TOKEN";  expect "B stt" 200 "$CODE"
ai_call parse "$B_TOKEN"; expect "B parse (2nd today)" 200 "$CODE"
expect "ai_usage today (Cairo $CAIRO_TODAY)" \
  "A chat=3;A parse=5;A stt=3;B chat=1;B parse=2;B stt=1" \
  "$(sql -c "select string_agg(case user_id when '$A_ID' then 'A' else 'B' end || ' ' || kind || '=' || count, ';' order by user_id = '$B_ID', kind) from ai_usage where user_id in ('$A_ID','$B_ID') and day = (now() at time zone 'Africa/Cairo')::date")"
expect "A's yesterday rows untouched" "chat=999;parse=999;stt=999" \
  "$(sql -c "select string_agg(kind || '=' || count, ';' order by kind) from ai_usage where user_id = '$A_ID' and day = (now() at time zone 'Africa/Cairo')::date - 1")"
expect "every row written today is dated with the Cairo date" "$CAIRO_TODAY" \
  "$(sql -c "select string_agg(distinct day::text, ',') from ai_usage where user_id in ('$A_ID','$B_ID') and created_at > now() - interval '10 minutes' and count < 999")"

section "1 — a new Cairo day starts from zero"
# Midnight in Cairo, simulated: today's rows become yesterday's.
sql -v a="$A_ID" <<'SQL' >/dev/null
delete from ai_usage where user_id = :'a' and day < (now() at time zone 'Africa/Cairo')::date;
update ai_usage set day = day - 1 where user_id = :'a';
SQL
for kind in parse chat stt; do
  : > "$FETCH_LOG"
  ai_call "$kind" "$A_TOKEN"
  expect "A $kind after the day rolls over" 200 "$CODE"
done
expect "A today after rollover" "chat=1;parse=1;stt=1" \
  "$(sql -c "select string_agg(kind || '=' || count, ';' order by kind) from ai_usage where user_id = '$A_ID' and day = (now() at time zone 'Africa/Cairo')::date")"

section "1 — the 429 is readable by the web app (CORS) and says nothing else"
for i in 1 2; do ai_call chat "$A_TOKEN"; done   # A chat: 2 of 2 used, then over
call chat "$A_TOKEN" "$CHAT_BODY" -H 'Origin: http://localhost:5173'
expect "over-limit chat from an allowed origin: status" 429 "$CODE"
expect "over-limit chat: ACAO" "http://localhost:5173" "$(printf '%s\n' "$HDRS" | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: //p')"
expect "over-limit chat: content type" "application/json" "$(printf '%s\n' "$HDRS" | sed -n 's/^[Cc]ontent-[Tt]ype: //p')"

section "1 — if the allowance check itself fails: parse fails open, chat + transcribe fail closed"
: > "$BROKEN_FETCH_LOG"
call_at "$BROKEN_PORT" parse-capture "$B_TOKEN" "$PARSE_BODY"
expect "parse-capture, check unavailable: still parses" 200 "$CODE"
expect "parse-capture, check unavailable: Groq was called" 1 "$(groq_calls "$BROKEN_FETCH_LOG")"
: > "$BROKEN_FETCH_LOG"
call_at "$BROKEN_PORT" chat "$B_TOKEN" "$CHAT_BODY"
expect "chat, check unavailable" "503 {\"error\":\"allowance unavailable\"}" "$CODE $BODY"
audio_at "$BROKEN_PORT" "$B_TOKEN"
expect "transcribe, check unavailable" "503 {\"error\":\"allowance unavailable\"}" "$CODE $BODY"
expect "chat + transcribe, check unavailable: no Groq call" 0 "$(groq_calls "$BROKEN_FETCH_LOG")"
if grep -q "ai allowance check failed" "$TMP/harness-$BROKEN_PORT.log"; then ok "the failed check is logged by the function"; else bad "no log line for the failed check"; fi

section "1 — nobody but the service role can touch the counter"
rest() { # method path token [data]
  local data=()
  [ -n "${4:-}" ] && data=(--data "$4")
  curl -sS -o "$TMP/rest.out" -w '%{http_code}' -X "$1" "$API_URL/rest/v1/$2" -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $3" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    "${data[@]}"
}
code=$(rest POST rpc/ai_usage_bump "$A_TOKEN" "{\"p_user_id\":\"$A_ID\",\"p_kind\":\"chat\"}")
if [ "$code" != 200 ]; then ok "A calls rpc/ai_usage_bump -> $code"; else bad "A could call rpc/ai_usage_bump"; fi
code=$(rest POST rpc/ai_usage_bump "$ANON_KEY" "{\"p_user_id\":\"$A_ID\",\"p_kind\":\"chat\"}")
if [ "$code" != 200 ]; then ok "anon key calls rpc/ai_usage_bump -> $code"; else bad "anon key could call rpc/ai_usage_bump"; fi
before=$(sql -c "select string_agg(kind || '=' || count, ';' order by kind) from ai_usage where user_id = '$A_ID' and day = (now() at time zone 'Africa/Cairo')::date")
code=$(rest PATCH "ai_usage?user_id=eq.$A_ID" "$A_TOKEN" '{"count":0}')
if [ "$code" != 200 ] && [ "$code" != 204 ]; then ok "A resets own count via PATCH -> $code"; else bad "A PATCH ai_usage -> $code"; fi
code=$(rest DELETE "ai_usage?user_id=eq.$A_ID" "$A_TOKEN")
if [ "$code" != 200 ] && [ "$code" != 204 ]; then ok "A deletes own rows -> $code"; else bad "A DELETE ai_usage -> $code"; fi
code=$(rest POST ai_usage "$A_TOKEN" "{\"day\":\"2030-01-01\",\"kind\":\"chat\",\"count\":0}")
if [ "$code" != 201 ]; then ok "A inserts a row -> $code"; else bad "A INSERT ai_usage -> $code"; fi
expect "A's counters unchanged by all of that" "$before" \
  "$(sql -c "select string_agg(kind || '=' || count, ';' order by kind) from ai_usage where user_id = '$A_ID' and day = (now() at time zone 'Africa/Cairo')::date")"
code=$(rest GET "ai_usage?select=user_id" "$A_TOKEN")
expect "A reads ai_usage: status" 200 "$code"
expect "A reads ai_usage: only own rows" "$A_ID" "$(jq -r '[.[].user_id] | unique | join(",")' "$TMP/rest.out")"
expect "ai_usage_bump: definer, search_path pinned; execute anon/authenticated/service_role" \
  't|{"search_path=public, pg_temp"}|f|f|t' \
  "$(sql -F '|' -c "select p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('service_role', p.oid, 'execute') from pg_proc p where p.oid = 'public.ai_usage_bump(uuid,text)'::regprocedure")"
expect "no EXECUTE for PUBLIC" 0 \
  "$(sql -c "select count(*) from pg_proc, aclexplode(proacl) a where oid = 'public.ai_usage_bump(uuid,text)'::regprocedure and a.grantee = 0")"

# =============================================================================================
section "2 — anonymous users are rejected"
call search "$C_TOKEN" '{"query":"sec2zebra"}'; expect "control: C (normal account) search" 200 "$CODE"
sql -c "update auth.users set is_anonymous = true where id = '$C_ID'" >/dev/null
info "C flagged is_anonymous = true (anonymous sign-ins are off locally; this is the row an anonymous sign-in creates)"
expect "auth server reports C as anonymous" true \
  "$(curl -sS "$API_URL/auth/v1/user" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $C_TOKEN" | jq -r .is_anonymous)"
call search "$C_TOKEN" '{"query":"sec2zebra"}';        expect "anonymous C  search" "401 {\"error\":\"unauthorized\"}" "$CODE $BODY"
call parse-capture "$C_TOKEN" "$PARSE_BODY";          expect "anonymous C  parse-capture" 401 "$CODE"
call chat "$C_TOKEN" "$CHAT_BODY";                    expect "anonymous C  chat" 401 "$CODE"
audio_at "$FN_PORT" "$C_TOKEN";                       expect "anonymous C  transcribe" 401 "$CODE"
call notify "$C_TOKEN" '{"kind":"test"}';             expect "anonymous C  notify test" 401 "$CODE"
expect "anonymous C never reached the allowance counter" 0 "$(sql -c "select count(*) from ai_usage where user_id = '$C_ID'")"
sql -c "update auth.users set is_anonymous = false where id = '$C_ID'" >/dev/null
call search "$C_TOKEN" '{"query":"sec2zebra"}'; expect "C un-flagged: search again" 200 "$CODE"

# =============================================================================================
section "3 — push_subscriptions only admits known push services (0036 check constraint)"
SUBS=$(cat "$TMP/subs.json")
sub_keys() { printf '%s' "$SUBS" | jq -c ".$1"; }
CONSTRAINT_DEF=$(sql -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'push_subscriptions_endpoint_known_service' and conrelid = 'public.push_subscriptions'::regclass")
expect "constraint is NOT VALID (pre-0036 rows unchecked)" f \
  "$(sql -c "select convalidated from pg_constraint where conname = 'push_subscriptions_endpoint_known_service'")"
rest_sub() { # token endpoint
  rest POST push_subscriptions "$1" "{\"id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"endpoint\":\"$2\",\"keys\":{\"p256dh\":\"x\",\"auth\":\"y\"},\"device_label\":\"sec2 probe\"}"
}
for ep in "http://127.0.0.1:$PUSH_PORT/push/evil" "https://fcm.googleapis.com.evil.example/fcm/send/x" "https://169.254.169.254/latest/meta-data/"; do
  code=$(rest_sub "$A_TOKEN" "$ep")
  expect "A stores $ep" "400 23514" "$code $(jq -r .code "$TMP/rest.out")"
done
code=$(rest_sub "$A_TOKEN" "https://fcm.googleapis.com/fcm/send/sec2-probe")
expect "A stores a real FCM endpoint" 201 "$code"
sql -c "delete from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/sec2-probe'" >/dev/null

section "3 — the allowlist, notify's TS check vs the constraint (same cases)"
cat > "$TMP/cases.txt" <<CASES
https://fcm.googleapis.com/fcm/send/abc|t|t
https://updates.push.services.mozilla.com/wpush/v2/abc|t|t
https://web.push.apple.com/QGx|t|t
https://wns2-db5p.notify.windows.com/w/?token=abc|t|t
https://a.b.notify.windows.com/x|t|t
HTTPS://FCM.GOOGLEAPIS.COM/fcm/send/abc|t|t
https://push.apple.com/x|f|f
https://evilpush.apple.com/x|f|f
https://-x.push.apple.com/x|f|f
https://notify.windows.com/x|f|f
https://fcm.googleapis.com.evil.example/x|f|f
https://web.push.apple.com.evil.example/x|f|f
https://evil.example/fcm.googleapis.com/|f|f
https://evil.example/?u=https://fcm.googleapis.com/|f|f
http://fcm.googleapis.com/fcm/send/abc|f|f
https://fcm.googleapis.com:8443/fcm/send/abc|f|f
https://user@fcm.googleapis.com/fcm/send/abc|f|f
https://user:pw@fcm.googleapis.com/fcm/send/abc|f|f
https://fcm.googleapis.com@evil.example/x|f|f
https://169.254.169.254/latest/meta-data/|f|f
http://127.0.0.1:$PUSH_PORT/push/x|f|f
https://[::1]/x|f|f
https://localhost/x|f|f
not a url|f|f
https://fcm.googleapis.com:443/fcm/send/abc|t|f
https://fcm.googleapis.com|t|f
CASES
cat > "$TMP/ts-verdicts.ts" <<TS
import { isKnownPushEndpoint } from 'file://$ROOT/supabase/functions/notify/push-endpoint.ts'
for (const line of (await Deno.readTextFile('$TMP/cases.txt')).split('\n').filter(Boolean)) {
  console.log(isKnownPushEndpoint(line.split('|')[0]) ? 't' : 'f')
}
TS
TS_VERDICTS=$("$DENO" run --no-lock --quiet --allow-read="$TMP" "$TMP/ts-verdicts.ts")
SQL_VERDICTS=$( { echo "begin;"
  echo "create temp table chk (endpoint text);"
  echo "alter table chk add constraint c $(printf '%s' "$CONSTRAINT_DEF" | sed 's/ NOT VALID$//');"
  echo "create function pg_temp.accepts(e text) returns text language plpgsql as \$\$ begin insert into pg_temp.chk values (e); return 't'; exception when check_violation then return 'f'; end \$\$;"
  echo "create temp table cases (n serial, endpoint text);"
  echo "copy cases (endpoint) from stdin;"
  cut -d'|' -f1 "$TMP/cases.txt"
  echo '\.'
  echo "select pg_temp.accepts(endpoint) from cases order by n;"
  echo "rollback;"; } | sql)
paste -d'|' "$TMP/cases.txt" <(printf '%s\n' "$TS_VERDICTS") <(printf '%s\n' "$SQL_VERDICTS") > "$TMP/verdicts.txt"
while IFS='|' read -r ep want_ts want_sql got_ts got_sql; do
  if [ "$got_ts" = "$want_ts" ] && [ "$got_sql" = "$want_sql" ]; then ok "ts=$got_ts sql=$got_sql  $ep"
  else bad "ts=$got_ts (want $want_ts) sql=$got_sql (want $want_sql)  $ep"; fi
done < "$TMP/verdicts.txt"
expect "nothing the constraint admits is refused by notify (sql ⊆ ts)" 0 "$(awk -F'|' '$5 == "t" && $4 != "t"' "$TMP/verdicts.txt" | wc -l | tr -d ' ')"

section "3 — notify never contacts a stored endpoint off the list"
# A: four real-service devices (FCM, Mozilla, Apple, WNS) + eight hostile rows as pre-0036 legacy
# rows; B: one FCM device. The harness routes the four real hosts to the mock push service.
sql -v a="$A_ID" -v b="$B_ID" -v port="$PUSH_PORT" -v def="$CONSTRAINT_DEF" \
  -v ka1="$(sub_keys a1)" -v ka2="$(sub_keys a2)" -v ka3="$(sub_keys a3)" -v ka4="$(sub_keys a4)" -v kb1="$(sub_keys b1)" <<'SQL' >/dev/null
insert into push_subscriptions (user_id, endpoint, keys, device_label) values
  (:'a', 'https://fcm.googleapis.com/fcm/send/sec2/a1', (:'ka1')::jsonb, 'sec2 a1 fcm'),
  (:'a', 'https://updates.push.services.mozilla.com/wpush/v2/sec2/a2', (:'ka2')::jsonb, 'sec2 a2 mozilla'),
  (:'a', 'https://web.push.apple.com/sec2/a3', (:'ka3')::jsonb, 'sec2 a3 apple'),
  (:'a', 'https://wns2-sec2.notify.windows.com/w/a4', (:'ka4')::jsonb, 'sec2 a4 wns'),
  (:'b', 'https://fcm.googleapis.com/fcm/send/sec2/b1', (:'kb1')::jsonb, 'sec2 b1 fcm');
begin;
alter table push_subscriptions drop constraint push_subscriptions_endpoint_known_service;
insert into push_subscriptions (user_id, endpoint, keys, device_label) values
  (:'a', 'http://127.0.0.1:' || :'port' || '/push/evil1', (:'ka1')::jsonb, 'sec2 hostile loopback'),
  (:'a', 'https://fcm.googleapis.com.evil.example/fcm/send/evil2', (:'ka1')::jsonb, 'sec2 hostile suffix'),
  (:'a', 'https://evil.example/fcm.googleapis.com/evil3', (:'ka1')::jsonb, 'sec2 hostile path'),
  (:'a', 'https://169.254.169.254/latest/meta-data/evil4', (:'ka1')::jsonb, 'sec2 hostile metadata'),
  (:'a', 'http://fcm.googleapis.com/fcm/send/evil5', (:'ka1')::jsonb, 'sec2 hostile http'),
  (:'a', 'https://evilpush.apple.com/evil6', (:'ka1')::jsonb, 'sec2 hostile lookalike'),
  (:'a', 'https://user@fcm.googleapis.com/fcm/send/evil7', (:'ka1')::jsonb, 'sec2 hostile userinfo'),
  (:'a', 'https://fcm.googleapis.com:8443/fcm/send/evil8', (:'ka1')::jsonb, 'sec2 hostile port');
alter table push_subscriptions add constraint push_subscriptions_endpoint_known_service :def;
commit;
SQL
expect "constraint restored byte-identical" "$CONSTRAINT_DEF" \
  "$(sql -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'push_subscriptions_endpoint_known_service' and conrelid = 'public.push_subscriptions'::regclass")"
expect "A's rows: 4 on push services + 8 legacy hostile" "12 8" \
  "$(sql -F ' ' -c "select count(*), count(*) filter (where device_label like 'sec2 hostile%') from push_subscriptions where user_id = '$A_ID'")"

push_devices() { jq -r .device "$PUSH_LOG" | sort | tr '\n' ' ' | sed 's/ $//'; }
fetched_hosts() { jq -r '.url' "$FETCH_LOG" | sed -E 's#^[a-z]+://([^/]*).*#\1#' | sort -u | tr '\n' ' ' | sed 's/ $//'; }
: > "$PUSH_LOG"; : > "$FETCH_LOG"
call notify "$A_TOKEN" '{"kind":"test"}'
expect "A test: status" 200 "$CODE"
expect "A test: attempted/sent/skipped_endpoints" "4/4/8" "$(printf '%s' "$BODY" | jq -r '"\(.attempted)/\(.sent)/\(.skipped_endpoints)"')"
expect "A test: devices that received a push" "a1 a2 a3 a4" "$(push_devices)"
expect "A test: every push decrypted with its device's keys" 0 "$(jq -r 'select(.error != null)' "$PUSH_LOG" | wc -l | tr -d ' ')"
expect "A test: the only hosts contacted" \
  "fcm.googleapis.com updates.push.services.mozilla.com web.push.apple.com wns2-sec2.notify.windows.com" "$(fetched_hosts)"
if grep -q "skipped 8 endpoint(s)" "$TMP/harness-$FN_PORT.log"; then ok "notify logged the skip (by host, not endpoint)"; else bad "no skip log line"; fi
if grep -q "evil[0-9]" "$TMP/harness-$FN_PORT.log"; then bad "a hostile endpoint path reached the log"; else ok "no endpoint path in the log"; fi

: > "$PUSH_LOG"; : > "$FETCH_LOG"
call notify "$SERVICE_ROLE_KEY" '{"kind":"morning_digest"}'
expect "service-role digest: status" 200 "$CODE"
expect "service-role digest: A and B attempted/sent/skipped_endpoints" "A 4/4/8;B 1/1/0" \
  "$(printf '%s' "$BODY" | jq -r --arg a "$A_ID" --arg b "$B_ID" '[.users[] | select(.user_id == $a or .user_id == $b)] | sort_by(.user_id != $a) | map((if .user_id == $a then "A" else "B" end) + " \(.attempted)/\(.sent)/\(.skipped_endpoints)") | join(";")')"
if [ "$(printf '%s' "$BODY" | jq -r .skipped_endpoints)" -ge 8 ]; then ok "service-role digest: top-level skipped_endpoints -> $(printf '%s' "$BODY" | jq -r .skipped_endpoints)"; else bad "top-level skipped_endpoints -> $(printf '%s' "$BODY" | jq -r .skipped_endpoints)"; fi
expect "service-role digest: A's and B's devices reached" "a1 a2 a3 a4 b1" "$(jq -r 'select(.device | test("^(a[1-4]|b1)$")) | .device' "$PUSH_LOG" | sort | tr '\n' ' ' | sed 's/ $//')"
expect "service-role digest: no hostile endpoint contacted" "" \
  "$(jq -r '.url' "$FETCH_LOG" | grep -E 'evil|169\.254|127\.0\.0\.1|:8443|@|^http:' | tr '\n' ' ')"
expect "mock push service never got an evil* request" 0 "$(jq -r 'select(.device | startswith("evil"))' "$PUSH_LOG" | wc -l | tr -d ' ')"

# =============================================================================================
section "4 — slipping: same rows as before for every account (RLS), owner-scoped under the service role"
expect "view columns unchanged" "entity_type text,entity_id uuid,entity_name text,last_touch timestamp with time zone,days_since numeric" \
  "$(sql -c "select string_agg(attname || ' ' || format_type(atttypid, atttypmod), ',' order by attnum) from pg_attribute where attrelid = 'public.slipping'::regclass and attnum > 0 and not attisdropped")"
expect "view still security_invoker" "{security_invoker=true}" "$(sql -c "select reloptions from pg_class where oid = 'public.slipping'::regclass")"

# A: one 10-day-old domain with a project, an area and a task in it; A last touched the task 9 days ago.
sql -v a="$A_ID" <<'SQL' >/dev/null
with d as (insert into domains (user_id, name, created_at) values (:'a', 'SEC2 alpha domain', now() - interval '10 days') returning id),
     p as (insert into projects (user_id, name, domain_id, created_at) select :'a', 'SEC2 alpha project', id, now() - interval '10 days' from d returning id),
     ar as (insert into areas (user_id, name, domain_id, created_at) select :'a', 'SEC2 alpha area', id, now() - interval '10 days' from d returning id),
     t as (insert into tasks (user_id, title, domain_id, project_id, area_id, created_at)
           select :'a', 'SEC2 alpha task', d.id, p.id, ar.id, now() - interval '10 days' from d, p, ar returning id)
insert into activity_log (user_id, event_type, entity_type, entity_id, created_at)
select :'a', 'task.updated', 'task', id, now() - interval '9 days' from t;
SQL
OLD_VIEW_SQL=$(sed -n '/^create or replace view slipping/,$p' "$ROOT/supabase/migrations/0013_slipping_areas.sql" \
  | sed 's/^create or replace view slipping with (security_invoker = true) as/create temp view slipping_0013 with (security_invoker = true) as/')
SLIP=$(sql -F '|' <<SQL
begin;
$OLD_VIEW_SQL
grant select on slipping_0013 to authenticated;
create temp table cmp (email text, old_rows int, new_rows int, differing int);
grant all on cmp to authenticated;
do \$\$
declare u record;
begin
  for u in select id, email from auth.users order by created_at loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into cmp select u.email,
      (select count(*) from pg_temp.slipping_0013), (select count(*) from slipping),
      (select count(*) from ((select * from pg_temp.slipping_0013 except all select * from slipping)
                             union all (select * from slipping except all select * from pg_temp.slipping_0013)) x);
    execute 'reset role';
  end loop;
end \$\$;
select 'row', email, old_rows, new_rows, differing from cmp where old_rows + new_rows > 0 order by email;
select 'total', count(*), sum(old_rows), sum(new_rows), sum(differing) from cmp;
rollback;
SQL
)
printf '%s\n' "$SLIP" | grep '^row|' | sed 's/^row|/        /'
TOTAL=$(printf '%s\n' "$SLIP" | grep '^total|')
info "accounts compared | rows 0013 | rows 0036 | differing: ${TOTAL#total|}"
expect "every account: 0013 and 0036 return identical rows under RLS" 0 "$(printf '%s' "$TOTAL" | cut -d'|' -f5)"
expect "A's rows under RLS (both definitions)" "row|sec2-a@example.com|3|3|0" "$(printf '%s\n' "$SLIP" | grep '^row|sec2-a@')"

# Under the service role (no RLS): B logs activity against A's domain, project, area and task.
CROSS=$(sql -F '|' -v a="$A_ID" -v b="$B_ID" <<SQL
begin;
$OLD_VIEW_SQL
insert into activity_log (user_id, event_type, entity_type, entity_id)
select :'b'::uuid, 'sec2.foreign', 'domain', id from domains where user_id = :'a'
union all select :'b', 'sec2.foreign', 'project', id from projects where user_id = :'a'
union all select :'b', 'sec2.foreign', 'area', id from areas where user_id = :'a'
union all select :'b', 'sec2.foreign', 'task', id from tasks where user_id = :'a';
select 'old', string_agg(s.entity_type || '=' || floor(s.days_since), ',' order by s.entity_type)
  from pg_temp.slipping_0013 s where s.entity_name like 'SEC2 alpha%';
select 'new', string_agg(s.entity_type || '=' || floor(s.days_since), ',' order by s.entity_type)
  from slipping s where s.entity_name like 'SEC2 alpha%';
rollback;
SQL
)
info "B's rows touch A's entities (service role, rolled back) — days since last touch:"
printf '%s\n' "$CROSS" | sed 's/^/        /'
expect "0013: B's activity counts as touching A's entities" "old|area=0,domain=0,project=0" "$(printf '%s\n' "$CROSS" | grep '^old|')"
expect "0036: A's entities keep A's own last touch" "new|area=9,domain=9,project=9" "$(printf '%s\n' "$CROSS" | grep '^new|')"

# End to end: notify's digest (service role) counts A's slipping areas from the view.
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into activity_log (user_id, event_type, entity_type, entity_id)
select :'b'::uuid, 'sec2.foreign', 'domain', id from domains where user_id = :'a'
union all select :'b', 'sec2.foreign', 'project', id from projects where user_id = :'a'
union all select :'b', 'sec2.foreign', 'area', id from areas where user_id = :'a';
insert into tasks (user_id, title, top3) values (:'a', 'SEC2 alpha top3', true);
SQL
: > "$PUSH_LOG"
call notify "$SERVICE_ROLE_KEY" '{"kind":"morning_digest"}'
expect "digest on a1 still counts A's 3 stale entities though B's rows point at them (0013: 0)" \
  "Top-3: SEC2 alpha top3. 3 area(s) slipping." "$(jq -r 'select(.device=="a1") | .payload.body' "$PUSH_LOG")"

# =============================================================================================
wipe
sql -c "update auth.users set is_anonymous = false where id = '$C_ID'" >/dev/null
expect "cleanup: no sec2 rows left in push_subscriptions / activity_log / ai_usage" "0|0|0" \
  "$(sql -F '|' -c "select (select count(*) from push_subscriptions where user_id in ($IDS)), (select count(*) from activity_log where user_id in ($IDS)), (select count(*) from ai_usage where user_id in ($IDS))")"

printf '\n%d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" = 0 ]
