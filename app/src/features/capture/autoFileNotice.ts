import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAppSettings } from '../../lib/settings'
import { toastAction } from '../../lib/undo'
import { markSeen, mergeSeen, useHelp } from '../tour/help'
import type { AppSettings } from '../../lib/types'

// Queue item 7 (Kai 2026-10-23): captures stopped filing themselves ("File captures for me" is off by
// default, migration 0086). Someone who knew the old way is told once — on whichever device opens
// first (help_seen syncs, the 0058 pattern); a new account never had it, so is never told.

/** Accounts made before the change knew the old way. ponytail: a fixed day, not a per-user flag — a
 * user who signs up between this day and the release just misses one toast. */
const CHANGED_ON = '2026-10-26'

/** The one-time key, kept in help_seen like the tour's. */
export const AUTOFILE_NOTICE = 'notice:autofile'

/** Owed the notice: the server knows the setting, it's off, the account predates it, and it wasn't told. */
export function owesAutoFileNotice(row: AppSettings | undefined, seen: ReadonlySet<string>): boolean {
  return !!row && 'auto_file_captures' in row && row.auto_file_captures !== true && !!row.onboarded_at && row.onboarded_at < CHANGED_ON && !seen.has(AUTOFILE_NOTICE)
}

/** AppLayout: the notice, once, with a way to the switch. */
export function useAutoFileNotice(): void {
  const { data } = useAppSettings()
  const { uid, local } = useHelp()
  const navigate = useNavigate()
  useEffect(() => {
    if (!uid || !owesAutoFileNotice(data, mergeSeen(local, data?.help_seen))) return
    markSeen(AUTOFILE_NOTICE)
    toastAction('Captures now wait in your Inbox — the AI’s guess is one tap away.', 'Settings', () => {
      navigate('/settings/capture')
    })
  }, [uid, local, data, navigate])
}
