// Journal photos + "Talk it out" — the private `journal` bucket (migration 0060) and the entry's
// `media_paths` / `transcript`. Uploads go straight to Storage like Paper's do; the row change goes
// through the outbox (upsertJournalEntry). The pure half (paths, the media list, transcript joins)
// lives in journalDay.ts, tested there.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { preparePage, imageFiles } from '../paper/image'
import { journalPhotoPath } from './journalDay'

const BUCKET = 'journal'

/** The system picker; `camera` asks for the camera app (the Android shell's WebView only offers the
 * camera when `capture` is set — Paper's pickPhotos does the same). */
export function pickImages(camera: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = !camera
    if (camera) input.setAttribute('capture', 'environment')
    input.style.display = 'none'
    input.onchange = () => {
      const files = imageFiles(input.files)
      input.remove()
      resolve(files)
    }
    input.oncancel = () => {
      input.remove()
      resolve([])
    }
    document.body.append(input)
    input.click()
  })
}

/** Compress (≤1600px, ~250 KB JPEG — Paper's preparePage) and upload. Returns the stored path.
 * Throws `'decode'` for a file the browser can't open, anything else for the upload. */
export async function uploadJournalPhoto(entryId: string, file: File): Promise<string> {
  let blob: Blob
  try {
    blob = await preparePage(file, 0)
  } catch {
    throw new Error('decode')
  }
  const uid = (await supabase.auth.getSession()).data.session?.user.id
  if (!uid) throw new Error('signed out')
  const path = journalPhotoPath(uid, entryId, crypto.randomUUID())
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

export async function deleteJournalPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

/** Short-lived signed URLs for an entry's photos, in `paths` order ('' for one that failed). */
export function useJournalPhotoUrls(paths: string[]): string[] {
  const { data } = useQuery({
    queryKey: ['journal_photo_urls', paths.join(',')],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      if (error) throw error
      return data.map((d) => d.signedUrl ?? '')
    },
  })
  return data ?? []
}
