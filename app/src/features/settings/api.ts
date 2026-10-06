import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { appZone } from '../../lib/appZone'

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
}

/** GitHub's real state, read off the row github-sync keeps: status flips to 'failing' on a 401,
 * synced_at is stamped only after a sync that went through (so a stale date shows a stuck sync). */
export function githubState(github?: Pick<IntegrationStatus, 'status' | 'synced_at'>): { text: string; tone: 'ok' | 'bad' | 'off' } {
  if (!github) return { text: 'Not connected', tone: 'off' }
  if (github.status === 'failing') return { text: 'Token expired — reconnect', tone: 'bad' }
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
        .select('provider, updated_at, login:data->>login, status:data->>status, synced_at:data->>synced_at')
      if (error) throw error
      return data as IntegrationStatus[]
    },
  })
}

// ── P6: GitHub connect / sync / disconnect ──

const GITHUB_ERRORS: Record<string, string> = {
  bad_request: 'That doesn’t look like a token, or a repo isn’t written as owner/name (max 10).',
  invalid_token: 'GitHub didn’t accept that token.',
  repo_not_found: 'The token can’t see one of those repos',
  token_expired: 'The token has expired — reconnect with a new one.',
  not_connected: 'GitHub isn’t connected.',
  github_unavailable: 'Couldn’t reach GitHub — try again in a minute.',
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
}

export interface GithubSyncResult {
  fetched: number
  new: number
  updated: number
  dismissed: number
}

export async function syncGithub(): Promise<GithubSyncResult> {
  const { data, error } = await supabase.functions.invoke('github-sync', { body: { action: 'sync' } })
  refresh() // a 401 during sync flips the row to 'failing' — show it either way
  if (error) throw new Error(await githubErrorMessage(error))
  return data as GithubSyncResult
}

/** Stores the token server-side (github-connect), then runs a first sync. */
export async function connectGithub(token: string, repos: string): Promise<{ login: string }> {
  const { data, error } = await supabase.functions.invoke('github-connect', { body: { token, repos } })
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
