import { Suspense, lazy, useState } from 'react'
import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
// Punch 5 (bundle): the button sits in page headers (Today, Tasks, Inbox) but the SHEET —
// and the whole capture/zod parse chain behind it — is only needed once you tap the mic.
// (The phone tab bar's capture button is CaptureButton: tap = type, hold = talk.)
const VoiceCaptureSheet = lazy(() => import('./VoiceCaptureSheet').then((m) => ({ default: m.VoiceCaptureSheet })))

// Pixel contract: Today.dc.html 1a header CTA (line 132) — mic glyph + pill, kit Button "cta".
// The glyph is the kf mic in currentColor, so it takes the CTA's --on-terra label ink.

export function VoiceCaptureButton() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="cta"
        icon={<Icon name="mic" size={16} />}
        onClick={() => setSheetOpen(true)}
        title="Voice capture"
      >
        Voice capture
      </Button>

      {sheetOpen && (
        <Suspense fallback={null}>
          <VoiceCaptureSheet open onClose={() => setSheetOpen(false)} />
        </Suspense>
      )}
    </>
  )
}

