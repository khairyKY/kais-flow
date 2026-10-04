import { Suspense, lazy, useEffect, useState } from 'react'
import { usePaperStore } from './paperStore'
import { imageFiles } from './image'
import './paper.css'

// Paper capture's always-mounted half (AppLayout): the desktop drop overlay (11m), and the offline
// queue / resume on boot and reconnect. The screens themselves load only when a flow opens.
const PaperFlow = lazy(() => import('./PaperFlow').then((m) => ({ default: m.PaperFlow })))

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')

export function PaperHost() {
  const open = usePaperStore((s) => s.stage !== null && !s.away)
  const [dropping, setDropping] = useState(false)

  useEffect(() => {
    let stop = () => {}
    let alive = true
    void import('./api').then((m) => {
      if (alive) stop = m.startPaperSync()
    })
    return () => {
      alive = false
      stop()
    }
  }, [])

  useEffect(() => {
    // Only a drag carrying files lights the overlay — moving a task or a link inside the app doesn't.
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDropping(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault() // makes the window a drop target
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDropping(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDropping(false)
      const files = imageFiles(e.dataTransfer?.files)
      if (files.length) usePaperStore.getState().addFiles(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <>
      {dropping && (
        <div className="pp-drop" role="presentation">
          <div className="pp-drop-frame">
            <div className="pp-drop-page" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="pp-title">Drop a page to read it</div>
            <div className="pp-body">Up to 5 pages at once. You’ll see everything before it’s added.</div>
            <div className="pp-meta">JPG · PNG · WEBP</div>
          </div>
        </div>
      )}
      {open && (
        <Suspense fallback={null}>
          <PaperFlow />
        </Suspense>
      )}
    </>
  )
}
