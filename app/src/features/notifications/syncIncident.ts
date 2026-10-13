import { syncNotice, type Notice } from '../../../../supabase/functions/notify/copy.ts'
import type { SyncView } from '../../components/syncQueue'

// Sync problem (Tray and Notifications.dc.html 12k): changes stuck on this device. Client-side only —
// the server can't see a phone's outbox. The topbar and the tray K already show it while you look
// (components/syncQueue.ts, 12a "Changes waiting"); this says it once when nobody is looking and it
// doesn't clear by itself. Pure; TrayBridge feeds it the shared sync status every minute.

/** ponytail: calibration knob — long enough that a lift or a train tunnel never notifies. */
export const SYNC_PERSIST_MS = 5 * 60_000

/** One incident: from the status turning troubled until it's calm again. */
export interface SyncIncident {
  since: number | null
  told: boolean
}
export const NO_INCIDENT: SyncIncident = { since: null, told: false }

/** Offline with changes waiting, a write slow to go (syncing), or writes the server set aside (parked). */
const troubled = (v: SyncView) => v.kind === 'parked' || v.kind === 'syncing' || (v.kind === 'offline' && v.n > 0)

/** One step: the notice to show now, if any — once per incident, after it has lasted SYNC_PERSIST_MS,
 * and only while nobody is looking at the app (backgrounded, in the tray, a hidden tab). */
export function syncIncidentStep(m: SyncIncident, v: SyncView, now: number, looking: boolean): { memory: SyncIncident; notice: Notice | null } {
  if (!troubled(v)) return { memory: NO_INCIDENT, notice: null }
  const since = m.since ?? now
  const tell = !m.told && !looking && now - since >= SYNC_PERSIST_MS
  return { memory: { since, told: m.told || tell }, notice: tell ? syncNotice(Math.max(1, v.n), v.kind === 'parked') : null }
}
