#!/usr/bin/env bash
# FIX-0 integration checks — security audit 2026-08-01 findings S1 S3 S4 S5 S6 S9.
# LOCAL Supabase stack only: refuses to run unless the API URL is 127.0.0.1/localhost.
#
#   supabase/tests/fix0-auth.sh             functions at $API_URL/functions/v1, i.e. behind the
#                                           local gateway (`supabase functions serve`)
#   supabase/tests/fix0-auth.sh --harness   serves the six functions under plain Deno on
#                                           127.0.0.1 instead — no gateway, no Docker changes, so
#                                           it can run beside other people's use of a shared stack.
#                                           Needs `deno` on PATH (or $DENO) with the functions'
#                                           npm/jsr deps reachable, and api.groq.com is NOT
#                                           allowed (Groq calls fail on purpose).
#
# Needs curl, jq, psql, node (a mock push service that decrypts what it receives), and
# supabase/functions/.env with VAPID_KEYS (gitignored; any throwaway P-256 JWK pair).
#
# Side effects, all limited to the two test accounts fix0-a@example.com / fix0-b@example.com
# (created on first run): their tasks/domains/push_subscriptions/resurfaced_log/embed_queue rows
# are deleted and re-seeded. do_resurface() runs inside a transaction that is rolled back. The
# service-role `task_reminder` check is skipped if any other account has a reminder due in the
# window (it would flip theirs too). In --harness mode `embed` runs against an unreachable
# database URL so the service-role call proves the gate without draining the shared queue.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MODE=serve
[ "${1:-}" = "--harness" ] && MODE=harness

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
skip() { SKIP=$((SKIP + 1)); printf '  SKIP  %s\n' "$1"; }
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
# Mock push service: generates three subscriptions' keys (a1, a2 for user A; b1 for user B),
# decrypts every RFC 8291 aes128gcm push it receives, and appends {device, payload} to a log.
# ---------------------------------------------------------------------------------------------
PUSH_PORT=${PUSH_PORT:-54392}
if [ "$MODE" = harness ]; then PUSH_HOST=${PUSH_HOST:-127.0.0.1}; LISTEN=127.0.0.1
else PUSH_HOST=${PUSH_HOST:-host.docker.internal}; LISTEN=0.0.0.0; fi
PUSH_LOG=$TMP/push.log; : > "$PUSH_LOG"
cat > "$TMP/mock-push.mjs" <<'JS'
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
const [, , port, host, subsFile, logFile] = process.argv
const devices = {}
for (const name of ['a1', 'a2', 'b1']) {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  devices[name] = { ecdh, auth: crypto.randomBytes(16) }
}
fs.writeFileSync(subsFile, JSON.stringify(Object.fromEntries(Object.entries(devices).map(([n, d]) =>
  [n, { p256dh: d.ecdh.getPublicKey().toString('base64url'), auth: d.auth.toString('base64url') }]))))
const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len))
function decrypt(dev, body) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const ct = body.subarray(21 + idlen)
  const uaPublic = dev.ecdh.getPublicKey()
  const ikm = hkdf(dev.ecdh.computeSecret(asPublic), dev.auth,
    Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32)
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ct.subarray(ct.length - 16))
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])
  let end = pt.length - 1
  while (end >= 0 && pt[end] === 0) end-- // RFC 8188 padding: 0x02 delimiter, then zeros
  return pt.subarray(0, end).toString('utf8')
}
http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const device = req.url.split('/').pop()
    let payload = null
    let error = null
    try { payload = JSON.parse(decrypt(devices[device], Buffer.concat(chunks))) } catch (e) { error = String(e) }
    fs.appendFileSync(logFile, JSON.stringify({ device, payload, error }) + '\n')
    res.writeHead(201)
    res.end()
  })
}).listen(Number(port), host)
JS
node "$TMP/mock-push.mjs" "$PUSH_PORT" "$LISTEN" "$TMP/subs.json" "$PUSH_LOG" &
PIDS+=($!)
for _ in $(seq 1 40); do [ -s "$TMP/subs.json" ] && break; sleep 0.25; done

