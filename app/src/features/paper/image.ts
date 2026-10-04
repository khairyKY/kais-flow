// Paper capture: a picked photo → the page we upload. Canvas only, no library: the long edge to 1600px,
// the quick look's rotation baked in, JPEG stepped down until it's ~250 KB (paperMath has the numbers).
import { fitWithin, QUALITIES, rotatedSize, TARGET_BYTES } from './paperMath'

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality))
}

/** Decodes `file` (EXIF orientation applied), turns it `rotation`°, resizes and re-encodes it. Throws
 * for a file the browser can't decode (HEIC on most desktops, a PDF). */
export async function preparePage(file: Blob, rotation: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const drawn = fitWithin(bitmap.width, bitmap.height)
  const out = rotatedSize(drawn.w, drawn.h, rotation)
  const canvas = document.createElement('canvas')
  canvas.width = out.w
  canvas.height = out.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.fillStyle = '#fff' // a transparent PNG reads as black once it's a JPEG
  ctx.fillRect(0, 0, out.w, out.h)
  ctx.translate(out.w / 2, out.h / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(bitmap, -drawn.w / 2, -drawn.h / 2, drawn.w, drawn.h)
  bitmap.close()
  let blob: Blob | null = null
  for (const q of QUALITIES) {
    blob = await toBlob(canvas, q)
    if (blob.size <= TARGET_BYTES) break
  }
  return blob!
}

/** Image files from a drop, a paste or a picker (anything else is left out). */
export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return [...(list ?? [])].filter((f) => f.type.startsWith('image/'))
}
