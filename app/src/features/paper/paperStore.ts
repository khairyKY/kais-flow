import { create } from 'zustand'
import { MAX_PAGES } from './paperMath'
import { imageFiles } from './image'

// Paper capture's screen state (Paper Capture.dc.html 11a–11m). One flow at a time, mounted once in
// AppLayout (PaperHost), opened from the capture sheet's camera, Inbox → Scan paper, a drop or a paste.

export interface PageDraft {
  id: string
  file: Blob
  /** An object URL for the quick look and, after reading, the crops — no download of our own upload. */
  url: string
  rotation: number
}

export type Stage =
  | { kind: 'look' }
  | { kind: 'reading'; captureId: string; read: number; total: number }
  | { kind: 'results'; captureId: string }
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
  addFiles: (files: File[]) => void
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
  addFiles: (files) => {
    const s = get()
    const fresh = s.stage?.kind === 'look' ? s.pages : []
    const room = MAX_PAGES - fresh.length
    const added = files.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), rotation: 0 }))
    if (!added.length) return
    set({ stage: { kind: 'look' }, pages: [...fresh, ...added], active: fresh.length, away: false })
  },
  show: (stage) => set({ stage, away: false }),
  close: () => set({ stage: null, away: false }),
}))

/** Opens the system camera (`camera`) or the photo picker (`gallery`). A plain file input — it works in
 * the Android WebView (Capacitor hands `capture` to the camera app) and in the PWA. A camera the user
 * has switched off for the app shows 11k instead, where the gallery still works. */
export async function pickPhotos(source: 'camera' | 'gallery'): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  if (source === 'camera') {
    // Asked before the input opens: a denied camera only ever says so here (the input just closes).
    // Quick, so the click's user activation still holds for input.click() below.
    const state = await navigator.permissions?.query({ name: 'camera' as PermissionName }).then((p) => p.state, () => null)
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
    if (files.length) usePaperStore.getState().addFiles(files)
  }
  input.oncancel = () => input.remove()
  document.body.append(input)
  input.click()
}
