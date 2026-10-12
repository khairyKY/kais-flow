import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { appZone } from '../../lib/appZone'
import { readRules, type GithubRules } from '../../../../supabase/functions/_shared/github.ts'

// integrations.data holds provider tokens server-side only (docs/DATA_MODEL.md) — the client
// never selects `data` itself, only connection status plus the named non-secret fields below
// (PostgREST returns just those JSON paths, so the token never reaches client state).
export interface IntegrationStatus {
  provider: 'google' | 'github'
  updated_at: string
  /** GitHub: the account the token belongs to. */
  login: string | null
  /** GitHub: 'failing' after the API answered 401 (expired/revoked token). */
  status: 'ok' | 'failing' | null
  /** GitHub: when the last successful sync started. */
  synced_at: string | null
  /** GitHub: the watched repos ('owner/name'). Non-secret, like the three above. */
  repos?: string[] | null
  /** GitHub: Settings 2a's rules; null until they're first saved (= the behaviour from before). */
  rules?: Partial<GithubRules> | null
}

/** The GitHub row's watched repos and rules, defaults filled in. `legacy`: the rules were never
 * saved, so issues assigned to you anywhere still come in on top of the watched repos. */
export function githubRulesOf(github?: Pick<IntegrationStatus, 'repos' | 'rules'>): { repos: string[]; rules: GithubRules; legacy: boolean } {
  return { repos: github?.repos ?? [], rules: readRules(github?.rules), legacy: github?.rules == null }
}

/** The Watching row's one help line: exactly what comes in, in each state. */
export function watchingHelp({ repos, legacy }: { repos: readonly string[]; legacy: boolean }): string {
  if (repos.length === 0) return 'None picked: every open issue assigned to you'
  return legacy ? 'Every open issue in these, plus any assigned to you' : 'Every open issue in these repos, and nothing else'
}

/** GitHub's real state, read off the row github-sync keeps: status flips to 'failing' on a 401,
 * synced_at is stamped only after a sync that went through (so a stale date shows a stuck sync). */
export function githubState(github?: Pick<IntegrationStatus, 'status' | 'synced_at' | 'rules'>): { text: string; tone: 'ok' | 'bad' | 'off' } {
  if (!github) return { text: 'Not connected', tone: 'off' }
  if (github.status === 'failing') return { text: 'Token expired — reconnect', tone: 'bad' }
  if (readRules(github.rules).paused) return { text: 'Paused', tone: 'off' }
  if (!github.synced_at) return { text: 'Connected · not synced yet', tone: 'ok' }
  const at = new Date(github.synced_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: appZone() })
  return { text: `Connected · synced ${at}`, tone: 'ok' }
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('provider, updated_at, login:data->>login, status:data->>status, synced_at:data->>synced_at, repos:data->repos, rules:data->rules')
      if (error) throw error
      return data as IntegrationStatus[]
    },
  })
}

// ── P6: GitHub connect / sync / disconnect ──

const GITHUB_ERRORS: Record<string, string> = {
  bad_request: 'That doesn’t look like a token.',
  invalid_token: 'GitHub didn’t accept that token.',
  token_expired: 'The token has expired — reconnect with a new one.',
  not_connected: 'GitHub isn’t connected.',
  github_unavailable: 'Couldn’t reach GitHub — try again in a minute.',
  paused: 'GitHub is paused — turn Pause off to sync again.',
  busy: 'That crossed paths with a sync — try again.',
}

/** The edge functions answer stable codes; turn one into a sentence. */
async function githubErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await (error.context as Response).json().catch(() => null)) as { error?: string; repo?: string } | null
    const msg = body?.error ? GITHUB_ERRORS[body.error] : undefined
    if (msg) return body?.repo ? `${msg}: ${body.repo}` : msg
  }
  return 'Something went wrong — try again.'
}

function refresh() {
  void queryClient.invalidateQueries({ queryKey: ['integrations'] })
  void queryClient.invalidateQueries({ queryKey: ['inbox_items'] })
  void queryClient.invalidateQueries({ queryKey: ['tasks'] })
}

export interface GithubSyncResult {
  fetched: number
  new: number
  updated: number
  dismissed: number
  /** Tasks that landed "Straight to Tasks" and were ticked off because their issue closed. */
  completed?: number
}

export async function syncGithub(): Promise<GithubSyncResult> {
  const { data, error } = await supabase.functions.invoke('github-sync', { body: { action: 'sync' } })
  refresh() // a 401 during sync flips the row to 'failing' — show it either way
  if (error) throw new Error(await githubErrorMessage(error))
  return data as GithubSyncResult
}

/** Stores the token server-side (github-connect), then runs a first sync. A reconnect keeps the
 * watched repos and rules already saved. */
export async function connectGithub(token: string): Promise<{ login: string }> {
  const { data, error } = await supabase.functions.invoke('github-connect', { body: { token } })
  if (error) throw new Error(await githubErrorMessage(error))
  refresh()
  await syncGithub().catch(() => undefined) // the row's status/synced time tells the rest
  return data as { login: string }
}

export async function disconnectGithub(): Promise<void> {
  // Server-side table, not outbox-tracked; RLS scopes the delete to the caller's own row.
  const { error } = await supabase.from('integrations').delete().eq('provider', 'github')
  if (error) throw error
  refresh()
}

// ── Settings 2a: "Rules · how GitHub lands" ──

/** The repos the stored token can see, for "+ add repo" — listed by github-connect, so the token
 * never reaches the client. Fetched once a session, when the rules panel first shows. */
export function useGithubRepos(enabled: boolean) {
  return useQuery({
    queryKey: ['github_repos'],
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('github-connect', { body: { action: 'repos' } })
      if (error) throw new Error(await githubErrorMessage(error))
      return (data as { repos: string[] }).repos
    },
  })
}

/** Saves the whole rules state (server-side: the client can't write `data` without the token). Shows
 * it at once; a failed save puts back what the server has and throws the sentence to show. A newly
 * watched repo starts a sync, so its open issues arrive now rather than at the next half hour. */
export async function saveGithubRules(repos: string[], rules: GithubRules, prior: readonly string[]): Promise<void> {
  queryClient.setQueryData<IntegrationStatus[]>(['integrations'], (rows) =>
    rows?.map((r) => (r.provider === 'github' ? { ...r, repos, rules } : r)),
  )
  const { error } = await supabase.functions.invoke('github-connect', { body: { action: 'rules', repos: repos.join(','), rules } })
  if (error) {
    void queryClient.invalidateQueries({ queryKey: ['integrations'] })
    throw new Error(await githubErrorMessage(error))
  }
  if (!rules.paused && repos.some((r) => !prior.includes(r))) void syncGithub().catch(() => undefined)
}