# ---------------------------------------------------------------------------------------------
# Where the functions are.
# ---------------------------------------------------------------------------------------------
if [ "$MODE" = harness ]; then
  DENO=${DENO:-deno}
  ENV_FILE="$ROOT/supabase/functions/.env"
  [ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (VAPID_KEYS)" >&2; exit 2; }
  cat > "$TMP/runner.ts" <<'TS'
// Serves edge functions under plain Deno: each module's Deno.serve(handler) is captured and routed
// by the first path segment, like the edge runtime's main service (minus its verify_jwt check).
const handlers = new Map<string, (req: Request) => Response | Promise<Response>>()
let current = ''
const realServe = Deno.serve
// deno-lint-ignore no-explicit-any
;(Deno as any).serve = (h: any) => {
  handlers.set(current, typeof h === 'function' ? h : h.handler)
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} }
}
// Supabase.ai exists only inside the edge runtime. Test stub: a fixed unit vector, so search/chat
// reach search_hybrid (the vector branch then matches nothing; the FTS branch does the work).
// deno-lint-ignore no-explicit-any
;(globalThis as any).Supabase = { ai: { Session: class {
  run() { const v = new Array(384).fill(0); v[0] = 1; return Promise.resolve(v) }
} } }
const [root, port, ...names] = Deno.args
for (const name of names) {
  current = name
  await import(`file://${root}/${name}/index.ts`)
}
realServe({ port: Number(port), hostname: '127.0.0.1', onListen() {} }, (req) => {
  const handler = handlers.get(new URL(req.url).pathname.split('/')[1])
  return handler ? handler(req) : new Response('Function not found', { status: 404 })
})
TS
  FN_PORT=${FN_PORT:-54390}
  EMBED_PORT=${EMBED_PORT:-54391}
  run_harness() { # supabase_url port names...
    local url=$1 port=$2; shift 2
    SUPABASE_URL=$url SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
      "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-net=127.0.0.1,localhost \
      --env-file="$ENV_FILE" "$TMP/runner.ts" "$ROOT/supabase/functions" "$port" "$@" \
      > "$TMP/harness-$port.log" 2>&1 &
    PIDS+=($!)
  }
  run_harness "$API_URL" "$FN_PORT" transcribe parse-capture chat search notify
  run_harness "http://127.0.0.1:9" "$EMBED_PORT" embed
  wait_port "http://127.0.0.1:$FN_PORT/" && wait_port "http://127.0.0.1:$EMBED_PORT/" || exit 2
  fn_url() { if [ "$1" = embed ]; then echo "http://127.0.0.1:$EMBED_PORT/embed"; else echo "http://127.0.0.1:$FN_PORT/$1"; fi; }
else
  fn_url() { echo "$API_URL/functions/v1/$1"; }
fi

