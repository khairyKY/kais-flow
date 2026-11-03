import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { authLinkOrigin } from '../../lib/platform'
import { syncedLabel } from './api'
import type { CourseRef } from '../../../../supabase/functions/_shared/classroom.ts'

// Google Classroom (Kai 2026-11-03): the student's deadlines as tasks. The OAuth dance runs in
// classroom-connect (the refresh token never reaches the client); classroom-sync reads every 3 hours and on
// "Sync now". Its own consent and its own integrations row, apart from Google Calendar's. Here: the row's
// state, and the actions.

export interface ClassroomStatus {
  updated_at: string
  /** 'failing' after Google refused the stored grant (expired — a Testing-mode consent lasts 7 days — or revoked). */
  status: 'ok' | 'failing' | null
  synced_at: string | null
  /** Every active course the account is in, and the ids that sync. Non-secret. */
  courses: CourseRef[] | null
  chosen: string[] | null
}

export function useClassroom() {
  return useQuery({
    queryKey: ['integrations', 'classroom'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('updated_at, status:data->>status, synced_at:data->>synced_at, courses:data->courses, chosen:data->chosen')
        .eq('provider', 'classroom')
        .maybeSingle()
      if (error) throw error
      return data as ClassroomStatus | null
    },
  })
}

export function classroomState(row?: Pick<ClassroomStatus, 'status' | 'synced_at'> | null): { text: string; tone: 'ok' | 'bad' | 'off' } {
  if (!row) return { text: 'Not connected', tone: 'off' }
  if (row.status === 'failing') return { text: 'Access expired — reconnect', tone: 'bad' }
  if (!row.synced_at) return { text: 'Connected · not synced yet', tone: 'ok' }
  return { text: `Connected · synced ${syncedLabel(row.synced_at)}`, tone: 'ok' }
}

const ERRORS: Record<string, string> = {
  bad_request: 'That didn’t save — try again.',
  not_connected: 'Google Classroom isn’t connected.',
  token_expired: 'Google access has expired — reconnect.',
  blocked: 'Google Classroom refused access. If this is a school account, its administrator may have blocked outside apps — ask them to allow Kai’s Flow.',
  google_unavailable: 'Couldn’t reach Google — try again in a minute.',
  busy: 'That crossed paths with a sync — try again.',
}

/** Where Google sends the browser back (classroom-connect's redirect): Settings with ?classroom=connected,
 * or ?classroom=error&reason=<code>. */
export const CLASSROOM_RETURN: Record<string, string> = {
  connected: 'Connected. Your courses are syncing now.',
  denied: 'Google Classroom wasn’t connected — the consent page was cancelled.',
  admin_blocked: 'Your school’s Google administrator has blocked outside apps from Classroom. Ask them to allow Kai’s Flow, or use a personal Google account.',
  scope_missing: 'Google Classroom wasn’t connected — leave all three Classroom boxes ticked on Google’s page.',
  no_refresh_token: 'Google didn’t give lasting access. Remove Kai’s Flow at myaccount.google.com/permissions, then connect again.',
  bad_state: 'That sign-in link expired — press Connect again.',
  not_configured: 'Google isn’t set up on the server yet (docs/GOOGLE-SETUP.md).',
  google_unavailable: 'Couldn’t reach Google — try again in a minute.',
}

async function errorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (body?.error && ERRORS[body.error]) return ERRORS[body.error]
    // The gateway's own 404: the functions were never deployed.
    if (res.status === 404) return 'Google Classroom isn’t on the server yet — classroom-connect and classroom-sync need deploying (docs/GOOGLE-SETUP.md).'
  }
  return 'Something went wrong — try again.'
}

function refresh() {
  void queryClient.invalidateQueries({ queryKey: ['integrations'] })
  void queryClient.invalidateQueries({ queryKey: ['tasks'] })
  void queryClient.invalidateQueries({ queryKey: ['projects'] })
  void queryClient.invalidateQueries({ queryKey: ['domains'] })
}

/** Google's consent page to go to, or — until the secrets are set — which ones are missing. */
export async function startClassroom(): Promise<{ url: string } | { missing: string[] }> {
  const { data, error } = await supabase.functions.invoke('classroom-connect', { body: { action: 'start', origin: authLinkOrigin() } })
  if (error) throw new Error(await errorMessage(error))
  return data as { url: string } | { missing: string[] }
}

export interface ClassroomSyncResult {
  courses: number
  fetched: number
  new: number
  updated: number
  done: number
  trashed: number
}

export async function syncClassroom(): Promise<ClassroomSyncResult> {
  const { data, error } = await supabase.functions.invoke('classroom-sync', { body: { action: 'sync' } })
  refresh() // a dead grant flips the row to 'failing' — show it either way
  if (error) throw new Error(await errorMessage(error))
  return data as ClassroomSyncResult
}

/** Re-reads the account's course list (a class joined since connecting). */
export async function refreshClassroomCourses(): Promise<void> {
  const { error } = await supabase.functions.invoke('classroom-connect', { body: { action: 'courses' } })
  refresh()
  if (error) throw new Error(await errorMessage(error))
}

/** Which courses sync. Shown at once; a newly ticked one syncs now. Unticking stops syncing and keeps what
 * already came in. A failed save puts back what the server has. */
export async function chooseClassroomCourses(chosen: string[], prior: readonly string[]): Promise<void> {
  queryClient.setQueryData<ClassroomStatus | null>(['integrations', 'classroom'], (row) => (row ? { ...row, chosen } : row))
  const { error } = await supabase.functions.invoke('classroom-connect', { body: { action: 'choose', ids: chosen } })
  refresh()
  if (error) throw new Error(await errorMessage(error))
  if (chosen.some((id) => !prior.includes(id))) await syncClassroom().catch(() => undefined)
}

/** Revokes the grant and removes the row (server-side). `remove`: the imported tasks and course projects go to
 * Trash too; otherwise they stay (and reconnecting finds them again, no duplicates). */
export async function disconnectClassroom(remove: boolean): Promise<{ removed: number }> {
  const { data, error } = await supabase.functions.invoke('classroom-connect', { body: { action: 'disconnect', remove } })
  refresh()
  if (error) throw new Error(await errorMessage(error))
  return { removed: (data as { removed?: number }).removed ?? 0 }
}

export const classroomSyncLine = (r: ClassroomSyncResult) =>
  `Synced · ${r.courses} ${r.courses === 1 ? 'course' : 'courses'} · ${r.new} new · ${r.updated} changed · ${r.done} handed in · ${r.trashed} gone`
