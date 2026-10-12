import { create } from 'zustand'
import { MAX_PAGES } from './paperMath'
import { imageFiles } from './image'
import { isCapacitorShell } from '../../lib/platform'

// Paper capture's screen state (Paper Capture.dc.html 11a–11m). One flow at a time, mounted once in
// AppLayout (PaperHost), opened from the capture sheet's camera, Inbox → Scan paper, a drop or a paste.

export interface PageDraft {
  id: string
  file: Blob
  /** An object URL for the quick look and, after reading, the crops — no download of our own upload. */
  url: string
  rotation: number
}

/** "Bring back your ticks" (11l): the Notebook page a photo is of — its day, the tasks it listed, and
 * the rest of its print (so the page's own headings aren't proposed as new lines). */
export interface TicksTarget {
  day: string
  /** "Saturday’s page" */
  label: string
  tasks: { id: string; title: string }[]
  printed: string[]
}

export type Stage =
  | { kind: 'look'; ticks?: TicksTarget }
  | { kind: 'reading'; captureId: string; read: number; total: number }
  /** `only`: just these lines (`page:index`) — the new scribbles left after the ticks review. */
  | { kind: 'results'; captureId: string; only?: string[] }
  | { kind: 'unreadable'; captureId: string }
  | { kind: 'failed'; captureId: string }
  | { kind: 'limit' }
  | { kind: 'denied' }
  | { kind: 'photo'; captureId: string; page: number; back?: Stage }

interface PaperState {
  stage: Stage | null
  pages: PageDraft[]
  active: number
  /** "Leave it reading": the flow is hidden while the read goes on; a toast brings it back. */
  away: boolean
  /** Pages saved on this device while offline (the "2 pages waiting" chip and the capture dot). */
  waiting: number
  /** Object URLs of pages this device uploaded, by capture — the results sheet reads these first. */
  local: Record<string, string[]>
  /** Captures that are photos of a Notebook page (this session): their results are the ticks review. */
  ticksFor: Record<string, TicksTarget>
  addFiles: (files: File[], ticks?: TicksTarget) => void
  show: (stage: Stage | null) => void
  close: () => void
}

export const usePaperStore = create<PaperState>((set, get) => ({
  stage: null,
  pages: [],
  active: 0,
  away: false,
  waiting: 0,
  local: {},
  ticksFor: {},
  addFiles: (files, ticks) => {
    const s = get()
    const look = s.stage?.kind === 'look' ? s.stage : null
    const fresh = look ? s.pages : []
    const room = MAX_PAGES - fresh.length
    const added = files.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), rotation: 0 }))
    if (!added.length) return
    // Another page for the same look keeps its ticks; a new flow is a Notebook page only when it says so.
    set({ stage: { kind: 'look', ticks: look ? look.ticks : ticks }, pages: [...fresh, ...added], active: fresh.length, away: false })
  },
  show: (stage) => set({ stage, away: false }),
  close: () => set({ stage: null, away: false }),
}))

/** Opens the system camera (`camera`) or the photo picker (`gallery`). A plain file input — it works in
 * the Android WebView (Capacitor hands `capture` to the camera app) and in the PWA. A camera the user
 * has switched off for the app shows 11k instead, where the gallery still works. `ticks`: the photo is
 * of a Notebook page (11l) — its results are the ticks review. */
export async function pickPhotos(source: 'camera' | 'gallery', ticks?: TicksTarget): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  if (source === 'camera') {
    // A browser where the camera is blocked for the app says so only here (the input just closes).
    // Quick, so the click's user activation still holds for input.click() below. The Android shell
    // opens the camera app through an intent that needs no permission of ours, so it isn't asked.
    let state: PermissionState | null = null
    try {
      if (!isCapacitorShell()) state = (await navigator.permissions?.query({ name: 'camera' as PermissionName }))?.state ?? null
    } catch {
      // 'camera' isn't a queryable permission here (Safari, Firefox): just open the input.
    }
    if (state === 'denied') {
      usePaperStore.getState().show({ kind: 'denied' })
      return
    }
    input.setAttribute('capture', 'environment') // the attribute: desktop Chrome has no .capture property
  }
  input.style.display = 'none'
  input.onchange = () => {
    const files = imageFiles(input.files)
    input.remove()
    if (files.length) usePaperStore.getState().addFiles(files, ticks)
  }
  input.oncancel = () => input.remove()
  document.body.append(input)
  input.click()
}