# call FN TOKEN BODY [curl args...] -> sets CODE, BODY, HDRS
call() {
  local fn=$1 token=$2 body=$3; shift 3
  local auth=()
  [ -n "$token" ] && auth=(-H "Authorization: Bearer $token")
  : > "$TMP/hdrs"
  BODY=$(curl -sS -D "$TMP/hdrs" -o - -w '\n%{http_code}' -X POST "$(fn_url "$fn")" "${auth[@]}" \
    -H 'Content-Type: application/json' --data "$body" "$@")
  CODE=${BODY##*$'\n'}
  BODY=${BODY%$'\n'*}
  HDRS=$(tr -d '\r' < "$TMP/hdrs")
}
call_audio() { # transcribe takes multipart
  local token=$1 auth=()
  [ -n "$token" ] && auth=(-H "Authorization: Bearer $token")
  printf 'not really webm' > "$TMP/clip.webm"
  BODY=$(curl -sS -o - -w '\n%{http_code}' -X POST "$(fn_url transcribe)" "${auth[@]}" -F "audio=@$TMP/clip.webm")
  CODE=${BODY##*$'\n'}
  BODY=${BODY%$'\n'*}
}
short() { printf '%s' "$1" | tr -d '\n' | cut -c1-140; }

# ---------------------------------------------------------------------------------------------
# Test accounts. A is created before B, so B is the newer account.
# ---------------------------------------------------------------------------------------------
PASSWORD='fix0-local-only-password'
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
A_JSON=$(sign_in fix0-a@example.com)
B_JSON=$(sign_in fix0-b@example.com)
A_TOKEN=$(printf '%s' "$A_JSON" | jq -r .access_token); A_ID=$(printf '%s' "$A_JSON" | jq -r .user.id)
B_TOKEN=$(printf '%s' "$B_JSON" | jq -r .access_token); B_ID=$(printf '%s' "$B_JSON" | jq -r .user.id)
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign in test users" >&2; exit 2; }
pad() { local s=$1; while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done; printf '%s' "$s"; }
ALG=$(pad "$(printf '%s' "$A_TOKEN" | cut -d. -f1 | tr '_-' '/+')" | base64 -d 2>/dev/null | jq -r .alg 2>/dev/null)
# A token nobody signed, claiming service_role — must never be accepted.
b64url() { printf '%s' "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }
FORGED="$(b64url '{"alg":"none","typ":"JWT"}').$(b64url '{"role":"service_role","iss":"supabase-demo"}')."

section "setup"
info "mode=$MODE  functions=$(fn_url '<fn>')  user token alg=$ALG"
info "user A=$A_ID  user B=$B_ID"

SUBS=$(cat "$TMP/subs.json")
sub_keys() { printf '%s' "$SUBS" | jq -c ".$1"; }
sql -v a="$A_ID" -v b="$B_ID" -v e="http://$PUSH_HOST:$PUSH_PORT/push" \
  -v ka1="$(sub_keys a1)" -v ka2="$(sub_keys a2)" -v kb1="$(sub_keys b1)" <<'SQL' >/dev/null
delete from push_subscriptions where user_id in (:'a', :'b');
delete from resurfaced_log where user_id in (:'a', :'b');
delete from embed_queue where user_id in (:'a', :'b');
delete from activity_log where user_id in (:'a', :'b');
delete from tasks where user_id in (:'a', :'b');
delete from domains where user_id in (:'a', :'b');
insert into tasks (user_id, title, top3) values (:'a', 'FIX0 alpha top3', true), (:'b', 'FIX0 bravo top3', true);
insert into tasks (user_id, title, created_at) values
  (:'a', 'fix0zebra alpha old task', now() - interval '10 days'),
  (:'b', 'fix0zebra bravo old task', now() - interval '10 days');
insert into tasks (user_id, title, reminder_at) values
  (:'a', 'FIX0 alpha reminder', now() - interval '2 minutes'),
  (:'b', 'FIX0 bravo stale reminder', now() - interval '20 minutes');
insert into domains (user_id, name, created_at) values (:'a', 'FIX0 alpha domain', now() - interval '10 days');
insert into push_subscriptions (user_id, endpoint, keys, device_label) values
  (:'a', :'e' || '/a1', (:'ka1')::jsonb, 'fix0 a1'),
  (:'a', :'e' || '/a2', (:'ka2')::jsonb, 'fix0 a2'),
  (:'b', :'e' || '/b1', (:'kb1')::jsonb, 'fix0 b1');
SQL
info "seeded: A has 2 push devices (a1,a2), B has 1 (b1); top3/old/reminder tasks each; A has one 10-day-old domain"

push_devices() { jq -r .device "$PUSH_LOG" | sort | tr '\n' ' ' | sed 's/ $//'; }
push_errors()  { jq -r 'select(.error != null) | .device' "$PUSH_LOG" | wc -l | tr -d ' '; }
push_bodies()  { jq -r '"\(.device): \(.payload.title // "?") | \(.payload.body // .error)"' "$PUSH_LOG" | sort; }

# ---------------------------------------------------------------------------------------------
section "S3 — Groq-backed + retrieval functions need a signed-in user"
for fn in parse-capture chat search; do
  case $fn in
    parse-capture) body='{"raw_text":"buy milk tomorrow","context":{"domains":[],"projects":[],"today":"2026-09-26","timezone":"Africa/Cairo"}}' ;;
    chat) body='{"messages":[{"role":"user","content":"fix0zebra"}]}' ;;
    search) body='{"query":"fix0zebra"}' ;;
  esac
  call $fn "" "$body";                 expect "$fn  no token" 401 "$CODE"
  call $fn "$ANON_KEY" "$body";        expect "$fn  anon key" 401 "$CODE"
  call $fn "$SERVICE_ROLE_KEY" "$body"; expect "$fn  service-role key (not a user)" 401 "$CODE"
  call $fn "$FORGED" "$body";          expect "$fn  forged unsigned token" 401 "$CODE"
  call $fn "$A_TOKEN" "$body"
  if [ "$CODE" != 401 ] && [ "$CODE" != 403 ]; then ok "$fn  user A token passes the gate -> $CODE"; else bad "$fn  user A token -> $CODE"; fi
  info "$fn  user A response: $(short "$BODY")"
