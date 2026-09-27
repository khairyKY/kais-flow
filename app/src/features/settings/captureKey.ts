// P6 step 7: the personal capture key behind `supabase/functions/capture` (migration 0041).
// The key is made here, shown once, and only its SHA-256 is saved. Saved with an awaited write,
// not the outbox (deviation from the outbox rule, on purpose): a key shown before it is stored
// would look usable and silently fail from a queued-offline write.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'

export interface CaptureKeyRow {
  id: string
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export const CAPTURE_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/capture`

export function useCaptureKey() {
  return useQuery({
    queryKey: ['capture_keys'],
    queryFn: async () => {
      const { data, error } = await supabase.from('capture_keys').select('id, created_at, updated_at, last_used_at').maybeSingle()
      if (error) throw error
      return data as CaptureKeyRow | null
    },
  })
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** `kf_` + 32 random bytes as base64url (43 chars) — the shape the function accepts. */
export function newCaptureKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return 'kf_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Makes (or replaces) this user's key; resolves to the key, which is never readable again. */
export async function createCaptureKey(): Promise<string> {
  const key = newCaptureKey()
  const { error } = await supabase.from('capture_keys').upsert({ key_hash: await sha256Hex(key) }, { onConflict: 'user_id' })
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['capture_keys'] })
  return key
}

export async function deleteCaptureKey(id: string): Promise<void> {
  const { error } = await supabase.from('capture_keys').delete().eq('id', id)
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['capture_keys'] })
}

/** A bookmarklet that sends the current page (selection, else title + URL) to the Inbox. */
export function bookmarklet(key: string): string {
  const js = `(()=>{const s=String(getSelection()).trim();fetch(${JSON.stringify(CAPTURE_URL)},{method:'POST',headers:{Authorization:'Bearer ${key}','Content-Type':'application/json'},body:JSON.stringify({text:s||document.title||location.href,url:location.href})}).then(r=>alert(r.ok?'Sent to your Kai\\u2019s Flow inbox \\u273F':'Capture failed ('+r.status+')'))})()`
  return 'javascript:' + encodeURIComponent(js)
}
