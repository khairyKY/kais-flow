// Which sharing sheet is open, from anywhere: Settings → Sharing, the People page, the calendar's lane menu, her card on Today,
// a /join/<code> link. One host (./SharingHost, mounted in the shell) draws it.
import { create } from 'zustand'
import type { CalendarEvent } from '../../lib/types'
import type { FreeWindow } from './sharedEvents'

interface SharingUi {
  /** The invite sheet: make a code and send it. */
  invite: boolean
  /** The enter-a-code flow (code, then the confirm step); `code` pre-fills it (a link, a pasted message). */
  enter: { code?: string } | null
  /** One person's page, by circle id. */
  person: string | null
  /** Free together with one person, by circle id. */
  free: string | null
  /** Propose / new shared event: with a free window's time filled in (and her clock, for the hint), or blank. */
  propose: { circleId: string; window?: FreeWindow; partnerZone?: string } | null
  /** "Delete for both" asks first: the shared event it is about. */
  deleteBoth: CalendarEvent | null
  openFree: (circleId: string) => void
  openPropose: (p: { circleId: string; window?: FreeWindow; partnerZone?: string }) => void
  openDeleteBoth: (e: CalendarEvent) => void
  openInvite: () => void
  openEnter: (code?: string) => void
  openPerson: (circleId: string) => void
  close: () => void
}

export const useSharingUi = create<SharingUi>((set) => ({
  invite: false,
  enter: null,
  person: null,
  free: null,
  propose: null,
  deleteBoth: null,
  openFree: (circleId) => set({ free: circleId, propose: null }),
  openPropose: (p) => set({ propose: p, free: null }),
  openDeleteBoth: (e) => set({ deleteBoth: e }),
  openInvite: () => set({ invite: true, enter: null, person: null }),
  openEnter: (code) => set({ enter: { code }, invite: false, person: null }),
  openPerson: (circleId) => set({ person: circleId, invite: false, enter: null }),
  close: () => set({ invite: false, enter: null, person: null, free: null, propose: null, deleteBoth: null }),
}))

// A /join/<code> link followed while signed out (or before the shell was up): the code waits here and survives sign-in.
const JOIN_KEY = 'kf-join-code'
export function stashJoinCode(code: string): void {
  try { localStorage.setItem(JOIN_KEY, code) } catch { /* private window: the link can be followed again */ }
}
export function takeJoinCode(): string | null {
  try {
    const c = localStorage.getItem(JOIN_KEY)
    if (c) localStorage.removeItem(JOIN_KEY)
    return c
  } catch { return null }
}
