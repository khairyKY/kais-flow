#!/usr/bin/env bash
# The full MCP surface against real Postgres (docs/MCP.md; handoff 2026-10-14 mcp-full): every tool
# added for "tell any AI to do anything" — tasks (labels, priority, reminders, Top 3 / goal, Time slots,
# order, bulk, Trash), the Inbox's triage, projects / milestones / checklists / templates, areas,
# domains, labels, settings, routines, focus, the rituals, the Library, insights and activity — and the
# PRIVACY GATE (migration 0080): a key without the journal / people scopes neither lists those tools
# nor reaches those rows through any other tool; granting them (as the app does, through PostgREST)
# opens exactly them; revoking closes them again. Same harness as mcp-week.sh: `mcp` under plain Deno
# (supabase/tests/harness/runner.ts) on the stack's database — each request one transaction as the
# key's owner, so RLS is the real one. LOCAL Supabase stack only.
#
#   supabase/tests/mcp-full.sh
#
# Needs deno (on PATH or $DENO), curl, jq, psql, openssl. Task dates are fixed in January 2028 (Cairo,
# UTC+2); the rituals, routines and focus run on the real "now".
#
# Side effects: two throwaway accounts, mcp-full-a@ / mcp-full-b@example.com, deleted (with every row
# they own — cascade) before the run and again at the end.
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
# Timestamps read back in UTC: "2028-01-17 13:30:00+00".
sql() { PGTZ=UTC psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }

EMAILS="'mcp-full-a@example.com', 'mcp-full-b@example.com'"
drop_users() { sql -c "delete from auth.users where email in ($EMAILS)" >/dev/null; }

TMP=$(mktemp -d)
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; drop_users 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

FN_PORT=${FN_PORT:-54395}
SUPABASE_URL=$API_URL SUPABASE_DB_URL=$DB_URL \
  "$DENO" run --no-lock --no-prompt --quiet --allow-env --allow-read --allow-sys --allow-net=127.0.0.1,localhost \
  "$ROOT/supabase/tests/harness/runner.ts" "$ROOT/supabase/functions" "$FN_PORT" mcp \
  > "$TMP/harness.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 240); do curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" && break; sleep 0.5; done
curl -s -o /dev/null "http://127.0.0.1:$FN_PORT/" || { echo "mcp did not start:" >&2; cat "$TMP/harness.log" >&2; exit 2; }
MCP_URL="http://127.0.0.1:$FN_PORT/mcp"

# rpc KEY METHOD PARAMS_JSON -> CODE, BODY
rpc() {
  BODY=$(curl -sS -w '\n%{http_code}' -X POST "$MCP_URL" -H "Authorization: Bearer $1" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2025-11-25' \
    --data "$(jq -cn --arg m "$2" --argjson p "$3" '{jsonrpc: "2.0", id: 1, method: $m, params: $p}')")
  CODE=${BODY##*$'\n'}
  BODY=${BODY%$'\n'*}
}
# tool KEY NAME ARGS -> CODE, ERR, OUT. ARGS is a jq object expression; ids come from the environment.
tool() {
  MARK=$(sql -c "select clock_timestamp()")
  rpc "$1" tools/call "$(jq -cn --arg n "$2" "{name: \$n, arguments: ($3)}")"
  ERR=$(jq -r '.result.isError // false' <<<"$BODY" 2>/dev/null || echo 'not json')
  OUT=$(jq -r '.result.content[0].text // empty' <<<"$BODY" 2>/dev/null || true)
}
call() {
  tool "$2" "$3" "$4"
  if [ "$CODE" = 200 ] && [ "$ERR" = false ]; then ok "$1"; else bad "$1 -> HTTP $CODE isError=$ERR: $(printf '%s' "${OUT:-$BODY}" | head -c 400)"; fi
}
refused() {
  tool "$2" "$3" "$4"
  if [ "$CODE" = 200 ] && [ "$ERR" = true ] && grep -qF -- "$5" <<<"$OUT"; then ok "$1 -> refused: $(head -c 140 <<<"$OUT")"
  else bad "$1 -> HTTP $CODE isError=$ERR, want a refusal naming '$5': $(printf '%s' "${OUT:-$BODY}" | head -c 400)"; fi
}
j() { jq -r "$1" <<<"$OUT" 2>/dev/null; }
changed() { j '.changed | join(" | ")'; }
logs() { sql -c "select coalesce(string_agg(event_type || '/' || coalesce(payload->>'source', '-'), ' ' order by event_type), '') from activity_log where user_id = '${1:-$A_ID}' and created_at > '$MARK'"; }
names() { rpc "$1" tools/list '{}'; jq -r '[.result.tools[].name] | sort | join(" ")' <<<"$BODY"; }

PASSWORD='mcp-full-local-only-password'
new_user() {
  curl -sS -o /dev/null -X POST "$API_URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
  curl -sS -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' --data "{\"email\":\"$1\",\"password\":\"$PASSWORD\"}"
}
# As Settings → AI assistants makes it (mcpKey.ts createMcpKey): the hash, the access, no personal scopes.
new_key() {
  local key hash code
  key="kf_ai_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  hash=$(printf '%s' "$key" | sha256sum | cut -d' ' -f1)
  code=$(curl -sS -o "$TMP/key.out" -w '%{http_code}' -X POST "$API_URL/rest/v1/mcp_keys?on_conflict=user_id" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -H 'Prefer: resolution=merge-duplicates,return=minimal' --data "{\"key_hash\":\"$hash\",\"scope\":\"read_write\",\"scopes\":[]}")
  case "$code" in 200|201|204) printf '%s' "$key" ;; *) echo "mcp_keys upsert -> $code $(cat "$TMP/key.out")" >&2; return 1 ;; esac
}
# The card's switches (mcpKey.ts setMcpPersonal): an update of the key's own row, as the user -> HTTP code.
set_scopes() {
  curl -sS -o "$TMP/scopes.out" -w '%{http_code}' -X PATCH "$API_URL/rest/v1/mcp_keys?user_id=eq.$2" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' --data "{\"scopes\":$3}"
}

section "setup"
drop_users
A_JSON=$(new_user mcp-full-a@example.com)
B_JSON=$(new_user mcp-full-b@example.com)
A_ID=$(jq -r .user.id <<<"$A_JSON"); B_ID=$(jq -r .user.id <<<"$B_JSON")
A_TOK=$(jq -r .access_token <<<"$A_JSON"); B_TOK=$(jq -r .access_token <<<"$B_JSON")
[ -n "$A_ID" ] && [ "$A_ID" != null ] && [ -n "$B_ID" ] && [ "$B_ID" != null ] || { echo "could not sign up test users: $A_JSON" >&2; exit 2; }
KA=$(new_key "$A_TOK") || exit 2
KB=$(new_key "$B_TOK") || exit 2
expect "a new key carries no personal scope" "{}" "$(sql -c "select scopes from mcp_keys where user_id = '$A_ID'")"
sql -v a="$A_ID" -v b="$B_ID" <<'SQL' >/dev/null
insert into app_settings (user_id, timezone) values (:'a', 'Africa/Cairo'), (:'b', 'Africa/Cairo')
  on conflict (user_id) do update set timezone = excluded.timezone;
