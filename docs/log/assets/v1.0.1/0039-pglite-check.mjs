// 0039 check without Docker: `npm i @electric-sql/pglite@0.2` in a scratch dir, then `node 0039-pglite-check.mjs`. Seeds + real rows, runs the purge twice, asserts only seeds go.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
const db = new PGlite()
const S = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}`
const P = (n) => `20000000-0000-0000-0000-00000000000${n}`
const FAM = '38eba7de-b9fb-4b84-9369-5730721bede3', WORK = 'f6d73143-a19c-4d8e-974c-9ca5e4663f2e'
await db.exec(`
create table domains (id uuid primary key, name text);
create table projects (id uuid primary key, name text, domain_id uuid references domains(id) on delete set null);
create table tasks (id uuid primary key, title text, project_id uuid references projects(id) on delete set null, domain_id uuid references domains(id) on delete set null);
create table time_entries (id uuid default gen_random_uuid(), project_id uuid, task_id uuid);
create table areas (id uuid, domain_id uuid); create table routines (id uuid, domain_id uuid);
create table books (id uuid primary key); create table quotes (id uuid primary key); create table notes (id uuid primary key, domain_id uuid);
create table commentary (id uuid default gen_random_uuid(), parent_id uuid);
create table journal_entries (id uuid default gen_random_uuid(), entry_date date, body text);
create table people (id uuid primary key, domain_id uuid); create table interactions (id uuid default gen_random_uuid(), person_id uuid references people(id) on delete cascade);
create table activity_log (id uuid default gen_random_uuid(), entity_id uuid);
insert into domains values ('${FAM}','Family'),('${WORK}','Work'),('aaaaaaaa-0000-0000-0000-000000000001','Real');
insert into projects values ('${S(8)}','Forecasting App',null),('aaaaaaaa-0000-0000-0000-000000000002','Real project','aaaaaaaa-0000-0000-0000-000000000001');
insert into tasks values ('${S(9)}','seed',${`'${S(8)}'`},null),('aaaaaaaa-0000-0000-0000-000000000003','tetst','${S(8)}',null),('aaaaaaaa-0000-0000-0000-000000000004','real','aaaaaaaa-0000-0000-0000-000000000002',null);
insert into time_entries (project_id) values ('${S(8)}'),('aaaaaaaa-0000-0000-0000-000000000002');
insert into books values ('${S(1)}'),('aaaaaaaa-0000-0000-0000-000000000005');
insert into quotes values ('${S(2)}'),('${S(3)}'),('${S(4)}'); insert into notes values ('${S(5)}',null),('${S(6)}',null),('${S(7)}',null),('aaaaaaaa-0000-0000-0000-000000000006',null);
insert into commentary (parent_id) values ('${S(2)}'),('aaaaaaaa-0000-0000-0000-000000000006');
insert into journal_entries (entry_date, body) values ('2026-07-10','The forecasting build finally clicked this morning. xyz'),('2026-07-10','My own real entry');
insert into people values ${[1,2,3,4,5,6].map(n=>`('${P(n)}','${FAM}')`).join(',')},('aaaaaaaa-0000-0000-0000-000000000007',null);
insert into interactions (person_id) values ('${P(1)}'),('${P(2)}'),('aaaaaaaa-0000-0000-0000-000000000007');
insert into activity_log (entity_id) values ('${S(8)}'),('${P(3)}'),('aaaaaaaa-0000-0000-0000-000000000004');`)
const sql = readFileSync('D:/Coding/kais-flow/supabase/migrations/0039_purge_sample_seed.sql','utf8')
await db.exec(sql); await db.exec(sql)
const c = async (t) => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n
const got = {}; for (const t of ['domains','projects','tasks','time_entries','books','quotes','notes','commentary','journal_entries','people','interactions','activity_log']) got[t] = await c(t)
const tetst = (await db.query(`select project_id from tasks where title='tetst'`)).rows[0]
const want = {domains:1,projects:1,tasks:2,time_entries:1,books:1,quotes:0,notes:1,commentary:1,journal_entries:1,people:1,interactions:1,activity_log:1}
console.log(JSON.stringify({got, tetst}))
const ok = JSON.stringify(got) === JSON.stringify(want) && tetst && tetst.project_id === null
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
