// P6: GitHub issues → Inbox. The pure planning logic plus one fetch wrapper, shared by
// `github-connect` and `github-sync`. No Deno APIs and no npm: imports on purpose —
// app/src/features/settings/githubPlan.test.ts runs this file under the app's vitest.
//
// The token passed to ghGet is a user's PAT: it goes into the Authorization header and nowhere
// else. Never log it, never put it in an error, never return it.

export const GITHUB_API = 'https://api.github.com'
export const MAX_REPOS = 10

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/
const LOGIN_RE = /^[A-Za-z0-9-]{1,39}$/
// GitHub rejects search queries longer than 256 characters.
const Q_MAX = 256
// Pending items missing from the search results are checked one GET each; this caps the calls.
const RECHECK_CAP = 20
// GitHub's search index lags a little; an issue updated just before the last sync may only show
// up in this one.
const WATERMARK_SLACK_MS = 60 * 60 * 1000

/** GET against the GitHub REST API with a user's token. Returns the raw Response. */
export function ghGet(path: string, token: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'kais-flow',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
}

/** "owner/a, owner/b" → ['owner/a', 'owner/b']; '' → []; null when malformed or more than MAX_REPOS. */
export function parseRepos(input: unknown): string[] | null {
  if (input == null || input === '') return []
  if (typeof input !== 'string') return null
  const repos = [...new Set(input.split(',').map((s) => s.trim()).filter(Boolean))]
  if (repos.length > MAX_REPOS || !repos.every((r) => REPO_RE.test(r))) return null
  return repos
}

/** One query for issues assigned to `login`, plus the watched repos packed into as few queries as
 * fit GitHub's 256-char limit (several `repo:` terms in one query are OR'd). `onlyRepos` (the user
 * saved Settings 2a's rules): with repos picked, ONLY those repos — no assignee query; with none
 * picked, the assignee query alone. Rules never saved = the old union (assigned anywhere + repos). */
export function searchQueries(login: string, repos: readonly string[], onlyRepos = false): string[] {
  const base = 'is:open is:issue'
  const assigned = !onlyRepos || !repos.some((r) => REPO_RE.test(r))
  const out = assigned && LOGIN_RE.test(login) ? [`${base} assignee:${login}`] : []
  let terms = ''
  for (const r of repos) {
    if (!REPO_RE.test(r)) continue
    const term = ` repo:${r}`
    if (terms && (base + terms + term).length > Q_MAX) {
      out.push(base + terms)
      terms = ''
    }
    terms += term
  }
  if (terms) out.push(base + terms)
  return out
}

/** The fields of a search-result issue this code reads. */
export interface GhIssue {
  node_id: string
  number: number
  title: string
  html_url: string
  repository_url: string
  updated_at: string
  /** When the issue was opened — the Inbox row's age. */
  created_at?: string
  labels?: ({ name?: string } | string)[]
}

export interface IssuePayload {
  node_id: string
  number: number
  repo: string
  url: string | null
  labels: string[]
  updated_at: string
  /** Absent on rows stored before 2026-10-03 until their issue next changes; the Inbox falls back to
   * when the row arrived. */
  created_at: string | null
}

export function toPayload(issue: GhIssue): IssuePayload {
  return {
    node_id: issue.node_id,
    number: issue.number,
    // https://api.github.com/repos/owner/name → owner/name
    repo: issue.repository_url.split('/repos/')[1] ?? '',
    // Rendered as a link in the Inbox, so only ever a github.com page.
    url: issue.html_url.startsWith('https://github.com/') ? issue.html_url : null,
    labels: (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
    updated_at: issue.updated_at,
    created_at: issue.created_at ?? null,
  }
}

// ── Settings 2a "Rules · how GitHub lands", stored in integrations.data.rules next to data.repos ──

export type GithubLanding = 'inbox' | 'tasks'
export type GithubPriority = 'high' | 'normal' | 'low'
export interface GithubRules {
  /** Where NEW issues land: Inbox letters, or straight into Tasks (unfiled, linked to the issue). */
  land: GithubLanding
  /** Where the GitHub letters sit in the Inbox: above your own captures, below them (as before), or
   * below them folded to the heading. Read by the Inbox; the sync doesn't need it. */
  priority: GithubPriority
  /** Paused: neither the cron nor "Sync now" syncs this user. */
  paused: boolean
}
export const DEFAULT_RULES: GithubRules = { land: 'inbox', priority: 'normal', paused: false }

/** Stored or posted rules → valid rules. Anything missing or unknown falls back to the default, which
 * is the behaviour from before the rules existed. */
export function readRules(raw: unknown): GithubRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    land: r.land === 'tasks' ? 'tasks' : 'inbox',
    priority: r.priority === 'high' || r.priority === 'low' ? r.priority : 'normal',
    paused: r.paused === true,
  }
}