insert into domains (user_id, name, sort_order) values (:'a', 'Full Domain A', 0), (:'a', 'Full Domain Two', 1), (:'a', 'Full Merge From', 2), (:'a', 'Full Merge Into', 3);
insert into projects (user_id, domain_id, name) select :'a', id, 'Full Project A' from domains where user_id = :'a' and name = 'Full Domain A';
insert into areas (user_id, name, sort_order) values (:'a', 'Full Area A', 0);
insert into projects (user_id, name) values (:'b', 'Full Project B');
-- The personal rows: A's journal (one live, one in Trash), A's person (in the merge domain), and B's own.
insert into journal_entries (user_id, body, entry_date) values (:'a', 'zebrafoxtrot morning pages', '2028-01-10');
insert into journal_entries (user_id, body, entry_date, deleted_at) values (:'a', 'zebrafoxtrot trashed entry', '2028-01-09', now());
insert into people (user_id, name, facts, domain_id) select :'a', 'Full Person A', '[{"id":"f1","label":"Hobby","value":"zebrafoxtrot"}]'::jsonb, id from domains where user_id = :'a' and name = 'Full Merge From';
insert into interactions (user_id, person_id, summary, occurred_at) select :'a', id, 'zebrafoxtrot coffee', '2028-01-05T10:00:00Z' from people where user_id = :'a';
insert into notes (user_id, body, domain_id) select :'a', 'Full merge note', id from domains where user_id = :'a' and name = 'Full Merge From';
insert into journal_entries (user_id, body, entry_date) values (:'b', 'zebrafoxtrot B private', '2028-01-10');
insert into people (user_id, name) values (:'b', 'Full Person B');
insert into quotes (user_id, text) values (:'b', 'Full quote B');
-- Activity about the journal and people, as the app writes it.
insert into activity_log (user_id, event_type, entity_type, entity_id, payload)
  select :'a', 'journal.created', 'journal_entry', id, '{"entry_date":"2028-01-10"}'::jsonb from journal_entries where user_id = :'a' and deleted_at is null;
insert into activity_log (user_id, event_type, entity_type, entity_id, payload)
  select :'a', 'people.interaction_logged', 'people', id, '{"summary":"zebrafoxtrot coffee"}'::jsonb from people where user_id = :'a';
SQL
export D1 D2 DM1 DM2 P1 AR1 PB JA JT PA PERSON_B QB
D1=$(sql -c "select id from domains where user_id = '$A_ID' and name = 'Full Domain A'")
D2=$(sql -c "select id from domains where user_id = '$A_ID' and name = 'Full Domain Two'")
DM1=$(sql -c "select id from domains where user_id = '$A_ID' and name = 'Full Merge From'")
DM2=$(sql -c "select id from domains where user_id = '$A_ID' and name = 'Full Merge Into'")
P1=$(sql -c "select id from projects where user_id = '$A_ID'")
AR1=$(sql -c "select id from areas where user_id = '$A_ID'")
PB=$(sql -c "select id from projects where user_id = '$B_ID'")
JA=$(sql -c "select id from journal_entries where user_id = '$A_ID' and deleted_at is null")
JT=$(sql -c "select id from journal_entries where user_id = '$A_ID' and deleted_at is not null")
PA=$(sql -c "select id from people where user_id = '$A_ID'")
PERSON_B=$(sql -c "select id from people where user_id = '$B_ID'")
QB=$(sql -c "select id from quotes where user_id = '$B_ID'")
SUITE_START=$(sql -c "select clock_timestamp()")
TODAY=$(sql -c "select to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD')")
LOOPDAY=$(sql -c "select to_char(now() at time zone 'Africa/Cairo' - interval '4 hours', 'YYYY-MM-DD')")
PERSONAL_ROWS() { sql -c "select concat_ws(' | ',
  (select string_agg(concat_ws(' ', id, body, entry_date, deleted_at is null, updated_at), ', ' order by id) from journal_entries where user_id = '$A_ID'),
  (select string_agg(concat_ws(' ', id, name, domain_id, updated_at), ', ' order by id) from people where user_id = '$A_ID'),
  (select string_agg(concat_ws(' ', id, summary, updated_at), ', ' order by id) from interactions where user_id = '$A_ID'))"; }
info "harness: mcp on :$FN_PORT; users A=$A_ID B=$B_ID; today (Cairo) $TODAY, loop day $LOOPDAY"

# ---------------------------------------------------------------------------------------------
section "privacy gate: a key without the journal / people scopes"
names "$KA" >/dev/null
NAMES=$(jq -r '[.result.tools[].name] | sort | join(" ")' <<<"$BODY")
expect "tools/list: 50 tools, none of them personal" "50 0" \
  "$(jq -r '[.result.tools[].name] | "\(length) \([.[] | select(IN("journal","save_journal_entry","people","save_person","log_interaction","delete_person"))] | length)"' <<<"$BODY")"
for t in get_project save_project update_milestone update_checklist checklist_template save_area save_domain labels update_label trash move_to_trash restore_from_trash settings update_settings inbox file_inbox_item update_inbox_item routines save_routine check_routine start_focus stop_focus plan_my_day shut_down library save_library_item delete_library_item insights activity reopen_task duplicate_task duplicate_event snooze_task unsnooze_task; do
  grep -qw "$t" <<<"$NAMES" && ok "listed: $t" || bad "not listed: $t"
done
BEFORE_P=$(PERSONAL_ROWS)
refused "journal" "$KA" journal '{}' "This key can't reach the journal"
refused "save_journal_entry" "$KA" save_journal_entry '{body: "sneaky"}' "This key can't reach the journal"
refused "people" "$KA" people '{}' "can't reach the people"
refused "save_person" "$KA" save_person '{name: "sneaky"}' "can't reach the people"
refused "log_interaction" "$KA" log_interaction '{person_id: env.PA, summary: "x"}' "can't reach the people"
refused "delete_person" "$KA" delete_person '{id: env.PA}' "can't reach the people"
call "search 'zebrafoxtrot'" "$KA" search '{query: "zebrafoxtrot"}'
expect "search: no journal entry or person" "0" "$(j '[.results[] | select(.type == "journal_entry" or .type == "person")] | length')"
call "trash" "$KA" trash '{}'
expect "trash: not the trashed journal entry" "0" "$(j '[.items[] | select(.type == "journal_entry")] | length')"
call "activity" "$KA" activity '{limit: 100}'
expect "activity: no journal or people event" "0" "$(j '[.activity[] | select((.event | startswith("journal.")) or (.event | startswith("people.")))] | length')"
call "add_to_inbox 'called the plumber'" "$KA" add_to_inbox '{text: "called the plumber"}'
export IJ; IJ=$(j .added_to_inbox.id)
refused "file_inbox_item as journal" "$KA" file_inbox_item '{id: env.IJ, as: "journal"}' "can't reach"
refused "file_inbox_item as person" "$KA" file_inbox_item '{id: env.IJ, as: "person", person_id: env.PA}' "can't reach"
expect "the capture is still waiting" "pending" "$(sql -c "select status from inbox_items where id = '$IJ'")"
refused "move_to_trash a journal entry" "$KA" move_to_trash '{type: "journal_entry", id: env.JA}' "can't reach"
refused "restore_from_trash a journal entry" "$KA" restore_from_trash '{type: "journal_entry", id: env.JT}' "can't reach"
refused "shut_down with a journal line" "$KA" shut_down '{line: "a good day"}' "can't reach"
call "save_domain: merge 'Full Merge From' into 'Full Merge Into'" "$KA" save_domain '{id: env.DM1, merge_into: env.DM2}'
expect "merge: the note moved, the person did not (no People scope)" "$DM2 $DM1 t" \
  "$(sql -c "select concat_ws(' ', (select domain_id from notes where user_id = '$A_ID'), (select domain_id from people where user_id = '$A_ID'), (select deleted_at is not null from domains where id = '$DM1'))")"
expect "merge: answer says People kept it" "1" "$(j '[.changed[] | select(contains("can'"'"'t reach People"))] | length')"
expect "no journal / people row touched" "$BEFORE_P" "$(PERSONAL_ROWS)"
expect "no write logged about the journal or people" "0" \
  "$(sql -c "select count(*) from activity_log where user_id = '$A_ID' and created_at > '$SUITE_START' and (event_type like 'journal.%' or event_type like 'people.%')")"
