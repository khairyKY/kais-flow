// The Notebook page's two remembered things: the layout (synced, app_settings.notebook_layout —
// migration 0063 — with a copy on this device) and the "✎ on paper" stamp per day (this device only).
import { useState, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { updateAppSetting, useAppSettings } from '../../lib/settings'
import { parseLayout, type NotebookLayout } from './page'

const layoutKey = (uid: string | undefined) => `kf-notebook-layout:${uid ?? 'anon'}`
const stampKey = (uid: string | undefined) => `kf-notebook-stamps:${uid ?? 'anon'}`

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null // no storage, or a broken value: the default
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked: this session only
  }
}

/** The user's layout and its setter. The server's copy wins once the column exists (another device's
 * edit); until migration 0063 is pushed the row has no `notebook_layout` key and nothing is sent — an
 * unknown column would dead-letter every later settings write (the help_seen pattern, 0058). */
export function useNotebookLayout(): [NotebookLayout, (next: NotebookLayout) => void] {
  const uid = useAuth().session?.user.id
  const { data: settings } = useAppSettings()
  const [local, setLocal] = useState<unknown>(() => readJson(layoutKey(uid)))
  const synced = settings && 'notebook_layout' in settings ? settings.notebook_layout : undefined
  const save = (next: NotebookLayout) => {
    writeJson(layoutKey(uid), next)
    setLocal(next)
    if (synced !== undefined) updateAppSetting('notebook_layout', next)
  }
  return [parseLayout(synced ?? local), save]
}

// ── "✎ on paper": the days this device copied or printed the page (the last 30). ──

const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

function stamps(uid: string | undefined): string[] {
  const v = readJson(stampKey(uid))
  return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : []
}

/** Marks `day` ("YYYY-MM-DD") as on paper. */
export function stampOnPaper(uid: string | undefined, day: string): void {
  const days = stamps(uid)
  if (days.includes(day)) return
  writeJson(stampKey(uid), [...days, day].sort().slice(-30))
  for (const l of listeners) l()
}

/** Was `day`'s page copied or printed on this device? (Today's "✎ on paper" stamp can read this too.) */
export function useOnPaper(day: string): boolean {
  const uid = useAuth().session?.user.id
  return useSyncExternalStore(subscribe, () => stamps(uid).includes(day))
}
