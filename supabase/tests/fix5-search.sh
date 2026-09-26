#!/usr/bin/env bash
# FIX-5 (J-7) checks for search_hybrid — migration 0037_search_rebalance.sql.
# LOCAL database only: refuses to run unless DB_URL points at 127.0.0.1/localhost.
#
#   supabase/tests/fix5-search.sh           checks only
#   supabase/tests/fix5-search.sh --show    also prints every ranking it checks (the evidence
#                                           tables in the FIX-5 handoff come from this)
#   supabase/tests/fix5-search.sh [--show] --with <migration.sql>
#                                           applies that file inside the same rolled-back
#                                           transaction first — a dry run of an unapplied
#                                           migration with the full checks
#
# psql only (no edge functions, no Supabase.ai: the embedder doesn't run locally). Everything runs
# in ONE transaction that is rolled back — two throwaway auth.users rows, their tasks / inbox_items /
# people / journal_entries, and synthetic vector(384) embeddings — so nothing is left on a shared
# stack and no other session ever sees the rows.
#
# Embeddings: the query vector is e1 = [1,0,…,0] (the harness's Supabase.ai stub uses the same).
# A row meant to sit at cosine distance d gets [1−d, 0,…, √(1−(1−d)²) at one other index, …] — a
# unit vector whose cosine similarity to e1 is exactly 1−d, so `embedding <=> e1` = d.
#
# search_hybrid runs the way PostgREST runs it: role `authenticated` with request.jwt.claims set
# (mode "rls"). The isolation checks repeat as the postgres superuser with the same claims (mode
# "super": RLS does not apply, as it wouldn't under SECURITY DEFINER), so they exercise the
# function's own `user_id = auth.uid()` predicates on every branch.
#
# Each returned row is classified independently of the function: F = its text matches the query's
# tsquery, L = every query word (1–2 word queries only) is a substring of its title, V = its
# embedding is within distance 0.35. "Vector-only" = neither F nor L.
set -uo pipefail

DB_URL=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "refusing: DB_URL '$DB_URL' is not a local database" >&2; exit 2 ;;
esac
SHOW=0
WITH=""
while [ $# -gt 0 ]; do
  case $1 in
    --show) SHOW=1 ;;
    --with) WITH=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ -n "$WITH" ] && [ ! -f "$WITH" ]; then echo "no such file: $WITH" >&2; exit 2; fi

PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
QVEC="('[1' || repeat(',0', 383) || ']')::vector"

# emit_search MODE WHO LABEL QUERY — one search_hybrid call, captured with its output order.
emit_search() {
  local mode=$1 who=$2 label=$3 query=$4 role=""
  [ "$mode" = rls ] && role="set local role authenticated;"
  cat <<SQL
select set_config('request.jwt.claims', json_build_object('sub', (select id from fx_users where k = '$who'), 'role', 'authenticated')::text, true) \\g /dev/null
$role
insert into res (mode, who, label, query, pos, entity_type, entity_id, title, score)
select '$mode', '$who', '$label', \$q\$$query\$q\$, s.ord, s.entity_type, s.entity_id, s.title, s.score
from search_hybrid(\$q\$$query\$q\$, $QVEC, 50) with ordinality as s(entity_type, entity_id, title, snippet, score, ord);
reset role;
SQL
}

# check NAME WANT SQL-EXPR — emits one C|name|want|got line.
check() { printf "select 'C', %s, %s, coalesce((%s)::text, '<null>');\n" "\$n\$$1\$n\$" "\$w\$$2\$w\$" "$3"; }