expect "a scope outside the list is refused by the database (0080 check)" "400" "$(set_scopes "$A_TOK" "$A_ID" '["secrets"]')"
expect "…and the key is unchanged" "{}" "$(sql -c "select scopes from mcp_keys where user_id = '$A_ID'")"

section "privacy gate: Journal and People switched on (as the card does)"
expect "PATCH scopes as the user" "204" "$(set_scopes "$A_TOK" "$A_ID" '["journal","people"]')"
expect "stored" "{journal,people}" "$(sql -c "select scopes from mcp_keys where user_id = '$A_ID'")"
names "$KA" >/dev/null
expect "tools/list: 56 tools, the six personal ones among them" "56 6" \
  "$(jq -r '[.result.tools[].name] | "\(length) \([.[] | select(IN("journal","save_journal_entry","people","save_person","log_interaction","delete_person"))] | length)"' <<<"$BODY")"
call "journal 2028-01-01..31" "$KA" journal '{from: "2028-01-01", to: "2028-01-31"}'
expect "journal: A's live entry only (not the trashed one, not B's)" "$JA zebrafoxtrot morning pages" "$(j '[.entries[] | "\(.id) \(.body)"] | join(",")')"
call "search 'zebrafoxtrot'" "$KA" search '{query: "zebrafoxtrot"}'
expect "search: A's journal entry and person now; never B's" "1 1 0" \
  "$(j "\"\([.results[] | select(.id == \"$JA\")] | length) \([.results[] | select(.id == \"$PA\")] | length) \([.results[] | select(.title | test(\"B private|Person B\"))] | length)\"")"