done
call_audio "";        expect "transcribe  no token" 401 "$CODE"
call_audio "$ANON_KEY"; expect "transcribe  anon key" 401 "$CODE"
call_audio "$A_TOKEN"
if [ "$CODE" != 401 ] && [ "$CODE" != 403 ]; then ok "transcribe  user A token passes the gate -> $CODE"; else bad "transcribe  user A token -> $CODE"; fi
info "transcribe  user A response: $(short "$BODY")"

section "S3/S6 — search runs as the caller: A and B each see only their own rows"
call search "$A_TOKEN" '{"query":"fix0zebra"}'
expect "search A: titles" "fix0zebra alpha old task" "$(printf '%s' "$BODY" | jq -r '[.results[].title] | sort | join(",")')"
call search "$B_TOKEN" '{"query":"fix0zebra"}'
expect "search B: titles" "fix0zebra bravo old task" "$(printf '%s' "$BODY" | jq -r '[.results[].title] | sort | join(",")')"

# ---------------------------------------------------------------------------------------------
section "S1 — notify: user callers may only test their own devices"
call notify "" '{"kind":"test"}';                 expect "notify  no token" 401 "$CODE"
call notify "$ANON_KEY" '{"kind":"test"}';        expect "notify  anon key" 401 "$CODE"
call notify "$FORGED" '{"kind":"morning_digest"}'; expect "notify  forged service_role token" 401 "$CODE"
: > "$PUSH_LOG"
call notify "$A_TOKEN" '{"kind":"test"}'
expect "notify  A test: status" 200 "$CODE"
expect "notify  A test: per-user counts" "$A_ID attempted=2 sent=2" \
  "$(printf '%s' "$BODY" | jq -r '.users | map("\(.user_id) attempted=\(.attempted) sent=\(.sent)") | join(";")')"
expect "notify  A test: client-facing sent/pruned" "2/0" "$(printf '%s' "$BODY" | jq -r '"\(.sent)/\(.pruned)"')"
expect "notify  A test: devices reached" "a1 a2" "$(push_devices)"
expect "notify  A test: every push decrypted with that device's keys" 0 "$(push_errors)"
push_bodies | sed 's/^/        /'
: > "$PUSH_LOG"
call notify "$B_TOKEN" '{"kind":"test"}'
expect "notify  B test: devices reached" "b1" "$(push_devices)"
for kind in morning_digest evening_nudge overdue task_reminder bogus; do
  : > "$PUSH_LOG"
  call notify "$A_TOKEN" "{\"kind\":\"$kind\"}"
  expect "notify  A $kind" 403 "$CODE"
  expect "notify  A $kind: nothing pushed" "" "$(push_devices)"
done

section "S1 — notify: service role (the pg_cron caller) sends each user their own payload"
: > "$PUSH_LOG"
call notify "$SERVICE_ROLE_KEY" '{"kind":"morning_digest"}'
expect "notify  service-role morning_digest: status" 200 "$CODE"
expect "notify  per-user counts" "$A_ID attempted=2 sent=2;$B_ID attempted=1 sent=1" \
  "$(printf '%s' "$BODY" | jq -r --arg a "$A_ID" --arg b "$B_ID" \
      '[.users[] | select(.user_id == $a or .user_id == $b)] | sort_by(.user_id != $a) | map("\(.user_id) attempted=\(.attempted) sent=\(.sent)") | join(";")')"
