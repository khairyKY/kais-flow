import { useState } from 'react'
import { Button } from '../../components/kit'
import { VoiceCaptureSheet } from './VoiceCaptureSheet'

// Pixel contract: Today.dc.html 1a header CTA (line 132) — mic glyph + pill, kit Button "cta".

function MicIcon() {
  return (
    <svg width="15" height="16" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="var(--paper-parchment)" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke="var(--paper-parchment)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17.5V21M8.5 21h7" stroke="var(--paper-parchment)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function VoiceCaptureButton({ iconOnly }: { iconOnly?: boolean } = {}) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="cta"
        icon={<MicIcon />}
        onClick={() => setSheetOpen(true)}
        title="Voice capture"
        style={{
          cursor: 'pointer',
          ...(iconOnly ? { width: 38, height: 38, padding: 0, justifyContent: 'center' } : null),
        }}
      >
        {!iconOnly && 'Voice capture'}
      </Button>

      <VoiceCaptureSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}