/** A task's external_ref when the sync itself made the task ("Straight to Tasks"). `synced` marks
 * the ones it may tick off when the issue closes; a task filed by hand from the Inbox has none, so it
 * is never touched. repo/number are what the recheck reads; checked_at rotates it like payload's. */
export interface SyncedTaskRef {
  source: 'github'
  id: string
  url: string | null
  repo: string
  number: number
  synced: true
  checked_at?: string
}

/** The issue → landing decision: which table a NEW issue goes to under `rules`, and the row (minus
 * id/user_id). Both keep the node_id in external_ref, which 0027's unique indexes dedupe on. */
export function landing(issue: GhIssue, rules: GithubRules):
  | { table: 'inbox_items'; row: { kind: 'github_issue'; raw_text: string; status: 'pending'; payload: IssuePayload; external_ref: { source: 'github'; id: string } } }
  | { table: 'tasks'; row: { title: string; status: 'todo'; external_ref: SyncedTaskRef } } {
  const p = toPayload(issue)
  if (rules.land === 'tasks') {
    return { table: 'tasks', row: { title: issue.title, status: 'todo', external_ref: { source: 'github', id: p.node_id, url: p.url, repo: p.repo, number: p.number, synced: true } } }
  }
  return { table: 'inbox_items', row: { kind: 'github_issue', raw_text: issue.title, status: 'pending', payload: p, external_ref: { source: 'github', id: p.node_id } } }
}

/** A still-pending github_issue inbox row, as github-sync reads it. */
export interface PendingRow {
  id: string
  raw_text: string
  payload: Record<string, unknown> | null
  external_ref: { id?: string } | null
}

export interface SyncPlan {
  /** Open issues with no inbox row yet (in any status — filed/dismissed/trashed ones are never re-added). */
  insert: GhIssue[]
  /** Pending rows whose issue changed on GitHub since we last stored it. */
  update: { id: string; raw_text: string; payload: Record<string, unknown> }[]
  /** Pending rows whose issue is no longer in the results — closed, deleted, unassigned or no longer
   * watched; github-sync asks GitHub which. Least-recently-checked first, capped. */
  recheck: PendingRow[]
}

/**
 * fetched   — every issue the search queries returned (duplicates across queries are fine)
 * pending   — this user's pending github_issue rows
 * knownIds  — node_ids among `fetched` that already have a row, in ANY status
 * since     — when the last successful sync started (null on the first sync after connecting)
 *
 * The watermark: after the first sync only issues touched since the last one are inserted. A
 * dismissed row composts after 30 days (0032); without this, a still-open issue the user dismissed
 * would come back the sync after it composted. Assigning an issue bumps its updated_at, so newly
 * assigned issues still arrive.
 */
export function planSync(
  fetched: readonly GhIssue[],
  pending: readonly PendingRow[],
  knownIds: ReadonlySet<string>,
  since: string | null,
): SyncPlan {
  const byId = new Map(fetched.map((i) => [i.node_id, i] as const))
  const cutoff = since ? Date.parse(since) - WATERMARK_SLACK_MS : -Infinity
  const insert = [...byId.values()].filter((i) => !knownIds.has(i.node_id) && Date.parse(i.updated_at) >= cutoff)

  const update: SyncPlan['update'] = []
  const recheck: PendingRow[] = []
  for (const row of pending) {
    const issue = byId.get(row.external_ref?.id ?? '')
    if (!issue) recheck.push(row)
    // Any title or label change bumps the issue's updated_at, so that one field is the diff.
    else if (row.payload?.updated_at !== issue.updated_at) {
      update.push({ id: row.id, raw_text: issue.title, payload: { ...row.payload, ...toPayload(issue) } })
    }
  }
  return { insert, update, recheck: staleFirst(recheck) }
}

/** Rows to recheck: never-checked first, then least recently checked, capped (one GET each). */
export function staleFirst<T extends PendingRow>(rows: readonly T[]): T[] {
  const checkedAt = (r: PendingRow) => String(r.payload?.checked_at ?? '')
  return [...rows].sort((a, b) => checkedAt(a).localeCompare(checkedAt(b))).slice(0, RECHECK_CAP)
}