push_bodies | sed 's/^/        /'
expect "every push decrypted with that device's keys" 0 "$(push_errors)"
expect "digest on a1" "Top-3: FIX0 alpha top3. 1 area(s) slipping." "$(jq -r 'select(.device=="a1") | .payload.body' "$PUSH_LOG")"
expect "digest on a2" "Top-3: FIX0 alpha top3. 1 area(s) slipping." "$(jq -r 'select(.device=="a2") | .payload.body' "$PUSH_LOG")"
expect "digest on b1" "Top-3: FIX0 bravo top3. 0 area(s) slipping." "$(jq -r 'select(.device=="b1") | .payload.body' "$PUSH_LOG")"
expect "no device got the other user's titles" 0 \
  "$(jq -r 'select((.device|startswith("a")) and (.payload.body|contains("bravo")) or (.device|startswith("b")) and (.payload.body|contains("alpha")))' "$PUSH_LOG" | wc -l | tr -d ' ')"

OTHER_DUE=$(sql -c "select count(*) from tasks where user_id not in ('$A_ID', '$B_ID') and status = 'todo' and reminder_sent = false and reminder_at between now() - interval '10 minutes' and now()")
if [ "$OTHER_DUE" = 0 ]; then
  : > "$PUSH_LOG"
  call notify "$SERVICE_ROLE_KEY" '{"kind":"task_reminder"}'
  expect "notify  service-role task_reminder: status" 200 "$CODE"
  expect "task_reminder devices reached" "a1 a2" "$(push_devices)"
  expect "task_reminder payload on a1" "1 reminder(s): FIX0 alpha reminder" "$(jq -r 'select(.device=="a1") | .payload.body' "$PUSH_LOG")"
  expect "reminder_sent flipped only on A's due task" "FIX0 alpha reminder|true;FIX0 bravo stale reminder|false" \
    "$(sql -c "select string_agg(title || '|' || reminder_sent, ';' order by title) from tasks where user_id in ('$A_ID','$B_ID') and reminder_at is not null")"
  expect "activity_log row written under A only" "$A_ID|task.reminder_sent" \
    "$(sql -c "select string_agg(user_id || '|' || event_type, ';') from activity_log where user_id in ('$A_ID','$B_ID')")"
else
  skip "service-role task_reminder: $OTHER_DUE other account(s) have a reminder due right now"
fi

# ---------------------------------------------------------------------------------------------
section "S5 — embed is service-role only"
call embed "" '{}';                 expect "embed  no token" 401 "$CODE"
call embed "$ANON_KEY" '{}';        expect "embed  anon key" 401 "$CODE"
call embed "$A_TOKEN" '{}';         expect "embed  user A token" 401 "$CODE"
call embed "$A_TOKEN" '{"backfill":true}'; expect "embed  user A backfill" 401 "$CODE"
call embed "$FORGED" '{}';          expect "embed  forged service_role token" 401 "$CODE"
call embed "$SERVICE_ROLE_KEY" '{}'
expect "embed  service role" 200 "$CODE"
info "embed  service-role response: $(short "$BODY")"
# What isServiceRole's second path leans on: the auth server's admin check verifies the signature
# and the service_role claim itself (so a forged token fails even with verify_jwt off).
admin_probe() { curl -sS -o /dev/null -w '%{http_code}' "$API_URL/auth/v1/admin/users?page=1&per_page=1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1"; }
expect "auth admin probe  service-role key" 200 "$(admin_probe "$SERVICE_ROLE_KEY")"
code=$(admin_probe "$FORGED"); if [ "$code" != 200 ]; then ok "auth admin probe  forged service_role token -> $code"; else bad "auth admin probe  forged token -> 200"; fi
code=$(admin_probe "$A_TOKEN"); if [ "$code" != 200 ]; then ok "auth admin probe  user A token -> $code"; else bad "auth admin probe  user A token -> 200"; fi
code=$(admin_probe "$ANON_KEY"); if [ "$code" != 200 ]; then ok "auth admin probe  anon key -> $code"; else bad "auth admin probe  anon key -> 200"; fi