{
cat <<'SQL'
\set ON_ERROR_STOP 1
begin;
SQL
[ -n "$WITH" ] && printf '\\i %s\n' "$WITH"
cat <<'SQL'

create temp table fx_users (k text primary key, id uuid not null default gen_random_uuid()) on commit drop;
insert into fx_users (k) values ('A'), ('B');
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'fix5-' || lower(k) || '-' || id || '@example.invalid', now(), now()
from fx_users;

-- A unit vector at cosine distance d from e1 (second non-zero component at index k, 2..384).
create function pg_temp.vec(d float8, k int) returns vector language sql immutable as $$
  select array(select case when i = 1 then 1 - d when i = k then sqrt(1 - (1 - d) ^ 2) else 0 end
               from generate_series(1, 384) as i order by i)::vector
$$;

-- Every seeded row. `title` is what search_hybrid returns as the title (all < 80 chars, so an
-- inbox item's raw_text / a journal body IS its title); `dist` = embedding distance from e1
-- (null = no embedding yet, like a row captured seconds ago).
create temp table fx (
  k text primary key, who text not null, entity_type text not null, id uuid not null default gen_random_uuid(),
  title text not null, notes text, facts jsonb, dist float8, trashed boolean not null default false
) on commit drop;
insert into fx (k, who, entity_type, title, notes, facts, dist, trashed) values
  -- A: the rows a search for "judge" should find
  ('a_exact',        'A', 'task', 'Judge', null, null, null, false),
  ('a_phrase',       'A', 'task', 'judge the design session', null, null, 0.30, false),
  ('a_word',         'A', 'task', 'Call the judge about parking', null, null, null, false),
  ('a_sub',          'A', 'task', 'prejudged ideas list', null, null, null, false),
  ('a_notes',        'A', 'task', 'Design review', 'ask the judge for scores', null, null, false),
  ('a_inbox_judge',  'A', 'inbox_item', 'judge feedback from Sam', null, null, null, false),
  ('a_person_facts', 'A', 'person', 'Tarek', null, '[{"label":"role","value":"judge at the climbing comp"}]', null, false),
  ('a_person_prefix','A', 'person', 'Judith Park', null, '[]', null, false),
  ('a_journal',      'A', 'journal_entry', 'Met the judge today, felt good', null, null, null, false),
  ('a_pct',          'A', 'task', '50% done report', null, null, null, false),
  ('a_5000',         'A', 'task', '5000 widgets', null, null, null, false),
  -- A: trashed — each one would be a top hit if the deleted_at guards were missing
  ('a_trash_task',   'A', 'task', 'Judge trashed task', null, null, 0.02, true),
  ('a_trash_inbox',  'A', 'inbox_item', 'judge inbox trashed', null, null, 0.03, true),
  ('a_trash_journal','A', 'journal_entry', 'judge journal trashed', null, null, null, true),
  -- A: near-miss rows (J-7's "rigorous ejection modal…"): embedding close to the query, no shared words
  ('a_vec01', 'A', 'task', 'rigorous ejection modal 01', null, null, 0.11, false),
  ('a_vec02', 'A', 'task', 'rigorous ejection modal 02', null, null, 0.12, false),
  ('a_vec03', 'A', 'task', 'rigorous ejection modal 03', null, null, 0.13, false),
  ('a_vec04', 'A', 'task', 'rigorous ejection modal 04', null, null, 0.14, false),
  ('a_vec05', 'A', 'task', 'rigorous ejection modal 05', null, null, 0.15, false),
  ('a_vec06', 'A', 'task', 'rigorous ejection modal 06', null, null, 0.16, false),
  ('a_vec07', 'A', 'task', 'rigorous ejection modal 07', null, null, 0.17, false),
  ('a_vec08', 'A', 'task', 'rigorous ejection modal 08', null, null, 0.18, false),
  ('a_vec09', 'A', 'task', 'rigorous ejection modal 09', null, null, 0.19, false),
  ('a_vec10', 'A', 'task', 'rigorous ejection modal 10', null, null, 0.20, false),
  ('a_vec11', 'A', 'task', 'rigorous ejection modal 11', null, null, 0.21, false),
  ('a_vec12', 'A', 'task', 'rigorous ejection modal 12', null, null, 0.22, false),
  ('a_vec13', 'A', 'task', 'rigorous ejection modal 13', null, null, 0.23, false),
  ('a_vec14', 'A', 'task', 'rigorous ejection modal 14', null, null, 0.24, false),
  ('a_vec15', 'A', 'task', 'rigorous ejection modal 15', null, null, 0.25, false),
  ('a_vec16', 'A', 'task', 'rigorous ejection modal 16', null, null, 0.26, false),
  ('a_ivec1', 'A', 'inbox_item', 'loose inbox thought 1', null, null, 0.155, false),
  ('a_ivec2', 'A', 'inbox_item', 'loose inbox thought 2', null, null, 0.165, false),
  ('a_ivec3', 'A', 'inbox_item', 'loose inbox thought 3', null, null, 0.175, false),
  ('a_ivec4', 'A', 'inbox_item', 'loose inbox thought 4', null, null, 0.185, false),
  -- A: between the old (0.45) and new (0.35) thresholds, and beyond both
  ('a_mid1',  'A', 'task', 'orchard ledger 1', null, null, 0.40, false),
  ('a_mid2',  'A', 'task', 'orchard ledger 2', null, null, 0.41, false),
  ('a_mid3',  'A', 'inbox_item', 'orchard ledger 3', null, null, 0.42, false),
  ('a_far',   'A', 'task', 'far away thing', null, null, 0.60, false),
  -- B: strong matches for everything A searches — none may ever reach A
  ('b_exact',   'B', 'task', 'Judge', null, null, 0.01, false),
  ('b_task',    'B', 'task', 'judge bravo task', 'judge design session', null, 0.05, false),
  ('b_inbox',   'B', 'inbox_item', 'judge bravo inbox', null, null, 0.04, false),
  ('b_person',  'B', 'person', 'Judge Bravo', null, '[{"label":"role","value":"judge"}]', null, false),
  ('b_journal', 'B', 'journal_entry', 'judge bravo journal', null, null, null, false),
  ('b_pct',     'B', 'task', '50% bravo', null, null, null, false),
  ('b_vec1',    'B', 'task', 'bravo loose 1', null, null, 0.05, false),
  ('b_vec2',    'B', 'task', 'bravo loose 2', null, null, 0.06, false),
  ('b_vec3',    'B', 'inbox_item', 'bravo loose 3', null, null, 0.07, false);

insert into tasks (id, user_id, title, notes, embedding, deleted_at)
select fx.id, u.id, fx.title, fx.notes,
       case when fx.dist is not null then pg_temp.vec(fx.dist, (2 + abs(hashtext(fx.k)::bigint) % 383)::int) end,
       case when fx.trashed then now() end
from fx join fx_users u on u.k = fx.who where fx.entity_type = 'task';
insert into inbox_items (id, user_id, kind, raw_text, embedding, deleted_at)
select fx.id, u.id, 'text', fx.title,
       case when fx.dist is not null then pg_temp.vec(fx.dist, (2 + abs(hashtext(fx.k)::bigint) % 383)::int) end,
       case when fx.trashed then now() end
from fx join fx_users u on u.k = fx.who where fx.entity_type = 'inbox_item';
insert into people (id, user_id, name, facts)
select fx.id, u.id, fx.title, fx.facts
from fx join fx_users u on u.k = fx.who where fx.entity_type = 'person';
insert into journal_entries (id, user_id, body, entry_date, deleted_at)
select fx.id, u.id, fx.title, current_date, case when fx.trashed then now() end
from fx join fx_users u on u.k = fx.who where fx.entity_type = 'journal_entry';

create temp table res (
  mode text, who text, label text, query text, pos bigint, entity_type text, entity_id uuid, title text, score double precision
) on commit drop;
grant select, insert on res to authenticated;
SQL

emit_search rls A judge 'judge'
emit_search super A judge 'judge'
emit_search rls A jud 'jud'
emit_search rls A design-judge 'design judge'
emit_search rls A three-words 'judge design session'
emit_search rls A trashed 'trashed'
emit_search super A trashed 'trashed'
emit_search rls A pct '50%'
emit_search super A pct '50%'
emit_search rls B judge 'judge'
emit_search super B judge 'judge'

cat <<'SQL'
-- Independent classification of every returned row (see header).
create temp view cls as
select r.*, fx.k, fx.who as owner, fx.trashed,
       to_tsvector('english', fx.title || ' ' || coalesce(fx.notes, '') || ' ' || coalesce(
         (select string_agg(coalesce(f ->> 'label', '') || ' ' || coalesce(f ->> 'value', ''), ' ')
          from jsonb_array_elements(coalesce(fx.facts, '[]'::jsonb)) f), ''))
         @@ websearch_to_tsquery('english', r.query) as is_fts,
       coalesce(cardinality(string_to_array(lower(btrim(r.query)), ' ')) <= 2
         and not exists (select 1 from unnest(string_to_array(lower(btrim(r.query)), ' ')) w
                         where strpos(lower(fx.title), w) = 0), false) as is_lex,
       coalesce(fx.dist < 0.35, false) as is_vec
from res r left join fx on fx.id = r.entity_id;
SQL

if [ "$SHOW" = 1 ]; then
  cat <<'SQL'
select 'T', mode || ' ' || who || ' ' || label, lpad(pos::text, 2) || '  ' || rpad(coalesce(k, '<not seeded>'), 16)
       || rpad(entity_type, 14) || rpad(coalesce(title, ''), 32) || to_char(score, '0.0000') || '  '
       || case when is_fts then 'F' else '.' end || case when is_lex then 'L' else '.' end || case when is_vec then 'V' else '.' end
from cls where mode = 'rls' order by who, label, pos;
SQL
fi

vec_only="(not is_fts and not is_lex)"
at() { echo "select k from cls where mode = 'rls' and who = '${1}' and label = '${2}' and pos = ${3}"; }
{
check "judge: the exact-title row ranks first" "a_exact" "$(at A judge 1)"
check "judge: lexical title hits fill the top (last L before first non-L)" "true" \
  "select max(pos) filter (where is_lex) < min(pos) filter (where not is_lex) from cls where mode = 'rls' and who = 'A' and label = 'judge'"
check "judge: whole-title > word-start > inside-a-word (prejudged is the last lexical hit)" "a_sub" \
  "select k from cls where mode = 'rls' and who = 'A' and label = 'judge' and is_lex order by pos desc limit 1"
check "judge: every FTS hit outranks every vector-only hit" "true" \
  "select max(pos) filter (where is_fts) < min(pos) filter (where $vec_only) from cls where mode = 'rls' and who = 'A' and label = 'judge'"
check "judge: FTS-only rows (notes, person facts) are all returned" "a_notes,a_person_facts" \
  "select string_agg(k, ',' order by k) from cls where mode = 'rls' and who = 'A' and label = 'judge' and is_fts and not is_lex"
check "judge: A's candidates within 0.35 (the cap has something to cut)" "21" \
  "select count(*) from fx where who = 'A' and not trashed and dist < 0.35"
check "judge: vector-only rows returned (cap 12)" "12" \
  "select count(*) from cls where mode = 'rls' and who = 'A' and label = 'judge' and $vec_only"
check "judge: the 12 are the 12 nearest" "true" \
  "select max(f.dist) < (select min(f2.dist) from fx f2 where f2.who = 'A' and not f2.trashed and f2.dist < 0.35
                          and f2.k not in (select c2.k from cls c2 where c2.mode = 'rls' and c2.who = 'A' and c2.label = 'judge' and c2.k is not null))
   from cls c join fx f on f.k = c.k where c.mode = 'rls' and c.who = 'A' and c.label = 'judge' and not c.is_fts and not c.is_lex"
check "judge: rows at distance 0.40–0.42 (inside 0035's 0.45) are gone" "0" \
  "select count(*) from cls where mode = 'rls' and who = 'A' and label = 'judge' and k like 'a_mid%'"
check "judge: row at distance 0.60 absent" "0" \
  "select count(*) from cls where mode = 'rls' and who = 'A' and label = 'judge' and k = 'a_far'"
check "jud (half-typed, no FTS match): FTS hits" "0" \
  "select count(*) from cls where mode = 'rls' and who = 'A' and label = 'jud' and is_fts"
check "jud: every title containing 'jud' is returned" "a_exact,a_inbox_judge,a_journal,a_person_prefix,a_phrase,a_sub,a_word" \
  "select string_agg(k, ',' order by k) from cls where mode = 'rls' and who = 'A' and label = 'jud' and is_lex"
check "jud: 'Judge' ranks first" "a_exact" "$(at A jud 1)"
check "jud: lexical hits all rank above vector-only rows" "true" \
  "select max(pos) filter (where is_lex) < min(pos) filter (where $vec_only) from cls where mode = 'rls' and who = 'A' and label = 'jud'"
check "design judge (2 words, out of order): title with both words first" "a_phrase" "$(at A design-judge 1)"
check "design judge: then the FTS hit whose title has only one of them" "a_notes" "$(at A design-judge 2)"
check "judge design session (3 words): lexical arm off, FTS hit first" "a_phrase" "$(at A three-words 1)"
check "judge design session: 'Judge' (no FTS match, no embedding) not returned" "0" \
  "select count(*) from cls where mode = 'rls' and who = 'A' and label = 'three-words' and k = 'a_exact'"
check "judge design session: vector-only rows (cap 12)" "12" \
  "select count(*) from cls where mode = 'rls' and who = 'A' and label = 'three-words' and $vec_only"
check "50%: % is literal — '50% done report' first" "a_pct" "$(at A pct 1)"
check "50%: '5000 widgets' not returned" "0" \
  "select count(*) from cls where who = 'A' and label = 'pct' and k = 'a_5000'"
check "B judge: B's own exact title first" "b_exact" "$(at B judge 1)"
check "no trashed row in any result (either mode)" "0" "select count(*) from cls where trashed"
check "trashed: A's search for 'trashed' finds none of the three trashed rows" "0" \
  "select count(*) from cls where label = 'trashed' and k like 'a_trash%'"
check "no other user's row in any result, either mode (A sees only A, B only B)" "0" \
  "select count(*) from cls where owner is distinct from who"
check "super mode (RLS off) returns exactly the rls ranking" "0" \
  "select count(*) from (select who, label, pos, entity_id from cls where mode = 'rls' and label in ('judge', 'trashed', 'pct')
                         except select who, label, pos, entity_id from cls where mode = 'super') d"
check "super mode: same row counts as rls" "true" \
  "select (select count(*) from cls where mode = 'super') = (select count(*) from cls where mode = 'rls' and label in ('judge', 'trashed', 'pct'))"
check "signature unchanged" "query_text text, query_embedding vector, match_limit integer" \
  "select pg_get_function_identity_arguments('public.search_hybrid'::regproc)"
check "result type unchanged" "TABLE(entity_type text, entity_id uuid, title text, snippet text, score double precision)" \
  "select pg_get_function_result('public.search_hybrid'::regproc)"
check "security invoker, stable, one overload" "false/s/1" \
  "select prosecdef::text || '/' || provolatile::text || '/' || (select count(*) from pg_proc where proname = 'search_hybrid' and pronamespace = 'public'::regnamespace) from pg_proc where oid = 'public.search_hybrid'::regproc"
check "match_limit default still 20" "20" \
  "select pg_get_expr(proargdefaults, 0) from pg_proc where oid = 'public.search_hybrid'::regproc"
}
echo 'rollback;'
} > "$TMP/fix5.sql"

OUT=$(psql "$DB_URL" -X -q -At -F '|' -f "$TMP/fix5.sql" 2>&1)
RC=$?
if [ $RC -ne 0 ]; then
  printf '%s\n' "$OUT" >&2
  echo "psql failed (exit $RC)" >&2
  exit 2
fi

if [ "$SHOW" = 1 ]; then
  last=""
  while IFS='|' read -r tag label row; do
    [ "$tag" = T ] || continue
    if [ "$label" != "$last" ]; then printf '\n-- %s   (pos  row  type  title  score  F=fts L=lexical V=within 0.35)\n' "$label"; last=$label; fi
    printf '   %s\n' "$row"
  done <<< "$OUT"
  echo
fi

printf '== search_hybrid (FIX-5 / J-7)\n'
while IFS='|' read -r tag name want got; do
  [ "$tag" = C ] || continue
  if [ "$want" = "$got" ]; then ok "$name -> $got"; else bad "$name -> got '$got', want '$want'"; fi
done <<< "$OUT"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