call "trash" "$KA" trash '{}'
expect "trash: the trashed journal entry" "1" "$(j "[.items[] | select(.id == \"$JT\")] | length")"
call "restore_from_trash the journal entry" "$KA" restore_from_trash '{type: "journal_entry", id: env.JT}'
expect "logged" "journal.restored/mcp" "$(logs)"
expect "row live" "t" "$(sql -c "select deleted_at is null from journal_entries where id = '$JT'")"
call "move_to_trash it again" "$KA" move_to_trash '{type: "journal_entry", id: env.JT}'
expect "row in Trash" "f" "$(sql -c "select deleted_at is null from journal_entries where id = '$JT'")"
call "save_journal_entry on 2028-01-10 with the day's mood" "$KA" save_journal_entry '{date: "2028-01-10", body: "Second entry", mood: "calm", gratitude: ["tea"]}'
export J2; J2=$(j .written.id)
expect "logged" "journal.created/mcp journal.updated/mcp" "$(logs)"
expect "a new row; the mood rides on the day's first entry" "Second entry - {} | zebrafoxtrot morning pages calm {tea}" \
  "$(sql -c "select string_agg(concat_ws(' ', body, coalesce(mood, '-'), gratitude), ' | ' order by created_at desc) from journal_entries where user_id = '$A_ID' and entry_date = '2028-01-10'")"
call "activity" "$KA" activity '{limit: 100}'
expect "activity: the journal and people events now come through" "1 1" \
  "$(j '"\([.activity[] | select(.event == "people.interaction_logged")] | length) \([.activity[] | select(.event == "journal.created" and .details.entry_date == "2028-01-10")] | length | if . > 0 then 1 else 0 end)"')"
call "people" "$KA" people '{}'
expect "people: A's only" "Full Person A" "$(j '[.people[].name] | join(",")')"
call "people: one, with interactions" "$KA" people '{id: env.PA}'
expect "the interaction" "zebrafoxtrot coffee" "$(j '[.person.interactions[].summary] | join(",")')"
call "save_person 'Full Person New' with a birthday" "$KA" save_person '{name: "Full Person New", facts: [{label: "Birthday", value: "12 May", date: "05-12"}]}'
export PN; PN=$(j .added.id)
expect "logged" "people.created/mcp" "$(logs)"
expect "row: facts as given" "Birthday 05-12" "$(sql -c "select (facts->0->>'label') || ' ' || (facts->0->>'date') from people where id = '$PN'")"
call "log_interaction" "$KA" log_interaction '{person_id: env.PN, summary: "Lunch", when: "2026-01-05T13:00"}'
export IN1; IN1=$(sql -c "select id from interactions where person_id = '$PN'")
expect "logged" "people.interaction_logged/mcp" "$(logs)"
expect "row: 11:00Z" "Lunch 2026-01-05 11:00:00+00" "$(sql -c "select summary || ' ' || occurred_at from interactions where id = '$IN1'")"
call "file_inbox_item as person" "$KA" file_inbox_item '{id: env.IJ, as: "person", person_id: env.PN}'
expect "the capture filed to People; an interaction made" "filed person 2" \
  "$(sql -c "select concat_ws(' ', status, payload->>'filed_to', (select count(*) from interactions where person_id = '$PN')) from inbox_items where id = '$IJ'")"
call "delete_person: one interaction" "$KA" delete_person '{interaction_id: env.IN1}'
call "delete_person: the person" "$KA" delete_person '{id: env.PN}'
expect "answer gives the interactions back" "called the plumber" "$(j '[.deleted.interactions[].summary] | join(",")')"
expect "gone, with their interactions" "0 0" "$(sql -c "select (select count(*) from people where id = '$PN') || ' ' || (select count(*) from interactions where person_id = '$PN')")"
refused "B's person is out of reach even with the scope" "$KA" save_person '{id: env.PERSON_B, name: "taken"}' "No person with id"
export JB; JB=$(sql -c "select id from journal_entries where user_id = '$B_ID'")
refused "B's journal entry is out of reach even with the scope" "$KA" save_journal_entry '{id: env.JB, body: "taken"}' "No journal entry"
call "shut_down with a line (journal scope)" "$KA" shut_down '{line: "zebrafoxtrot good day"}'
expect "the line is a journal entry on the loop day" "$LOOPDAY" "$(sql -c "select entry_date from journal_entries where user_id = '$A_ID' and body = 'zebrafoxtrot good day'")"
expect "logged: line + the ritual" "1 1" "$(sql -c "select (select count(*) from activity_log where user_id = '$A_ID' and event_type = 'journal.line_added' and payload->>'date' = '$LOOPDAY') || ' ' || (select count(*) from activity_log where user_id = '$A_ID' and event_type = 'ritual.finished' and payload->>'ritual' = 'evening' and payload->>'date' = '$LOOPDAY')")"

section "privacy gate: switched off again"
expect "PATCH scopes []" "204" "$(set_scopes "$A_TOK" "$A_ID" '[]')"
refused "journal" "$KA" journal '{}' "This key can't reach the journal"
call "search 'zebrafoxtrot'" "$KA" search '{query: "zebrafoxtrot"}'
expect "search: no journal or people hit again" "0" "$(j '[.results[] | select(.type == "journal_entry" or .type == "person")] | length')"
names "$KA" >/dev/null
expect "tools/list: back to 50" "50" "$(jq -r '.result.tools | length' <<<"$BODY")"
expect "B's journal / people untouched" "zebrafoxtrot B private Full Person B" \
  "$(sql -c "select (select body from journal_entries where user_id = '$B_ID') || ' ' || (select name from people where user_id = '$B_ID')")"

# ---------------------------------------------------------------------------------------------
section "tasks: every field, Top 3 and the goal, order, bulk, Trash"
call "add_task with labels, priority, a reminder, in an area" "$KA" add_task '{title: "Full A", due: "2028-01-17", labels: ["money", "home"], priority: 2, remind_at: "2028-01-17T08:30", area_id: env.AR1}'
export T1; T1=$(j .added.id)
expect "logged" "task.created/mcp task.reminder_set/mcp" "$(logs)"
expect "row" "{money,home} 2 2028-01-17 06:30:00+00 $AR1 -" \
  "$(sql -c "select concat_ws(' ', labels, priority, reminder_at, area_id, coalesce(project_id::text, '-')) from tasks where id = '$T1'")"
call "edit_task: labels, priority off, paused, into the project" "$KA" edit_task '{id: env.T1, labels: ["money"], priority: null, paused: true, project_id: env.P1}'
expect "changed" "labels → money | priority cleared | project → Full Project A | paused" "$(changed)"
expect "logged" "task.moved/mcp task.paused/mcp task.updated/mcp task.updated/mcp" "$(logs)"
expect "row: in the project with its domain, out of the area" "{money} - t $P1 $D1 -" \
  "$(sql -c "select concat_ws(' ', labels, coalesce(priority::text, '-'), paused, project_id, domain_id, coalesce(area_id::text, '-')) from tasks where id = '$T1'")"
call "edit_task: a new reminder, then Someday" "$KA" edit_task '{id: env.T1, remind_at: "2028-01-16T20:00", someday: true, paused: false}'
expect "changed" "reminder → 2028-01-16 20:00 | parked for Someday | resumed" "$(changed)"
expect "logged" "task.reminder_set/mcp task.resumed/mcp task.someday_set/mcp" "$(logs)"
expect "row" "2028-01-16 18:00:00+00 f t f" "$(sql -c "select concat_ws(' ', reminder_at, reminder_sent, someday, paused) from tasks where id = '$T1'")"
refused "a reminder needs a time" "$KA" edit_task '{id: env.T1, remind_at: "2028-01-16"}' "needs a time"

call "add_task 'Full goal' (undated)" "$KA" add_task '{title: "Full goal"}'
export TG; TG=$(j .added.id)
call "add_task 'Full pick'" "$KA" add_task '{title: "Full pick", top3: true}'
export TP; TP=$(j .added.id)
call "edit_task: goal" "$KA" edit_task '{id: env.TG, goal: true}'
expect "changed" "in today's Top 3 | the goal of the day" "$(changed)"
expect "logged" "task.goal_set/mcp task.starred/mcp" "$(logs)"
expect "ranks: the goal 1, the other pick 2" "1 2" "$(sql -c "select (select top3_rank from tasks where id = '$TG') || ' ' || (select top3_rank from tasks where id = '$TP')")"
call "edit_task: the pick out of the Top 3" "$KA" edit_task '{id: env.TP, top3: false}'
expect "row" "false -" "$(sql -c "select top3 || ' ' || coalesce(top3_rank::text, '-') from tasks where id = '$TP'")"

call "add_task 'Full B1' 2028-01-20" "$KA" add_task '{title: "Full B1", due: "2028-01-20"}'
export TB1; TB1=$(j .added.id)
call "add_task 'Full B2' 2028-01-21" "$KA" add_task '{title: "Full B2", due: "2028-01-21"}'
export TB2; TB2=$(j .added.id)
call "edit_task: B2 placed before B1" "$KA" edit_task '{id: env.TB2, place_before: env.TB1}'
expect "logged: nothing (an order isn't a domain event)" "" "$(logs)"
expect "B2's key sits before B1's date" "t" \
  "$(sql -c "select (select sort_order from tasks where id = '$TB2') < extract(epoch from (select due_at from tasks where id = '$TB1')) * 1000")"

call "bulk: priority on B1, B2 and a done one" "$KA" complete_task '{id: env.TP}'
call "edit_task ids" "$KA" edit_task '{ids: [env.TB1, env.TB2, env.TP], priority: 1}'
expect "two edited, the done one reported" "2 1" "$(j '"\(.results | length) \(.failed | length)"')"
expect "rows" "1 1" "$(sql -c "select (select priority from tasks where id = '$TB1') || ' ' || (select priority from tasks where id = '$TB2')")"
call "reopen_task" "$KA" reopen_task '{id: env.TP}'
expect "logged" "task.reopened/mcp" "$(logs)"
expect "row open" "todo -" "$(sql -c "select status || ' ' || coalesce(completed_at::text, '-') from tasks where id = '$TP'")"

call "add_task 'Full timed' 2028-01-22T10:00" "$KA" add_task '{title: "Full timed", due: "2028-01-22T10:00"}'
export TT; TT=$(j .added.id)
call "reschedule_task to no date" "$KA" reschedule_task '{id: env.TT, when: null}'
expect "changed" "date taken off | 1 calendar block taken off the calendar (in Trash)" "$(changed)"
expect "row: no date, no schedule; its block in Trash" "- - 0" \
  "$(sql -c "select concat_ws(' ', coalesce(due_at::text, '-'), coalesce(scheduled_start::text, '-'), (select count(*) from calendar_events where task_id = t.id and deleted_at is null)) from tasks t where id = '$TT'")"
call "reschedule it to 2028-01-22T11:00 (a block again)" "$KA" reschedule_task '{id: env.TT, when: "2028-01-22T11:00"}'
call "move_to_trash ids: it and B1" "$KA" move_to_trash '{type: "task", ids: [env.TT, env.TB1]}'
expect "logged" "task.deleted/mcp task.deleted/mcp" "$(logs)"
expect "both in Trash, the block with it" "2 0" \
  "$(sql -c "select (select count(*) from tasks where id in ('$TT', '$TB1') and deleted_at is not null) || ' ' || (select count(*) from calendar_events where task_id = '$TT' and deleted_at is null)")"
call "restore_from_trash the timed one" "$KA" restore_from_trash '{type: "task", id: env.TT}'
expect "logged" "task.restored/mcp" "$(logs)"
expect "back, its blocks with it" "true 2" "$(sql -c "select (select deleted_at is null from tasks where id = '$TT') || ' ' || (select count(*) from calendar_events where task_id = '$TT' and deleted_at is null)")"

section "snooze (Kai 2026-10-17): off every list until then, its date kept; unsnooze brings it back"
DUE=$(sql -c "select due_at from tasks where id = '$TT'")
call "snooze_task the timed one until tomorrow" "$KA" snooze_task '{id: env.TT, until: "tomorrow"}'
expect "logged" "task.snoozed/mcp" "$(logs)"
expect "row: snoozed till later, its date kept" "true $DUE" "$(sql -c "select (snoozed_until > now()) || ' ' || due_at from tasks where id = '$TT'")"
refused "snooze_task into the past" "$KA" snooze_task '{id: env.TT, until: "2020-01-01"}' "must be in the future"
call "unsnooze_task it" "$KA" unsnooze_task '{id: env.TT}'
expect "logged" "task.unsnoozed/mcp" "$(logs)"
expect "row: not snoozed" "-" "$(sql -c "select coalesce(snoozed_until::text, '-') from tasks where id = '$TT'")"
refused "unsnooze_task again" "$KA" unsnooze_task '{id: env.TT}' "isn't snoozed"

section "subtasks: ticking a parent (Kai 2026-10-16, 4 C), a repeat carries them on, Trash takes them along"
call "add_task 'Full parent'" "$KA" add_task '{title: "Full parent", due: "2028-01-18"}'
export TPA; TPA=$(j .added.id)
call "add_task its subtask 'Full sub 1'" "$KA" add_task '{title: "Full sub 1", parent_id: env.TPA}'
export TS1; TS1=$(j .added.id)
call "add_task its subtask 'Full sub 2'" "$KA" add_task '{title: "Full sub 2", parent_id: env.TPA}'
export TS2; TS2=$(j .added.id)
parent_rows() { sql -c "select concat_ws(' ', (select status from tasks where id = '$TPA'), (select status from tasks where id = '$TS1'), (select status from tasks where id = '$TS2'))"; }
call "complete_task the parent: by default its subtasks are left open" "$KA" complete_task '{id: env.TPA}'
expect "the answer says so" "left its 2 subtasks open: Full sub 1; Full sub 2 (subtasks: 'complete' ticks them)" "$(j .subtasks)"
expect "rows: the parent done, the two open" "done todo todo" "$(parent_rows)"
expect "logged: the parent only" "task.completed/mcp" "$(logs)"
call "reopen it" "$KA" reopen_task '{id: env.TPA}'
call "complete_task subtasks: complete" "$KA" complete_task '{id: env.TPA, subtasks: "complete"}'
expect "the answer says so" "ticked its 2 subtasks still open too: Full sub 1; Full sub 2" "$(j .subtasks)"
expect "rows: all three done" "done done done" "$(parent_rows)"
expect "logged: each one" "task.completed/mcp task.completed/mcp task.completed/mcp" "$(logs)"
refused "an unknown choice" "$KA" complete_task '{id: env.TS1, subtasks: "all"}' 'must be one of: leave, complete'
call "add_task 'Full daily' (a repeat)" "$KA" add_task '{title: "Full daily", due: "2028-01-18", repeat: "FREQ=DAILY"}'
export TR; TR=$(j .added.id)
call "add_task its subtask 'Full daily step'" "$KA" add_task '{title: "Full daily step", parent_id: env.TR}'
export TRS; TRS=$(j .added.id)
call "tick the step" "$KA" complete_task '{id: env.TRS}'
call "complete_task the repeating parent" "$KA" complete_task '{id: env.TR, subtasks: "complete"}'
export TRN; TRN=$(j .next.id)
expect "the answer says the step went on with the series" "its 1 subtask went with it to the next occurrence, open again" "$(j .subtasks)"
expect "row: under the next copy, open again" "$TRN todo -" "$(sql -c "select concat_ws(' ', parent_task_id, status, coalesce(completed_at::text, '-')) from tasks where id = '$TRS'")"
expect "logged" "task.completed/mcp task.created/mcp task.reopened/mcp" "$(logs)"
call "move_to_trash the parent" "$KA" move_to_trash '{type: "task", id: env.TPA}'
expect "its subtasks go with it" "2" "$(j .trashed.with_subtasks)"
expect "all three in Trash, at one instant" "3 1" "$(sql -c "select count(*) || ' ' || count(distinct deleted_at) from tasks where id in ('$TPA', '$TS1', '$TS2') and deleted_at is not null")"
expect "logged" "task.deleted/mcp task.deleted/mcp task.deleted/mcp" "$(logs)"
call "restore_from_trash the parent" "$KA" restore_from_trash '{type: "task", id: env.TPA}'
expect "its subtasks come back with it" "2 0" "$(j .restored.with_subtasks) $(sql -c "select count(*) from tasks where id in ('$TPA', '$TS1', '$TS2') and deleted_at is not null")"

section "Time slots: a task into a Time block; the block moved and deleted"
call "add_event: a Time block 2028-01-18 10:00–12:00, reminding 10 min before" "$KA" add_event '{title: "Full slot", start: "2028-01-18T10:00", end: "2028-01-18T12:00", kind: "time_block", remind_min: 10}'
export SL; SL=$(j .added.id)
expect "row: remind_min" "time_block 10" "$(sql -c "select type || ' ' || remind_min from calendar_events where id = '$SL'")"
call "edit_task: B2 into the slot" "$KA" edit_task '{id: env.TB2, slot_id: env.SL}'
expect "changed" "in Full slot · 2028-01-18 10:00–12:00" "$(changed)"
expect "row: the slot, its day and times" "$SL 2028-01-18 2028-01-18 08:00:00+00 2028-01-18 10:00:00+00" \
  "$(sql -c "select concat_ws(' ', slot_id, slot_date, scheduled_start, scheduled_end) from tasks where id = '$TB2'")"
call "calendar 2028-01-18" "$KA" calendar '{from: "2028-01-18", to: "2028-01-18"}'
expect "the slot lists it" "Full B2" "$(j "[.events[] | select(.id == \"$SL\") | .tasks[]?.title] | join(\",\")")"
call "edit_event: the slot to 14:00" "$KA" edit_event '{id: env.SL, start: "2028-01-18T14:00"}'
expect "changed" "time → 2028-01-18 14:00–16:00 | 1 task in it moved with it" "$(changed)"
expect "the task moved with it" "2028-01-18 12:00:00+00 2028-01-18 14:00:00+00" "$(sql -c "select scheduled_start || ' ' || scheduled_end from tasks where id = '$TB2'")"
expect "the reminder kept" "10" "$(sql -c "select remind_min from calendar_events where id = '$SL'")"
call "delete_event: the slot" "$KA" delete_event '{id: env.SL}'
expect "changed" "the event moved to Trash | 1 task it held is back unscheduled" "$(changed)"
expect "the task is out of it, unscheduled" "- - -" "$(sql -c "select concat_ws(' ', coalesce(slot_id::text, '-'), coalesce(slot_date::text, '-'), coalesce(scheduled_start::text, '-')) from tasks where id = '$TB2'")"

section "Time slots: a repeat, kind or all-day change re-homes the tasks (the app's rule, _shared/slots.ts)"
held() { sql -c "select concat_ws(' ', coalesce(slot_id::text, '-'), coalesce(slot_date::text, '-'), coalesce(scheduled_start::text, '-')) from tasks where id = '$1'"; }
call "add_event: a daily Time block from Mon 2028-01-17, 10:00–12:00" "$KA" add_event '{title: "Full daily slot", start: "2028-01-17T10:00", end: "2028-01-17T12:00", kind: "time_block", repeat: "FREQ=DAILY"}'
export RS; RS=$(j .added.id)
call "add_task 'Full held Mon'" "$KA" add_task '{title: "Full held Mon"}'
export HM; HM=$(j .added.id)
call "add_task 'Full held Tue'" "$KA" add_task '{title: "Full held Tue"}'
export HT; HT=$(j .added.id)
call "add_task 'Full held Wed'" "$KA" add_task '{title: "Full held Wed"}'
export HW; HW=$(j .added.id)
call "edit_task: Mon's into Monday's" "$KA" edit_task '{id: env.HM, slot_id: env.RS, slot_occurrence: "2028-01-17T10:00"}'
call "edit_task: Tue's into Tuesday's" "$KA" edit_task '{id: env.HT, slot_id: env.RS, slot_occurrence: "2028-01-18T10:00"}'
call "edit_task: Wed's into Wednesday's" "$KA" edit_task '{id: env.HW, slot_id: env.RS, slot_occurrence: "2028-01-19T10:00"}'
refused "edit_event: the series with no scope (cal-clicks asks)" "$KA" edit_event '{id: env.RS, start: "2028-01-17T13:00"}' 'repeats: give "occurrence"'
call "edit_event: the series to 13:00" "$KA" edit_event '{id: env.RS, scope: "all", start: "2028-01-17T13:00"}'
expect "changed" "time → 13:00–15:00, every occurrence | 3 tasks in it moved with it" "$(changed)"
expect "logged" "calendar_event.updated/mcp task.scheduled/mcp task.scheduled/mcp task.scheduled/mcp" "$(logs)"
expect "each kept its day, at the new time" "$RS 2028-01-17 2028-01-17 11:00:00+00 | $RS 2028-01-18 2028-01-18 11:00:00+00 | $RS 2028-01-19 2028-01-19 11:00:00+00" \
  "$(held "$HM") | $(held "$HT") | $(held "$HW")"
call "edit_event: repeat Mondays and Wednesdays" "$KA" edit_event '{id: env.RS, scope: "all", repeat: "FREQ=WEEKLY;BYDAY=MO,WE"}'
expect "changed" "repeats FREQ=WEEKLY;BYDAY=MO,WE | 1 task it held is back unscheduled" "$(changed)"
expect "logged" "calendar_event.updated/mcp task.unscheduled/mcp" "$(logs)"
expect "Tuesday's out, unscheduled; Monday's and Wednesday's stay" "$RS 2028-01-17 2028-01-17 11:00:00+00 | - - - | $RS 2028-01-19 2028-01-19 11:00:00+00" \
  "$(held "$HM") | $(held "$HT") | $(held "$HW")"
call "edit_event: repeat null (its first occurrence only)" "$KA" edit_event '{id: env.RS, scope: "all", repeat: null}'
expect "changed" "no longer repeats | 1 task it held is back unscheduled" "$(changed)"
expect "Wednesday's out; Monday's stays" "$RS 2028-01-17 2028-01-17 11:00:00+00 | - - -" "$(held "$HM") | $(held "$HW")"
call "calendar 2028-01-17..19" "$KA" calendar '{from: "2028-01-17", to: "2028-01-19"}'
expect "one slot left, holding Monday's" "1 Full held Mon" "$(j "\"\([.events[] | select(.id == \"$RS\")] | length) \([.events[] | select(.id == \"$RS\") | .tasks[]?.title] | join(\",\"))\"")"
call "edit_event: the slot to all-day" "$KA" edit_event '{id: env.RS, start: "2028-01-17"}'
expect "changed" "time → 2028-01-17 | 1 task it held is back unscheduled" "$(changed)"
expect "logged" "calendar_event.updated/mcp task.unscheduled/mcp" "$(logs)"
expect "Monday's out, unscheduled" "- - -" "$(held "$HM")"
call "add_event: a Time block Thu 2028-01-20 10:00–12:00" "$KA" add_event '{title: "Full kind slot", start: "2028-01-20T10:00", end: "2028-01-20T12:00", kind: "time_block"}'
export KS; KS=$(j .added.id)
call "edit_task: Tue's into it" "$KA" edit_task '{id: env.HT, slot_id: env.KS}'
expect "in it" "$KS 2028-01-20 2028-01-20 08:00:00+00" "$(held "$HT")"
call "edit_event: kind → event" "$KA" edit_event '{id: env.KS, kind: "event"}'
expect "changed" "kind → event | 1 task it held is back unscheduled" "$(changed)"
expect "logged" "calendar_event.updated/mcp task.unscheduled/mcp" "$(logs)"
expect "out, unscheduled; the row an event" "- - - event" "$(held "$HT") $(sql -c "select type from calendar_events where id = '$KS'")"

# ---------------------------------------------------------------------------------------------
section "the Inbox: list, file as a task / event / note, triage"
sql -v a="$A_ID" <<'SQL' >/dev/null
insert into inbox_items (user_id, kind, raw_text, status, ai_parse, payload) values
  (:'a', 'text', 'dentist friday 3pm https://dent.example/book', 'pending', '{"title":"Full dentist","due_at":"2028-01-19T13:00:00Z","has_time":true}', '{"duration_override":45}'),
  (:'a', 'text', 'Full team lunch', 'pending', null, null),
  (:'a', 'text', 'Full idea for a note', 'pending', null, null),
  (:'a', 'text', 'Full maybe later', 'pending', null, null);
SQL
export ID1 ID2 ID3 ID4
ID1=$(sql -c "select id from inbox_items where user_id = '$A_ID' and raw_text like 'dentist%'")
ID2=$(sql -c "select id from inbox_items where user_id = '$A_ID' and raw_text = 'Full team lunch'")
ID3=$(sql -c "select id from inbox_items where user_id = '$A_ID' and raw_text = 'Full idea for a note'")
ID4=$(sql -c "select id from inbox_items where user_id = '$A_ID' and raw_text = 'Full maybe later'")
call "inbox" "$KA" inbox '{}'
expect "the four waiting captures, the AI's title with the first" "4 Full dentist" "$(j "\"\([.items[] | select(.text | test(\"Full|dentist\"))] | length) \([.items[] | select(.id == \"$ID1\") | .suggested_title] | join(\"\"))\"")"
call "file_inbox_item as a task" "$KA" file_inbox_item '{id: env.ID1, as: "task"}'
export TD; TD=$(j .filed.task.id)
expect "logged" "inbox.filed/mcp task.created/mcp task.scheduled/mcp" "$(logs)"
expect "task: the AI's title and time, 45 min on the calendar, the link along" "Full dentist 2028-01-19 13:00:00+00 45 link https://dent.example/book 1" \
  "$(sql -c "select concat_ws(' ', title, due_at, duration_min, external_ref->>'source', external_ref->>'url', (select count(*) from calendar_events where task_id = t.id and deleted_at is null and ends_at - starts_at = interval '45 minutes')) from tasks t where id = '$TD'")"