# ---------------------------------------------------------------------------------------------
section "S9 — CORS reflects only allowlisted origins"
if [ "$MODE" = harness ]; then
  for origin in https://kais-flow.kaidagoat.workers.dev http://localhost:5173 http://127.0.0.1:4173 tauri://localhost http://tauri.localhost https://evil.example http://localhost.evil.example; do
    case $origin in *evil*) want="" ;; *) want=$origin ;; esac
    curl -sS -o /dev/null -D "$TMP/pre" -X OPTIONS "$(fn_url search)" -H "Origin: $origin" \
      -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization, content-type'
    got=$(tr -d '\r' < "$TMP/pre" | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: //p')
    expect "preflight  Origin $origin  ACAO" "$want" "$got"
  done
  call search "$A_TOKEN" '{"query":"fix0zebra"}' -H 'Origin: https://evil.example'
  expect "POST from disallowed origin: no ACAO" "" "$(printf '%s\n' "$HDRS" | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: //p')"
  expect "POST carries Vary: Origin" "Origin" "$(printf '%s\n' "$HDRS" | sed -n 's/^[Vv]ary: //p')"
  call notify "" '{"kind":"test"}' -H 'Origin: http://localhost:5173'
  expect "401 from an allowed origin is still readable (ACAO set)" "http://localhost:5173" \
    "$(printf '%s\n' "$HDRS" | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: //p')"
else
  skip "CORS: the local gateway (Kong) has its own cors plugin that answers preflights with ACAO:*; hosted has none — run with --harness to test the functions' own headers"
fi

# ---------------------------------------------------------------------------------------------
section "S4 — do_resurface() (0035) picks per user, from that user's rows only (rolled back)"
RESURFACE=$(sql -F '|' <<SQL
begin;
select do_resurface();
select u.email, rl.entity_type,
       coalesce(t.user_id, i.user_id) = rl.user_id as own_row,
       coalesce(t.title, i.raw_text) as picked
from resurfaced_log rl
join auth.users u on u.id = rl.user_id
left join tasks t on rl.entity_type = 'task' and t.id = rl.entity_id
left join inbox_items i on rl.entity_type = 'inbox_item' and i.id = rl.entity_id
where rl.shown_on = current_date
order by u.created_at;
rollback;
SQL
)
printf '%s\n' "$RESURFACE" | grep '|' | sed 's/^/        /'
expect "every resurfaced_log row today references its own user's row" 0 "$(printf '%s\n' "$RESURFACE" | grep '|' | awk -F'|' '$3 != "t"' | wc -l | tr -d ' ')"
expect "A got its own pick" "fix0-a@example.com|task|t|fix0zebra alpha old task" "$(printf '%s\n' "$RESURFACE" | grep '^fix0-a@')"
expect "B (newer account) got its own pick" "fix0-b@example.com|task|t|fix0zebra bravo old task" "$(printf '%s\n' "$RESURFACE" | grep '^fix0-b@')"
expect "rolled back: nothing persisted for A/B" 0 "$(sql -c "select count(*) from resurfaced_log where user_id in ('$A_ID','$B_ID')")"

section "S6 — search_hybrid scopes itself even with RLS out of the picture"
# As postgres (superuser: RLS does not apply, exactly as it wouldn't under SECURITY DEFINER), with
# A's claims set. Before 0035 this returned both users' rows.
S6=$(sql <<SQL
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$A_ID', 'role', 'authenticated')::text, true) \\g /dev/null
select string_agg(title, ',' order by title) from search_hybrid('fix0zebra', ('[' || repeat('0,', 383) || '1]')::vector, 50);
rollback;
SQL
)
expect "search_hybrid as superuser with A's claims" "fix0zebra alpha old task" "$S6"

section "0035 attributes"
expect "do_resurface: security definer, search_path pinned" "t|{search_path=public}" \
  "$(sql -F '|' -c "select prosecdef, proconfig from pg_proc where oid = 'public.do_resurface'::regproc")"
expect "do_resurface: no execute for anon/authenticated/public" "f|f|f" \
  "$(sql -F '|' -c "select has_function_privilege('anon','public.do_resurface()','execute'), has_function_privilege('authenticated','public.do_resurface()','execute'), exists(select 1 from pg_proc, aclexplode(proacl) a where oid = 'public.do_resurface'::regproc and a.grantee = 0)")"
expect "search_hybrid: security invoker" "f" "$(sql -c "select prosecdef from pg_proc where oid = 'public.search_hybrid'::regproc")"

# The seeded push devices point at this script's mock service, which stops with it.
sql -c "delete from push_subscriptions where user_id in ('$A_ID', '$B_ID')"

printf '\n%d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" = 0 ]
