import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { openCapture } from '../command-bar/commandBarStore'

// Today.dc.html 1a header CTA (kit Button "cta") on Today, Tasks and Inbox — desktop only (a phone
// has the tab bar's capture button). Kai 2026-10-07: it was "Voice capture", voice only; now one
// Capture that opens the capture bar with the cursor in the field — type, or tap the bar's mic to
// dictate into it. The kf plus (the sidebar's "Capture ⌘K" row draws a plus too) in currentColor,
// so it takes the CTA's --on-terra ink.
export function CaptureCta() {
  return (
    <Button type="button" variant="cta" icon={<Icon name="plus" size={16} />} onClick={openCapture} title="Capture — type, or use the mic to talk (⌘K)">
      Capture
    </Button>
  )
}