expect "capture filed with the task" "filed $TD" "$(sql -c "select status || ' ' || filed_task_id from inbox_items where id = '$ID1'")"
call "file_inbox_item as an event" "$KA" file_inbox_item '{id: env.ID2, as: "event", start: "2028-01-19T16:00", duration_min: 60}'
expect "event row; capture filed to event" "Full team lunch 2028-01-19 14:00:00+00 2028-01-19 15:00:00+00 | filed event" \
  "$(sql -c "select (select concat_ws(' ', title, starts_at, ends_at) from calendar_events where user_id = '$A_ID' and title = 'Full team lunch') || ' | ' || (select status || ' ' || (payload->>'filed_to') from inbox_items where id = '$ID2')")"
call "file_inbox_item as a Library note" "$KA" file_inbox_item '{id: env.ID3, as: "note", title: "Full note"}'
expect "note row" "Full note Full idea for a note" "$(sql -c "select title || ' ' || body from notes where user_id = '$A_ID' and title = 'Full note'")"
refused "already filed" "$KA" file_inbox_item '{id: env.ID3, as: "note"}' "already filed"
call "snooze to 2028-02-01" "$KA" update_inbox_item '{id: env.ID4, action: "snooze", until: "2028-02-01"}'
expect "logged" "inbox.snoozed/mcp" "$(logs)"
expect "row" "2028-02-01 07:00:00+00" "$(sql -c "select snoozed_until from inbox_items where id = '$ID4'")"
call "inbox show snoozed" "$KA" inbox '{show: "snoozed"}'
expect "it's there" "1" "$(j "[.items[] | select(.id == \"$ID4\")] | length")"
call "unsnooze" "$KA" update_inbox_item '{id: env.ID4, action: "unsnooze"}'
call "dismiss" "$KA" update_inbox_item '{id: env.ID4, action: "dismiss"}'
expect "logged" "inbox.dismissed/mcp" "$(logs)"
expect "row" "dismissed -" "$(sql -c "select status || ' ' || coalesce(snoozed_until::text, '-') from inbox_items where id = '$ID4'")"
call "restore (dismissed → pending)" "$KA" update_inbox_item '{id: env.ID4, action: "restore"}'
call "move_to_trash the capture" "$KA" move_to_trash '{type: "inbox_item", id: env.ID4}'
expect "logged" "inbox.purged/mcp" "$(logs)"
call "restore_from_trash it" "$KA" restore_from_trash '{type: "inbox_item", id: env.ID4}'
expect "back in the Inbox" "pending true" "$(sql -c "select status || ' ' || (deleted_at is null) from inbox_items where id = '$ID4'")"

# ---------------------------------------------------------------------------------------------
section "projects, milestones, checklists, templates, areas, domains, labels"
call "save_project: a new one" "$KA" save_project '{name: "Full New Project", domain_id: env.D2, color: "Sage", target_date: "2028-03-01"}'
export PN2; PN2=$(j .created.id)
expect "logged" "project.created/mcp" "$(logs)"
expect "row" "Full New Project $D2 var(--acc-sage) 2028-03-01 00:00:00+00 active standard" \
  "$(sql -c "select concat_ws(' ', name, domain_id, color, target_date, status, type) from projects where id = '$PN2'")"
call "save_project: Full Project A to the second domain, a retainer" "$KA" save_project '{id: env.P1, domain_id: env.D2, type: "retainer"}'
expect "changed" "domain → Full Domain Two | type → retainer | 1 task moved with it" "$(changed)"
expect "logged" "project.reparented/mcp project.type_changed/mcp task.moved/mcp" "$(logs)"
expect "its task took the domain" "$D2" "$(sql -c "select domain_id from tasks where id = '$T1'")"
call "update_milestone: add" "$KA" update_milestone '{project_id: env.P1, action: "add", title: "Beta", weight: 3}'
export M1; M1=$(j .added.id)
call "update_milestone: complete" "$KA" update_milestone '{project_id: env.P1, action: "complete", milestone_id: env.M1}'
expect "logged" "project.milestone_completed/mcp" "$(logs)"
expect "row" "Beta 3 true" "$(sql -c "select concat_ws(' ', milestones->0->>'title', milestones->0->>'weight', milestones->0->>'completed') from projects where id = '$P1'")"
call "update_checklist: a task-linked line" "$KA" update_checklist '{project_id: env.P1, action: "add", title: "Full write docs", type: "task-linked"}'
export L1; L1=$(j .added.id)
export LT; LT=$(sql -c "select id from tasks where user_id = '$A_ID' and title = 'Full write docs'")
expect "a real task in the project, linked" "$P1 $D2 $LT" \
  "$(sql -c "select concat_ws(' ', (select project_id from tasks where id = '$LT'), (select domain_id from tasks where id = '$LT'), checklist->0->>'task_id') from projects where id = '$P1'")"
call "update_checklist: check it" "$KA" update_checklist '{project_id: env.P1, action: "check", item_id: env.L1}'
expect "the task is done" "done" "$(sql -c "select status from tasks where id = '$LT'")"
call "update_checklist: a one-shot line" "$KA" update_checklist '{project_id: env.P1, action: "add", title: "Full kickoff"}'
call "checklist_template: save" "$KA" checklist_template '{action: "save", project_id: env.P1, name: "Full template"}'
export TPL; TPL=$(j .saved.id)
expect "logged" "project.template_saved/mcp" "$(logs)"
expect "stored on the settings row" "Full template 2" "$(sql -c "select (checklist_templates->0->>'name') || ' ' || jsonb_array_length(checklist_templates->0->'items') from app_settings where user_id = '$A_ID'")"
call "checklist_template: use on the new project" "$KA" checklist_template '{action: "use", template_id: env.TPL, project_id: env.PN2}'
expect "answer" "2 1" "$(j '"\(.used.lines) \(.used.tasks)"')"
expect "the new project has the lines and a task" "2 1" \
  "$(sql -c "select jsonb_array_length(checklist) || ' ' || (select count(*) from tasks where project_id = '$PN2') from projects where id = '$PN2'")"
call "get_project" "$KA" get_project '{id: env.P1}'
expect "milestones, checklist (the linked line done), domain" "1 2 true Full Domain Two" "$(j '"\(.project.milestones | length) \(.project.checklist | length) \(.project.checklist[0].done) \(.project.domain)"')"
call "projects" "$KA" projects '{}'
expect "projects, areas, domains, templates" "2 1 3 1" "$(j '"\(.projects | length) \(.areas | length) \(.domains | length) \(.checklist_templates | length)"')"
call "save_area: a new one" "$KA" save_area '{name: "Full Area New", domain_id: env.D1, color: "moss"}'
export AN; AN=$(j .created.id)
expect "row" "Full Area New $D1 var(--acc-moss)" "$(sql -c "select concat_ws(' ', name, domain_id, color) from areas where id = '$AN'")"
call "save_area: rename" "$KA" save_area '{id: env.AN, name: "Full Area Renamed"}'
expect "logged" "area.renamed/mcp" "$(logs)"
call "save_domain: a new one" "$KA" save_domain '{name: "Full Domain New", color: "gold"}'
expect "logged" "domain.created/mcp" "$(logs)"
call "move_to_trash the new project" "$KA" move_to_trash '{type: "project", id: env.PN2}'
expect "logged" "project.deleted/mcp" "$(logs)"
call "restore_from_trash it" "$KA" restore_from_trash '{type: "project", id: env.PN2}'
expect "live; its tasks untouched" "true 1" "$(sql -c "select (deleted_at is null) || ' ' || (select count(*) from tasks where project_id = '$PN2' and deleted_at is null) from projects where id = '$PN2'")"
call "update_label: create 'Full Label' (sage)" "$KA" update_label '{action: "create", name: "Full Label", color: "sage"}'
expect "label_meta" "var(--acc-sage)" "$(sql -c "select label_meta->>'Full Label' from app_settings where user_id = '$A_ID'")"
call "update_label: rename 'money' → 'cash'" "$KA" update_label '{action: "rename", name: "money", to: "cash"}'
expect "logged: a label event, no task activity" "label.renamed/mcp" "$(logs)"
expect "every carrier relabelled" "{cash}" "$(sql -c "select labels from tasks where id = '$T1'")"
call "labels" "$KA" labels '{}'
expect "the list" "cash:1 Full Label:0" "$(j '[.labels[] | select(.name == "cash" or .name == "Full Label") | "\(.name):\(.count)"] | join(" ")')"
call "update_label: delete 'cash'" "$KA" update_label '{action: "delete", name: "cash"}'
expect "gone from the task" "{}" "$(sql -c "select labels from tasks where id = '$T1'")"
# Smart lists (0081): made in the app (a row through PostgREST, as the outbox writes it); read here.
SLC=$(curl -sS -o "$TMP/sl.out" -w '%{http_code}' -X POST "$API_URL/rest/v1/smart_lists" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_TOK" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' --data "{\"name\":\"Full Smart\",\"filter\":{\"places\":[\"$P1\"]}}")
expect "the app's write lands (grants + RLS)" "201" "$SLC"
SL_OPEN=$(sql -c "select count(*) from tasks where user_id = '$A_ID' and project_id = '$P1' and status = 'todo' and deleted_at is null and not someday and not paused")
call "smart_lists" "$KA" smart_lists '{}'
expect "the list, its where in words, its open count" "Full Smart Full Project A $SL_OPEN" "$(j '.smart_lists[0] | "\(.name) \(.conditions) \(.open)"')"
call "list_tasks: smart_list by name" "$KA" list_tasks '{smart_list: "full smart"}'
expect "the same tasks" "$SL_OPEN Full Smart" "$(j '"\(.count) \(.smart_list)"')"
call "smart_lists: another user's key sees none of them" "$KB" smart_lists '{}'
expect "none" "0" "$(j '.smart_lists | length')"

# ---------------------------------------------------------------------------------------------
section "settings"
call "settings" "$KA" settings '{}'
expect "read: the zone and the weekend" "Africa/Cairo sun,sat" "$(j '"\(.settings.timezone) \(.settings.weekend_days | join(","))"')"
call "update_settings" "$KA" update_settings '{weekend_days: ["fri", "sat"], morning_digest_at: "7:30", evening_nudge_on: false, quiet_from: "23:00"}'
expect "logged" "settings.updated/mcp" "$(logs)"
expect "row" "{5,6} 07:30:00 f 23:00:00" "$(sql -c "select concat_ws(' ', weekend_days, morning_digest_at, evening_nudge_on, quiet_from) from app_settings where user_id = '$A_ID'")"
refused "an unknown zone" "$KA" update_settings '{timezone: "Mars/Olympus"}' "isn't a time zone"
refused "no secrets here" "$KA" update_settings '{label_meta: {}}' 'Unknown argument "label_meta"'

# ---------------------------------------------------------------------------------------------
section "routines, focus, rituals"
call "save_routine" "$KA" save_routine '{name: "Full stretch", days: ["every day"], clock_time: "07:30", steps: [{text: "Neck", minutes: 2}, {text: "Back"}], plant: "fern"}'
export R1; R1=$(j .created.id)
expect "row" "07:30 {\"weekdays\": [0, 1, 2, 3, 4, 5, 6]} [\"Neck\", \"Back\"] [2, null] fern" \
  "$(sql -c "select concat_ws(' ', clock_time, cadence, steps, step_minutes, plant) from routines where id = '$R1'")"
call "check_routine today" "$KA" check_routine '{id: env.R1}'
expect "logged" "routine.checked/mcp" "$(logs)"
expect "a completion on the user's day" "$TODAY" "$(sql -c "select completed_on from routine_completions where routine_id = '$R1'")"
expect "answer: done today, a streak of 1" "true 1" "$(j '"\(.routine.done_today) \(.routine.streak.current)"')"
call "routines" "$KA" routines '{}'
expect "listed" "Full stretch" "$(j '[.routines[].name] | join(",")')"
call "save_routine: archive" "$KA" save_routine '{id: env.R1, active: false}'
expect "logged" "routine.archived/mcp" "$(logs)"

call "start_focus on 'Full goal' (25 min)" "$KA" start_focus '{task_id: env.TG}'
expect "logged" "project.work_logged/mcp" "$(logs)"
expect "a running round on the task" "25 true" "$(sql -c "select duration_min || ' ' || (ended_at > now()) from time_entries where task_id = '$TG'")"
refused "a second one" "$KA" start_focus '{task_id: env.TG}' "already running"
call "stop_focus" "$KA" stop_focus '{}'
expect "logged" "project.work_edited/mcp" "$(logs)"
expect "kept what was spent" "1 true" "$(sql -c "select duration_min || ' ' || (ended_at <= now()) from time_entries where task_id = '$TG'")"

call "plan_my_day: the Top 3 is B2 then the goal" "$KA" plan_my_day '{top3: [env.TB2, env.TG]}'
expect "ranks" "1 2" "$(sql -c "select (select top3_rank from tasks where id = '$TB2') || ' ' || (select top3_rank from tasks where id = '$TG')")"
expect "the ritual finished on the loop day" "1" "$(sql -c "select count(*) from activity_log where user_id = '$A_ID' and event_type = 'ritual.finished' and payload->>'ritual' = 'morning' and payload->>'date' = '$LOOPDAY'")"
call "today" "$KA" today '{}'
expect "today: Plan my day done" "true" "$(j .rituals.plan_my_day_done)"
call "shut_down: seed tomorrow" "$KA" shut_down '{seeds: [env.TP]}'
expect "a seed for the next morning" "$(sql -c "select to_char(('$LOOPDAY'::date + 1), 'YYYY-MM-DD')")" \
  "$(sql -c "select payload->>'for_date' from activity_log where user_id = '$A_ID' and event_type = 'ritual.seeded' and entity_id = '$TP'")"

# ---------------------------------------------------------------------------------------------
section "the Library, insights, activity"
call "save_library_item: a book" "$KA" save_library_item '{kind: "book", title: "Full Dune", total_pages: 400}'
export BK; BK=$(j .added.id)
call "reading progress past the end" "$KA" save_library_item '{kind: "book", id: env.BK, current_page: 450}'
expect "logged" "book.progress_updated/mcp" "$(logs)"
expect "row: capped, finished" "400 finished" "$(sql -c "select current_page || ' ' || status from books where id = '$BK'")"
call "a quote from it" "$KA" save_library_item '{kind: "quote", text: "Full fear is the mind-killer", author: "Herbert", book_id: env.BK}'
export QA; QA=$(j .added.id)
call "library" "$KA" library '{query: "mind-killer"}'
expect "found" "1" "$(j '.quotes | length')"
call "delete_library_item: the book" "$KA" delete_library_item '{kind: "book", id: env.BK}'
expect "the answer gives it back; the quote stays, unlinked" "Full Dune | 0 -" \
  "$(j .deleted.title) | $(sql -c "select (select count(*) from books where id = '$BK') || ' ' || coalesce((select book_id::text from quotes where id = '$QA'), '-')")"
call "insights" "$KA" insights '{}'
expect "the week, slipping and streaks answer" "true true true" "$(j '"\(.week.from | test("^[0-9]{4}-")) \(.slipping | type == "array") \(.streaks | type == "array")"')"
call "activity: task. events" "$KA" activity '{type: "task.", limit: 5}'
expect "five task events, by mcp" "5 5" "$(j '"\(.activity | length) \([.activity[] | select(.by == "mcp" and (.event | startswith("task.")))] | length)"')"

# ---------------------------------------------------------------------------------------------
section "ownership: A's key never reaches B's rows"
call "B: add_task 'Full B private'" "$KB" add_task '{title: "Full B private"}'
export TBX; TBX=$(j .added.id)
call "B: move it to Trash" "$KB" move_to_trash '{type: "task", id: env.TBX}'
BEFORE_B=$(sql -c "select concat_ws(' | ',
  (select string_agg(concat_ws(' ', id, title, status, deleted_at, updated_at), ', ' order by id) from tasks where user_id = '$B_ID'),
  (select string_agg(concat_ws(' ', id, name, deleted_at, checklist, updated_at), ', ' order by id) from projects where user_id = '$B_ID'),
  (select string_agg(concat_ws(' ', id, text), ', ') from quotes where user_id = '$B_ID'))")
refused "get_project B's" "$KA" get_project '{id: env.PB}' "No project with id"
refused "save_project B's" "$KA" save_project '{id: env.PB, name: "taken"}' "No project with id"
refused "update_checklist B's" "$KA" update_checklist '{project_id: env.PB, action: "add", title: "x"}' "No project with id"
refused "move_to_trash B's project" "$KA" move_to_trash '{type: "project", id: env.PB}' "No project with id"
refused "restore_from_trash B's task" "$KA" restore_from_trash '{type: "task", id: env.TBX}' "in Trash"
refused "delete_library_item B's quote" "$KA" delete_library_item '{kind: "quote", id: env.QB}' "No quote with id"
refused "edit_task B's" "$KA" edit_task '{id: env.TBX, priority: 1}' "No task with id"
call "A: trash" "$KA" trash '{}'
expect "A's Trash shows none of B's" "0" "$(j "[.items[] | select(.id == \"$TBX\")] | length")"
expect "B's rows untouched" "$BEFORE_B" "$(sql -c "select concat_ws(' | ',
  (select string_agg(concat_ws(' ', id, title, status, deleted_at, updated_at), ', ' order by id) from tasks where user_id = '$B_ID'),
  (select string_agg(concat_ws(' ', id, name, deleted_at, checklist, updated_at), ', ' order by id) from projects where user_id = '$B_ID'),
  (select string_agg(concat_ws(' ', id, text), ', ') from quotes where user_id = '$B_ID'))")"
expect "every activity row the tools wrote says source mcp" "0" \
  "$(sql -c "select count(*) from activity_log where user_id in ('$A_ID', '$B_ID') and created_at > '$SUITE_START' and payload->>'source' is distinct from 'mcp'")"

section "the function's own log"
expect "no database error behind any call" "0" "$(grep -c -E '^mcp( tool [a-z_]+)?:' "$TMP/harness.log")"

section "cleanup"
drop_users
expect "no rows of theirs left" "0 0 0 0 0 0" "$(sql -c "select concat_ws(' ',
  (select count(*) from tasks where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from journal_entries where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from people where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from activity_log where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from mcp_keys where user_id in ('$A_ID', '$B_ID')),
  (select count(*) from auth.users where id in ('$A_ID', '$B_ID')))")"

if [ "$FAIL" != 0 ]; then echo; echo "-- mcp harness log (last 80 lines) --"; tail -80 "$TMP/harness.log"; fi
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
